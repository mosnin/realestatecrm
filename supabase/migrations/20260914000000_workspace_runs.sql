-- Additive, feature-off persistence for isolated Chippy Workspace Runs.
-- Timestamp follows the existing WorkSession migration (20260813000000).
ALTER TABLE "WorkSession" ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'research' CHECK (kind IN ('research','workspace')), ADD COLUMN IF NOT EXISTS "workspaceRunId" text;
CREATE TABLE IF NOT EXISTS "WorkspaceRun" (id text PRIMARY KEY, "workSessionId" text NOT NULL UNIQUE REFERENCES "WorkSession"(id) ON DELETE CASCADE, "spaceId" text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE, goal text NOT NULL, status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','launching','running','completed','failed','cancelled')), "launchToken" text, "launchedAt" timestamptz, "launchLeaseExpiresAt" timestamptz, "modalAcceptedAt" timestamptz, "modalSandboxId" text, "cancellationRequestedAt" timestamptz, error text, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now());
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_session_workspace_run_fk') THEN ALTER TABLE "WorkSession" ADD CONSTRAINT work_session_workspace_run_fk FOREIGN KEY ("workspaceRunId") REFERENCES "WorkspaceRun"(id) ON DELETE SET NULL; END IF; END $$;
CREATE TABLE IF NOT EXISTS "WorkspaceRunEvent" (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, "runId" text NOT NULL REFERENCES "WorkspaceRun"(id) ON DELETE CASCADE, sequence integer NOT NULL CHECK (sequence > 0), type text NOT NULL, message text NOT NULL, command text, output text, "createdAt" timestamptz NOT NULL DEFAULT now(), UNIQUE ("runId", sequence));
CREATE TABLE IF NOT EXISTS "WorkspaceRunFile" (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, "runId" text NOT NULL REFERENCES "WorkspaceRun"(id) ON DELETE CASCADE, "spaceId" text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE, "fileId" text REFERENCES "File"(id) ON DELETE SET NULL, name text NOT NULL CHECK (name IN ('brief.md','launch-checklist.md','comps.csv','handoff.md')), "mimeType" text NOT NULL, "sizeBytes" integer NOT NULL CHECK ("sizeBytes" >= 0), "createdAt" timestamptz NOT NULL DEFAULT now(), UNIQUE ("runId", name));
ALTER TABLE "WorkspaceRun" ENABLE ROW LEVEL SECURITY; ALTER TABLE "WorkspaceRunEvent" ENABLE ROW LEVEL SECURITY; ALTER TABLE "WorkspaceRunFile" ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION cancel_workspace_run_and_session(p_session_id text, p_space_id text)
RETURNS boolean LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_run_id text; v_row_count bigint := 0;
BEGIN
  SELECT "workspaceRunId" INTO v_run_id FROM "WorkSession" WHERE id = p_session_id AND "spaceId" = p_space_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE "WorkSession" SET status = 'cancelled', "updatedAt" = now() WHERE id = p_session_id AND "spaceId" = p_space_id AND status IN ('planning','awaiting_approval','awaiting_input','running');
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_run_id IS NOT NULL THEN UPDATE "WorkspaceRun" SET status = 'cancelled', "cancellationRequestedAt" = COALESCE("cancellationRequestedAt", now()), "updatedAt" = now() WHERE id = v_run_id AND "spaceId" = p_space_id AND status IN ('queued','launching','running'); END IF;
  RETURN v_row_count > 0;
END $$;
CREATE OR REPLACE FUNCTION finish_workspace_run_and_session(p_run_id text, p_space_id text, p_outcome text, p_error text DEFAULT NULL, p_sequence integer DEFAULT NULL, p_message text DEFAULT NULL, p_files jsonb DEFAULT '[]'::jsonb)
RETURNS boolean LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_run "WorkspaceRun"%ROWTYPE; v_session "WorkSession"%ROWTYPE; v_manifest_count integer; v_owner_clerk_id text;
BEGIN
  -- Keep the same lock order as cancellation: session first, then run.
  SELECT ws.* INTO v_session FROM "WorkSession" ws JOIN "WorkspaceRun" wr ON wr."workSessionId"=ws.id WHERE wr.id=p_run_id AND wr."spaceId"=p_space_id AND ws."spaceId"=p_space_id FOR UPDATE OF ws;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO v_run FROM "WorkspaceRun" WHERE id=p_run_id AND "spaceId"=p_space_id FOR UPDATE;
  IF NOT FOUND OR v_run.status IN ('completed','failed','cancelled') THEN RETURN false; END IF;
  IF v_run."cancellationRequestedAt" IS NOT NULL OR p_outcome='cancelled' THEN p_outcome := 'cancelled'; END IF;
  IF p_outcome NOT IN ('completed','failed','cancelled') THEN RAISE EXCEPTION 'invalid workspace terminal outcome'; END IF;
  IF p_outcome='completed' THEN
    IF jsonb_typeof(p_files) <> 'array' OR jsonb_array_length(p_files) <> 4 THEN RAISE EXCEPTION 'workspace manifest incomplete'; END IF;
    SELECT u."clerkId" INTO v_owner_clerk_id FROM "Space" s JOIN "User" u ON u.id=s."ownerId" WHERE s.id=p_space_id;
    IF v_owner_clerk_id IS NULL THEN RAISE EXCEPTION 'workspace owner missing'; END IF;
    -- Objects may already exist privately in storage; customer-visible File
    -- rows and run membership are born only in this terminal transaction.
    INSERT INTO "File"(id,"spaceId","userId","storageKey",name,"mimeType",category,"sizeBytes","isPublic")
      SELECT f.id,p_space_id,v_owner_clerk_id,f."storageKey",f.name,f."mimeType",'document',f."sizeBytes",false
      FROM jsonb_to_recordset(p_files) AS f(id text,"storageKey" text,name text,"mimeType" text,"sizeBytes" integer)
      ON CONFLICT (id) DO UPDATE SET "storageKey"=EXCLUDED."storageKey",name=EXCLUDED.name,"mimeType"=EXCLUDED."mimeType","sizeBytes"=EXCLUDED."sizeBytes","isPublic"=false WHERE "File"."spaceId"=p_space_id;
    INSERT INTO "WorkspaceRunFile"("runId","spaceId","fileId",name,"mimeType","sizeBytes")
      SELECT p_run_id,p_space_id,f.id,f.name,f."mimeType",f."sizeBytes"
      FROM jsonb_to_recordset(p_files) AS f(id text,"storageKey" text,name text,"mimeType" text,"sizeBytes" integer)
      ON CONFLICT ("runId",name) DO UPDATE SET "fileId"=EXCLUDED."fileId","mimeType"=EXCLUDED."mimeType","sizeBytes"=EXCLUDED."sizeBytes";
    SELECT count(DISTINCT wrf.name) INTO v_manifest_count FROM "WorkspaceRunFile" wrf JOIN "File" f ON f.id=wrf."fileId" AND f."spaceId"=p_space_id WHERE wrf."runId"=p_run_id AND wrf.name IN ('brief.md','launch-checklist.md','comps.csv','handoff.md');
    IF v_manifest_count <> 4 THEN RAISE EXCEPTION 'workspace manifest incomplete'; END IF;
  END IF;
  UPDATE "WorkspaceRun" SET status=p_outcome, error=CASE WHEN p_outcome='failed' THEN p_error ELSE NULL END, "updatedAt"=now() WHERE id=p_run_id;
  UPDATE "WorkSession" SET status=p_outcome, plan=COALESCE((SELECT jsonb_agg(jsonb_set(step,'{status}',to_jsonb(CASE WHEN p_outcome='completed' THEN 'done' ELSE 'skipped' END::text))) FROM jsonb_array_elements(COALESCE(v_session.plan,'[]'::jsonb)) step),'[]'::jsonb), error=CASE WHEN p_outcome='failed' THEN p_error ELSE NULL END, "completedAt"=CASE WHEN p_outcome='completed' THEN now() ELSE NULL END, "updatedAt"=now() WHERE id=v_run."workSessionId" AND "spaceId"=p_space_id;
  -- A terminal event may not overwrite or silently share an intermediate
  -- sequence. The unique violation aborts this whole transaction.
  IF p_sequence IS NOT NULL THEN INSERT INTO "WorkspaceRunEvent"("runId",sequence,type,message) VALUES (p_run_id,p_sequence,p_outcome,COALESCE(p_message,p_error,p_outcome)); END IF;
  RETURN true;
END $$;
CREATE OR REPLACE FUNCTION claim_workspace_launch(p_run_id text, p_space_id text, p_token text)
RETURNS boolean LANGUAGE plpgsql SET search_path = public AS $$
BEGIN UPDATE "WorkspaceRun" SET status='launching', "launchToken"=p_token, "launchedAt"=now(), "launchLeaseExpiresAt"=now()+interval '2 minutes', "modalAcceptedAt"=NULL, "updatedAt"=now() WHERE id=p_run_id AND "spaceId"=p_space_id AND "cancellationRequestedAt" IS NULL AND (status='queued' OR (status='launching' AND "launchLeaseExpiresAt" < now())); RETURN FOUND; END $$;
CREATE OR REPLACE FUNCTION accept_workspace_launch(p_run_id text, p_space_id text, p_token text)
RETURNS boolean LANGUAGE plpgsql SET search_path = public AS $$
BEGIN UPDATE "WorkspaceRun" SET "modalAcceptedAt"=now(), "updatedAt"=now() WHERE id=p_run_id AND "spaceId"=p_space_id AND status='launching' AND "launchToken"=p_token AND "modalAcceptedAt" IS NULL; RETURN FOUND; END $$;
