\set ON_ERROR_STOP on
-- Disposable local fixture only. Do not run against an application database.
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE "Space" (id text PRIMARY KEY);
CREATE TABLE "Contact" (id text PRIMARY KEY,"spaceId" text,"brokerageId" text,name text,email text,phone text,"leadType" text,type text,properties text[],tags text[]);
CREATE TABLE "ContactActivity" (id text PRIMARY KEY,"spaceId" text,"contactId" text,type text,content text,metadata jsonb);
CREATE TABLE "IntegrationConnection" (id text PRIMARY KEY,"spaceId" text,toolkit text,status text);
CREATE TABLE "ScheduledMessage" (id uuid PRIMARY KEY,"spaceId" text,channel text,"recipientContactId" text,instruction text,"sendAt" timestamptz,autonomy text,status text,detail jsonb,"updatedAt" timestamptz DEFAULT now());
\ir ../../supabase/migrations/20260919000000_client_commitments.sql
\ir ../../supabase/migrations/20260919010000_crm_follow_through.sql
\ir ../../supabase/migrations/20260919000000_client_commitments.sql
\ir ../../supabase/migrations/20260919010000_crm_follow_through.sql
INSERT INTO "Space" VALUES ('a'),('b');
INSERT INTO "Contact" (id,"spaceId",name,email) VALUES ('ca','a','Alex','alex@example.test'),('cb','b','Other','other@example.test');
INSERT INTO "IntegrationConnection" VALUES ('conn','a','follow_up_boss','active');
CREATE FUNCTION test_assert(p_ok boolean,p_label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF p_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAILED: %',p_label; END IF; RAISE NOTICE 'PASS: %',p_label; END $$;
DO $$ BEGIN
  BEGIN
    PERFORM create_client_commitment('00000000-0000-4000-a000-000000000001','a','cb','Wrong','Wrong','commitment',now(),'email');
    RAISE EXCEPTION 'tenant test failed';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='tenant test failed' THEN RAISE; END IF; END;
END; $$;
SELECT test_assert((SELECT count(*)=0 FROM "ScheduledMessage"),'cross-tenant commitment leaves no send');
SELECT create_client_commitment('00000000-0000-4000-a000-000000000002','a','ca','Inspection','Send the time','commitment','2026-09-07T12:00:00Z','email');
SELECT create_client_commitment('00000000-0000-4000-a000-000000000002','a','ca','Inspection','Send the time','commitment','2026-09-07T12:00:00Z','email');
SELECT test_assert((SELECT count(*)=1 FROM "ScheduledMessage"),'retried save queues exactly once');
SELECT test_assert((SELECT autonomy='auto' AND detail->>'contentMode'='instruction' FROM "ScheduledMessage"),'commitment executes through existing auto dispatcher');
DO $$ BEGIN
  BEGIN
    PERFORM create_client_commitment('00000000-0000-4000-a000-000000000002','a','ca','Different','Send the time','commitment','2026-09-07T12:00:00Z','email');
    RAISE EXCEPTION 'changed retry accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='changed retry accepted' THEN RAISE; END IF; END;
END; $$;
SELECT change_client_commitment('a','00000000-0000-4000-a000-000000000002','cancel');
SELECT test_assert((SELECT status='canceled' FROM "ScheduledMessage"),'cancel-before-claim cancels delivery');
SELECT create_client_commitment('00000000-0000-4000-a000-000000000003','a','ca','Update','Send update','commitment','2026-09-07T12:00:00Z','email');
UPDATE "ScheduledMessage" SET status='sending' WHERE status='pending';
DO $$ BEGIN
  BEGIN
    PERFORM change_client_commitment('a','00000000-0000-4000-a000-000000000003','cancel');
    RAISE EXCEPTION 'in-flight cancel falsely accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='in-flight cancel falsely accepted' THEN RAISE; END IF; END;
END; $$;
UPDATE "ScheduledMessage" SET status='sent' WHERE status='sending';
SELECT test_assert((SELECT status='completed' FROM "ClientCommitment" WHERE id='00000000-0000-4000-a000-000000000003'),'send acknowledgement completes automatic commitment');
SELECT create_client_commitment('00000000-0000-4000-a000-000000000004','a','ca','Call','Client needs an agent','handoff','2026-09-07T12:00:00Z',NULL);
SELECT change_client_commitment('a','00000000-0000-4000-a000-000000000004','accept');
SELECT test_assert((SELECT status='accepted' AND "completedAt" IS NULL FROM "ClientCommitment" WHERE id='00000000-0000-4000-a000-000000000004'),'acceptance is separate from completion');
SELECT change_client_commitment('a','00000000-0000-4000-a000-000000000004','complete','Called client and agreed next step');
SELECT test_assert(NOT change_client_commitment('b','00000000-0000-4000-a000-000000000004','complete','Wrong tenant'),'cross-tenant mutation cannot match');
SELECT test_assert(NOT has_function_privilege('authenticated','create_client_commitment(uuid,text,text,text,text,text,timestamptz,text)','EXECUTE'),'RPC unavailable to direct authenticated clients');
SELECT test_assert(import_fub_person('a','conn','12','Alex','alex@example.test','',true)='ca','provider linking uses exact in-tenant identity');
SELECT test_assert(import_fub_person('a','conn','12','Alex','alex@example.test','',true)='ca','provider import retries do not duplicate contacts');
INSERT INTO "ContactActivity" VALUES ('act1','a','ca','email','Sent inspection update','{}'),('private','a','ca','note','Private client notes','{}');
SELECT test_assert((SELECT count(*)=1 FROM "CrmWriteback"),'only eligible activity enters CRM outbox');
SELECT import_fub_person('a','conn','12','Alex','alex@example.test','',false);
INSERT INTO "ContactActivity" VALUES ('act2','a','ca','email','Another update','{}');
SELECT test_assert((SELECT count(*)=1 FROM "CrmWriteback"),'disabled write-back stops future outbox entries');
SELECT test_assert(import_fub_person('a','conn','13','Jordan','jordan@example.test','',false)<>'ca','new provider record imports a real Contact');
SELECT test_assert((SELECT count(*)=1 FROM "Contact" WHERE email='jordan@example.test'),'import creates exactly one new person without outreach');
