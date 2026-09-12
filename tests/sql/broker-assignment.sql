\set ON_ERROR_STOP on
-- Disposable database only. Minimal typed fixture for the assignment transaction.
CREATE TABLE "Brokerage" (id text PRIMARY KEY,"ownerId" text,name text,"slaFirstResponseMinutes" integer DEFAULT 15);
CREATE TABLE "BrokerageMembership" ("brokerageId" text,"userId" text,role text);
CREATE TABLE "User" (id text PRIMARY KEY,name text,email text);
CREATE TABLE "Space" (id text PRIMARY KEY,"ownerId" text,"createdAt" timestamptz DEFAULT now());
CREATE TABLE "Contact" (id text PRIMARY KEY,"spaceId" text,"brokerageId" text,name text,email text,phone text,budget numeric,preferences jsonb,address text,notes text,type text,properties text[],tags text[],"scoringStatus" text,"leadScore" numeric,"scoreLabel" text,"scoreSummary" text,"scoreDetails" jsonb,"sourceLabel" text,source text,"sourceDetail" text,"applicationData" jsonb,"applicationRef" text,"applicationStatus" text,"applicationStatusNote" text,"updatedAt" timestamptz);
CREATE TABLE IF NOT EXISTS "ClientCommitment" (id uuid PRIMARY KEY,"spaceId" text,"contactId" text,title text,instruction text,kind text,"dueAt" timestamptz,status text DEFAULT 'open');
\ir ../../supabase/migrations/20260920000000_atomic_broker_assignment.sql
\ir ../../supabase/migrations/20260920000000_atomic_broker_assignment.sql
INSERT INTO "Brokerage" (id,"ownerId",name) VALUES ('b','owner','Test');
INSERT INTO "User" VALUES ('owner','Owner','owner@example.test'),('a','Agent','a@example.test'),('a2','Other','other@example.test');
INSERT INTO "Space" (id,"ownerId") VALUES ('source','owner'),('target','a'),('other','a2');
INSERT INTO "BrokerageMembership" VALUES ('b','a','realtor_member'),('b','a2','realtor_member');
INSERT INTO "Contact" (id,"spaceId",name,tags,source) VALUES ('lead','source','Alex',ARRAY['new-lead'],'web_form'),('rollback','source','Rollback',ARRAY['new-lead'],'manual'),('foreign','outside','Private',NULL,NULL);
CREATE FUNCTION test_assert(p_ok boolean,p_label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF p_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAILED: %',p_label; END IF; RAISE NOTICE 'PASS: %',p_label; END $$;
SELECT test_assert(assign_broker_lead('b','a','lead','a')->>'status'='403','member cannot assign');
SELECT test_assert(assign_broker_lead('b','owner','foreign','a')->>'status'='404','cross tenant source blocked');
SELECT test_assert(assign_broker_lead('b','owner','lead','a')->>'ok'='true','assignment succeeds');
SELECT test_assert(assign_broker_lead('b','owner','lead','a')->>'replayed'='true','same assignment retry is idempotent');
SELECT test_assert(assign_broker_lead('b','owner','lead','a2')->>'status'='409','competing assignment rejected');
SELECT test_assert((SELECT count(*)=1 FROM "Contact" WHERE "spaceId"='target'),'only one clone');
SELECT test_assert((SELECT source='web_form' FROM "Contact" WHERE "spaceId"='target'),'attribution survives');
CREATE FUNCTION reject_source_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='rollback' THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END $$;
CREATE TRIGGER injected_failure BEFORE UPDATE ON "Contact" FOR EACH ROW EXECUTE FUNCTION reject_source_update();
DO $$ BEGIN BEGIN PERFORM assign_broker_lead('b','owner','rollback','a'); RAISE EXCEPTION 'test did not fail'; EXCEPTION WHEN others THEN IF SQLERRM <> 'injected failure' THEN RAISE; END IF; END; END $$;
SELECT test_assert((SELECT count(*)=1 FROM "Contact" WHERE "spaceId"='target'),'failed source update rolls back clone');
SELECT test_assert(NOT has_function_privilege('authenticated','assign_broker_lead(text,text,text,text)','EXECUTE'),'RPC restricted to server');

SELECT test_assert((SELECT count(*)=1 FROM "ClientCommitment"),'one accountable handoff per assignment');
SELECT test_assert((SELECT "spaceId"='target' AND "brokerageId"='b' AND status='open' AND "dueAt">now() FROM "ClientCommitment"),'handoff has owner, deadline and acceptance state');
