-- Source lock, tenant proof, clone, and assignment metadata commit together.
-- Install manually according to docs/RELEASE.md before releasing the caller.
ALTER TABLE "ClientCommitment" ADD COLUMN IF NOT EXISTS "brokerageId" text REFERENCES "Brokerage"(id);
CREATE INDEX IF NOT EXISTS "ClientCommitment_brokerage_open" ON "ClientCommitment" ("brokerageId","dueAt") WHERE status IN ('open','accepted');
CREATE OR REPLACE FUNCTION assign_broker_lead(p_brokerage_id text, p_actor_id text, p_contact_id text, p_realtor_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  broker "Brokerage"; lead "Contact"; target_space text; owner_space text;
  target_name text; new_id text := gen_random_uuid()::text; meta jsonb;
BEGIN
  SELECT * INTO broker FROM "Brokerage" WHERE id=p_brokerage_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'status',404,'error','Brokerage not found'); END IF;
  IF broker."ownerId" <> p_actor_id AND NOT EXISTS (
    SELECT 1 FROM "BrokerageMembership" WHERE "brokerageId"=p_brokerage_id AND "userId"=p_actor_id AND role IN ('broker_owner','broker_admin')
  ) THEN RETURN jsonb_build_object('ok',false,'status',403,'error','Broker permission required'); END IF;
  IF NOT EXISTS (SELECT 1 FROM "BrokerageMembership" WHERE "brokerageId"=p_brokerage_id AND "userId"=p_realtor_id) THEN
    RETURN jsonb_build_object('ok',false,'status',403,'error','User is not a member of this brokerage');
  END IF;
  SELECT id INTO owner_space FROM "Space" WHERE "ownerId"=broker."ownerId" ORDER BY "createdAt",id LIMIT 1;
  SELECT id INTO target_space FROM "Space" WHERE "ownerId"=p_realtor_id ORDER BY "createdAt",id LIMIT 1;
  IF target_space IS NULL THEN RETURN jsonb_build_object('ok',false,'status',404,'error','Member does not have a workspace yet'); END IF;
  SELECT * INTO lead FROM "Contact" WHERE id=p_contact_id AND ("spaceId"=owner_space OR "brokerageId"=p_brokerage_id) FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'status',404,'error','Contact not found in your brokerage'); END IF;
  IF 'assigned'=ANY(coalesce(lead.tags,ARRAY[]::text[])) THEN
    BEGIN meta := lead."applicationStatusNote"::jsonb; EXCEPTION WHEN others THEN meta := NULL; END;
    IF meta->>'assignedTo'=p_realtor_id AND EXISTS (SELECT 1 FROM "Contact" WHERE id=meta->>'assignedContactId' AND "spaceId"=target_space) THEN
      RETURN jsonb_build_object('ok',true,'replayed',true,'newContactId',meta->>'assignedContactId','assignedToSpaceId',target_space);
    END IF;
    RETURN jsonb_build_object('ok',false,'status',409,'error','This lead has already been assigned');
  END IF;
  SELECT coalesce(name,email,id) INTO target_name FROM "User" WHERE id=p_realtor_id;
  INSERT INTO "Contact" (id,"spaceId",name,email,phone,budget,preferences,address,notes,type,properties,tags,"scoringStatus","leadScore","scoreLabel","scoreSummary","scoreDetails","sourceLabel",source,"sourceDetail","applicationData","applicationRef","applicationStatus")
  VALUES (new_id,target_space,lead.name,lead.email,lead.phone,lead.budget,lead.preferences,lead.address,lead.notes,lead.type,coalesce(lead.properties,ARRAY[]::text[]),ARRAY['assigned-by-broker','new-lead'],lead."scoringStatus",lead."leadScore",lead."scoreLabel",lead."scoreSummary",lead."scoreDetails",'brokerage: '||broker.name,coalesce(lead.source,'referral'),lead."sourceDetail",lead."applicationData",lead."applicationRef",lead."applicationStatus");
  -- Reuse the existing acceptance and outcome workflow, in the agent's space.
  INSERT INTO "ClientCommitment" (id,"spaceId","contactId","brokerageId",title,instruction,kind,"dueAt")
  VALUES (gen_random_uuid(),target_space,new_id,p_brokerage_id,left('First response: '||coalesce(lead.name,'New lead'),200),
    'Accept the handoff, contact the lead, and record the outcome.','handoff',
    now()+make_interval(mins=>greatest(1,coalesce(broker."slaFirstResponseMinutes",15))));
  meta := jsonb_build_object('assignedTo',p_realtor_id,'assignedToName',target_name,'assignedContactId',new_id,'assignedSpaceId',target_space,'assignedAt',now());
  UPDATE "Contact" SET tags=array_append(array_remove(coalesce(tags,ARRAY[]::text[]),'new-lead'),'assigned'),
    notes=concat_ws(E'\n',notes,'Assigned to: '||target_name,'--- Assigned to realtor ('||p_realtor_id||') on '||now()::text||' by '||p_actor_id||' ---'),
    "applicationStatus"='assigned',"applicationStatusNote"=meta::text,"updatedAt"=now()
    WHERE id=p_contact_id;
  RETURN jsonb_build_object('ok',true,'replayed',false,'newContactId',new_id,'assignedToSpaceId',target_space,'contact',to_jsonb(lead));
END; $$;
REVOKE ALL ON FUNCTION assign_broker_lead(text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION assign_broker_lead(text,text,text,text) TO service_role;
