-- A dated client commitment is separate from a reminder or an agent draft.
-- Automatic messages use the existing ScheduledMessage dispatcher and its
-- consent, claim, policy and provider acknowledgement boundaries.
CREATE TABLE IF NOT EXISTS "ClientCommitment" (
  id uuid PRIMARY KEY,
  "spaceId" text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "contactId" text NOT NULL REFERENCES "Contact"(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  instruction text NOT NULL CHECK (length(instruction) BETWEEN 1 AND 4000),
  kind text NOT NULL CHECK (kind IN ('commitment','handoff')),
  "dueAt" timestamptz NOT NULL,
  "scheduledMessageId" uuid REFERENCES "ScheduledMessage"(id),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','completed','canceled')),
  "acceptedAt" timestamptz,
  "completedAt" timestamptz,
  "completionNote" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ClientCommitment_due" ON "ClientCommitment" ("spaceId", "dueAt") WHERE status IN ('open','accepted');
ALTER TABLE "ClientCommitment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "ClientCommitment" FROM anon, authenticated;
GRANT ALL ON "ClientCommitment" TO service_role;

CREATE OR REPLACE FUNCTION create_client_commitment(
  p_id uuid, p_space_id text, p_contact_id text, p_title text,
  p_instruction text, p_kind text, p_due_at timestamptz, p_channel text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE existing "ClientCommitment"; message_id uuid;
BEGIN
  -- Serialize retries before inserting either half of the commitment.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  SELECT * INTO existing FROM "ClientCommitment" WHERE id = p_id;
  IF FOUND THEN
    IF existing."spaceId" <> p_space_id OR existing."contactId" <> p_contact_id
      OR existing.title <> p_title OR existing.instruction <> p_instruction
      OR existing.kind <> p_kind OR existing."dueAt" <> p_due_at
      OR (existing."scheduledMessageId" IS NULL) <> (p_channel IS NULL)
      OR (p_channel IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ScheduledMessage" WHERE id=existing."scheduledMessageId" AND channel=p_channel))
    THEN RAISE EXCEPTION 'Request identity already used for another commitment'; END IF;
    RETURN p_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Contact" WHERE id=p_contact_id AND "spaceId"=p_space_id AND "brokerageId" IS NULL) THEN
    RAISE EXCEPTION 'Contact not found in workspace';
  END IF;
  IF p_channel IS NOT NULL THEN
    IF p_kind <> 'commitment' OR p_channel NOT IN ('sms','email') THEN RAISE EXCEPTION 'Invalid automatic commitment'; END IF;
    message_id := gen_random_uuid();
    INSERT INTO "ScheduledMessage" (id,"spaceId",channel,"recipientContactId",instruction,"sendAt",autonomy,status,detail)
      VALUES (message_id,p_space_id,p_channel,p_contact_id,p_instruction,p_due_at,'auto','pending',jsonb_build_object('contentMode','instruction','source','client_commitment','commitmentId',p_id));
  END IF;
  INSERT INTO "ClientCommitment" (id,"spaceId","contactId",title,instruction,kind,"dueAt","scheduledMessageId")
    VALUES (p_id,p_space_id,p_contact_id,p_title,p_instruction,p_kind,p_due_at,message_id);
  RETURN p_id;
END; $$;

CREATE OR REPLACE FUNCTION change_client_commitment(p_space_id text,p_id uuid,p_action text,p_note text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item "ClientCommitment"; message_status text;
BEGIN
  SELECT * INTO item FROM "ClientCommitment" WHERE id=p_id AND "spaceId"=p_space_id;
  IF NOT FOUND THEN RETURN false; END IF;
  -- Same lock order as dispatch + its receipt trigger: scheduled row first.
  IF item."scheduledMessageId" IS NOT NULL THEN
    PERFORM 1 FROM "ScheduledMessage" WHERE id=item."scheduledMessageId" AND "spaceId"=p_space_id FOR UPDATE;
  END IF;
  SELECT * INTO item FROM "ClientCommitment" WHERE id=p_id AND "spaceId"=p_space_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_action='cancel' THEN
    IF item.status='canceled' THEN RETURN true; END IF;
    IF item.status='completed' THEN RAISE EXCEPTION 'Completed work cannot be canceled'; END IF;
    IF item."scheduledMessageId" IS NOT NULL THEN
      SELECT status INTO message_status FROM "ScheduledMessage" WHERE id=item."scheduledMessageId" AND "spaceId"=p_space_id FOR UPDATE;
      IF message_status NOT IN ('pending','failed','drafted','canceled') THEN
        RAISE EXCEPTION 'Delivery has started or completed; cancellation is not confirmed';
      END IF;
      UPDATE "ScheduledMessage" SET status='canceled',"updatedAt"=now() WHERE id=item."scheduledMessageId" AND "spaceId"=p_space_id;
    END IF;
    UPDATE "ClientCommitment" SET status='canceled',"updatedAt"=now() WHERE id=p_id;
  ELSIF p_action='accept' THEN
    IF item.status NOT IN ('open','accepted') THEN RAISE EXCEPTION 'Work is already closed'; END IF;
    UPDATE "ClientCommitment" SET status='accepted',"acceptedAt"=coalesce("acceptedAt",now()),"updatedAt"=now() WHERE id=p_id;
  ELSIF p_action='complete' THEN
    IF item."scheduledMessageId" IS NOT NULL THEN RAISE EXCEPTION 'Automatic work uses its delivery receipt'; END IF;
    IF item.status='canceled' THEN RAISE EXCEPTION 'Canceled work cannot be completed'; END IF;
    IF item.status='completed' THEN RETURN true; END IF;
    IF p_note IS NULL OR length(trim(p_note))=0 THEN RAISE EXCEPTION 'Record the completed outcome'; END IF;
    UPDATE "ClientCommitment" SET status='completed',"completedAt"=coalesce("completedAt",now()),"completionNote"=left(p_note,2000),"updatedAt"=now() WHERE id=p_id;
  ELSE RAISE EXCEPTION 'Invalid action'; END IF;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION create_client_commitment(uuid,text,text,text,text,text,timestamptz,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION change_client_commitment(text,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION create_client_commitment(uuid,text,text,text,text,text,timestamptz,text) TO service_role;
GRANT EXECUTE ON FUNCTION change_client_commitment(text,uuid,text,text) TO service_role;

-- Only acknowledged dispatch marks automatic work complete; failed/drafted
-- rows stay open for the owner. This does not equate sending with client receipt.
CREATE OR REPLACE FUNCTION reconcile_commitment_delivery() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status='sent' AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE "ClientCommitment" SET status='completed',"completedAt"=now(),"updatedAt"=now(),
      "completionNote"='Message sent by the sending service. Client response is not established.'
      WHERE "scheduledMessageId"=NEW.id AND "spaceId"=NEW."spaceId" AND status IN ('open','accepted');
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION reconcile_commitment_delivery() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS commitment_delivery ON "ScheduledMessage";
CREATE TRIGGER commitment_delivery AFTER UPDATE OF status ON "ScheduledMessage"
FOR EACH ROW EXECUTE FUNCTION reconcile_commitment_delivery();
