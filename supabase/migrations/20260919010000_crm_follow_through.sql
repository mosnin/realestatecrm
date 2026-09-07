CREATE TABLE IF NOT EXISTS "CrmContactLink" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "spaceId" text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "connectionId" text NOT NULL REFERENCES "IntegrationConnection"(id) ON DELETE CASCADE,
  "contactId" text NOT NULL REFERENCES "Contact"(id) ON DELETE CASCADE,
  "externalId" text NOT NULL, "writeBack" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("spaceId","connectionId","externalId"), UNIQUE ("spaceId","connectionId","contactId")
);
CREATE TABLE IF NOT EXISTS "CrmWriteback" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "spaceId" text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "connectionId" text NOT NULL REFERENCES "IntegrationConnection"(id) ON DELETE CASCADE,
  "externalId" text NOT NULL, "activityId" text NOT NULL, body text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','unconfirmed','blocked')),
  "externalNoteId" text, error text, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("spaceId","connectionId","activityId")
);
ALTER TABLE "CrmContactLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CrmWriteback" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "CrmContactLink","CrmWriteback" FROM anon,authenticated;
GRANT ALL ON "CrmContactLink","CrmWriteback" TO service_role;
CREATE INDEX IF NOT EXISTS "CrmWriteback_pending" ON "CrmWriteback" ("createdAt") WHERE status='pending';

CREATE OR REPLACE FUNCTION import_fub_person(p_space_id text,p_connection_id text,p_external_id text,p_name text,p_email text,p_phone text,p_write_back boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE contact_id text; matches bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_space_id||':fub:'||p_external_id,0));
  IF NOT EXISTS(SELECT 1 FROM "IntegrationConnection" WHERE id=p_connection_id AND "spaceId"=p_space_id AND toolkit='follow_up_boss' AND status='active') THEN RAISE EXCEPTION 'Connection unavailable'; END IF;
  SELECT "contactId" INTO contact_id FROM "CrmContactLink" WHERE "spaceId"=p_space_id AND "connectionId"=p_connection_id AND "externalId"=p_external_id;
  IF contact_id IS NOT NULL THEN
    UPDATE "CrmContactLink" SET "writeBack"=p_write_back WHERE "spaceId"=p_space_id AND "connectionId"=p_connection_id AND "externalId"=p_external_id;
    RETURN contact_id;
  END IF;
  -- Exact email matching within this personal workspace only; ambiguity requires
  -- human reconciliation. Never merge across tenant or brokerage boundaries.
  IF nullif(trim(p_email),'') IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_space_id||':email:'||lower(trim(p_email)),0));
    SELECT count(*),min(id) INTO matches,contact_id FROM "Contact" WHERE "spaceId"=p_space_id AND "brokerageId" IS NULL AND lower(email)=lower(trim(p_email));
    IF matches>1 THEN RAISE EXCEPTION 'Multiple local contacts have this email; resolve duplicates first'; END IF;
  END IF;
  IF contact_id IS NULL THEN
    contact_id:=gen_random_uuid()::text;
    INSERT INTO "Contact" (id,"spaceId","brokerageId",name,email,phone,"leadType",type,properties,tags)
      VALUES (contact_id,p_space_id,NULL,p_name,nullif(trim(p_email),''),nullif(trim(p_phone),''),'buyer','QUALIFICATION',ARRAY[]::text[],ARRAY['follow-up-boss']::text[]);
  END IF;
  INSERT INTO "CrmContactLink" ("spaceId","connectionId","contactId","externalId","writeBack") VALUES (p_space_id,p_connection_id,contact_id,p_external_id,p_write_back);
  RETURN contact_id;
END; $$;
REVOKE ALL ON FUNCTION import_fub_person(text,text,text,text,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION import_fub_person(text,text,text,text,text,text,boolean) TO service_role;

CREATE OR REPLACE FUNCTION queue_crm_activity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  -- Only communication/meeting/follow-up activity, not arbitrary private notes.
  IF NEW.type IN ('email','sms','meeting','follow_up') OR (NEW.metadata->>'source'='workflow_scheduled_auto') THEN
    INSERT INTO "CrmWriteback" ("spaceId","connectionId","externalId","activityId",body)
    SELECT NEW."spaceId",l."connectionId",l."externalId",NEW.id::text,left(NEW.content,12000)
      FROM "CrmContactLink" l JOIN "IntegrationConnection" c ON c.id=l."connectionId" AND c."spaceId"=l."spaceId"
      WHERE l."spaceId"=NEW."spaceId" AND l."contactId"=NEW."contactId" AND l."writeBack" AND c.status='active'
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION queue_crm_activity() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS crm_activity_outbox ON "ContactActivity";
CREATE TRIGGER crm_activity_outbox AFTER INSERT ON "ContactActivity" FOR EACH ROW EXECUTE FUNCTION queue_crm_activity();
