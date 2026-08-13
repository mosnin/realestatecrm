-- Feature-off, additive continuation tasks for completed isolated Workspace
-- Runs. The database is the authority: a Modal VM is only an ephemeral
-- executor and can never make a task visible without this terminal state.
CREATE TABLE IF NOT EXISTS "WorkspaceRunTask" (
  id text PRIMARY KEY,
  "runId" text NOT NULL REFERENCES "WorkspaceRun"(id) ON DELETE CASCADE,
  "spaceId" text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK (sequence > 0),
  "idempotencyKey" text NOT NULL CHECK (char_length("idempotencyKey") BETWEEN 16 AND 128),
  instruction text NOT NULL CHECK (char_length(instruction) BETWEEN 3 AND 1000),
  "commandPlan" jsonb NOT NULL CHECK (jsonb_typeof("commandPlan") = 'array' AND jsonb_array_length("commandPlan") BETWEEN 1 AND 3),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','launching','running','completed','failed','cancelled')),
  "launchToken" text,
  "launchLeaseExpiresAt" timestamptz,
  "modalAcceptedAt" timestamptz,
  "cancellationRequestedAt" timestamptz,
  output text,
  error text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("runId", sequence),
  UNIQUE ("runId", "idempotencyKey")
);
CREATE TABLE IF NOT EXISTS "WorkspaceRunTaskEvent" (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "taskId" text NOT NULL REFERENCES "WorkspaceRunTask"(id) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK (sequence > 0),
  type text NOT NULL CHECK (type IN ('workspace_started','command_started','command_finished','file_created','completed','failed','cancelled')),
  message text NOT NULL,
  command text,
  output text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("taskId", sequence)
);
CREATE TABLE IF NOT EXISTS "WorkspaceRunTaskFile" (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "taskId" text NOT NULL REFERENCES "WorkspaceRunTask"(id) ON DELETE CASCADE,
  "spaceId" text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "fileId" text REFERENCES "File"(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (name ~ '^workspace-follow-up-[1-9][0-9]*\.md$'),
  "mimeType" text NOT NULL CHECK ("mimeType" = 'text/markdown'),
  "sizeBytes" integer NOT NULL CHECK ("sizeBytes" >= 0 AND "sizeBytes" <= 32000),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("taskId", name)
);
ALTER TABLE "WorkspaceRunTask" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkspaceRunTaskEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkspaceRunTaskFile" ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION enqueue_workspace_run_task(
  p_run_id text, p_space_id text, p_task_id text, p_idempotency_key text,
  p_instruction text, p_command_plan jsonb
) RETURNS TABLE("taskId" text, status text, created boolean)
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_run "WorkspaceRun"%ROWTYPE; v_existing "WorkspaceRunTask"%ROWTYPE; v_sequence integer;
BEGIN
  SELECT * INTO v_run FROM "WorkspaceRun" WHERE id=p_run_id AND "spaceId"=p_space_id FOR UPDATE;
  IF NOT FOUND OR v_run.status <> 'completed' THEN RETURN; END IF;
  SELECT * INTO v_existing FROM "WorkspaceRunTask" WHERE "runId"=p_run_id AND "idempotencyKey"=p_idempotency_key;
  IF FOUND THEN RETURN QUERY SELECT v_existing.id, v_existing.status, false; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM "WorkspaceRunTask" t WHERE t."runId"=p_run_id AND t.status IN ('queued','launching','running')) THEN RAISE EXCEPTION 'workspace continuation already active'; END IF;
  SELECT COALESCE(max(sequence), 0) + 1 INTO v_sequence FROM "WorkspaceRunTask" WHERE "runId"=p_run_id;
  INSERT INTO "WorkspaceRunTask"(id,"runId","spaceId",sequence,"idempotencyKey",instruction,"commandPlan")
  VALUES (p_task_id,p_run_id,p_space_id,v_sequence,p_idempotency_key,p_instruction,p_command_plan);
  RETURN QUERY SELECT p_task_id, 'queued'::text, true;
END $$;

CREATE OR REPLACE FUNCTION claim_workspace_run_task_launch(p_task_id text, p_space_id text, p_token text)
RETURNS boolean LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE "WorkspaceRunTask" t SET status='launching', "launchToken"=p_token,
    "launchLeaseExpiresAt"=now()+interval '2 minutes', "modalAcceptedAt"=NULL, "updatedAt"=now()
  FROM "WorkspaceRun" r
  WHERE t.id=p_task_id AND t."spaceId"=p_space_id AND t."runId"=r.id
    AND r.status='completed' AND t."cancellationRequestedAt" IS NULL
    AND (t.status='queued' OR (
      t.status='launching'
      AND t."modalAcceptedAt" IS NULL
      AND t."launchLeaseExpiresAt" IS NOT NULL
      AND t."launchLeaseExpiresAt" < now()
    ));
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION accept_workspace_run_task_launch(p_task_id text, p_space_id text, p_token text)
RETURNS boolean LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE "WorkspaceRunTask" SET "modalAcceptedAt"=now(), "updatedAt"=now()
  WHERE id=p_task_id AND "spaceId"=p_space_id AND status='launching'
    AND "launchToken"=p_token AND "modalAcceptedAt" IS NULL;
  RETURN FOUND;
END $$;

-- Intermediate callback persistence is an atomic token fence. The route's
-- initial read is only an early rejection; this locked check is the authority
-- that prevents a stale worker from appending after a recovery claim.
CREATE OR REPLACE FUNCTION record_workspace_run_task_event(
  p_task_id text, p_space_id text, p_launch_token text, p_sequence integer,
  p_type text, p_message text, p_command text DEFAULT NULL,
  p_output text DEFAULT NULL
) RETURNS text LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_task "WorkspaceRunTask"%ROWTYPE;
BEGIN
  SELECT * INTO v_task
  FROM "WorkspaceRunTask"
  WHERE id=p_task_id AND "spaceId"=p_space_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF v_task."launchToken" IS DISTINCT FROM p_launch_token
    OR v_task."modalAcceptedAt" IS NULL
  THEN RETURN 'stale_launch'; END IF;
  IF v_task.status IN ('completed','failed','cancelled') THEN RETURN 'terminal'; END IF;
  IF p_sequence < 1
    OR p_type NOT IN ('workspace_started','command_started','command_finished','file_created')
  THEN RAISE EXCEPTION 'invalid workspace task event'; END IF;
  IF (p_type='workspace_started' AND v_task.status NOT IN ('launching','running'))
    OR (p_type<>'workspace_started' AND v_task.status<>'running')
  THEN RETURN 'inactive_launch'; END IF;
  INSERT INTO "WorkspaceRunTaskEvent"("taskId",sequence,type,message,command,output)
  VALUES (
    p_task_id,p_sequence,p_type,left(COALESCE(p_message,''),500),
    CASE WHEN p_command IS NULL THEN NULL ELSE left(p_command,240) END,
    CASE WHEN p_output IS NULL THEN NULL ELSE left(p_output,6000) END
  )
  ON CONFLICT ("taskId",sequence) DO NOTHING;
  IF NOT FOUND THEN RETURN 'duplicate_event'; END IF;
  IF p_type='workspace_started' AND v_task.status='launching' THEN
    UPDATE "WorkspaceRunTask"
    SET status='running', "updatedAt"=now()
    WHERE id=p_task_id;
  END IF;
  RETURN 'recorded';
END $$;

CREATE OR REPLACE FUNCTION finish_workspace_run_task(
  p_task_id text, p_space_id text, p_launch_token text, p_outcome text,
  p_error text DEFAULT NULL,
  p_sequence integer DEFAULT NULL, p_message text DEFAULT NULL,
  p_output text DEFAULT NULL, p_files jsonb DEFAULT '[]'::jsonb
) RETURNS boolean LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_task "WorkspaceRunTask"%ROWTYPE; v_owner_clerk_id text; v_file_count integer;
BEGIN
  SELECT * INTO v_task FROM "WorkspaceRunTask" WHERE id=p_task_id AND "spaceId"=p_space_id FOR UPDATE;
  IF NOT FOUND
    OR NULLIF(btrim(p_launch_token),'') IS NULL
    OR v_task."launchToken" IS DISTINCT FROM p_launch_token
    OR v_task.status IN ('completed','failed','cancelled')
  THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM "WorkspaceRun" WHERE id=v_task."runId" AND "spaceId"=p_space_id AND status='completed') THEN RETURN false; END IF;
  IF v_task."cancellationRequestedAt" IS NOT NULL OR p_outcome='cancelled' THEN p_outcome := 'cancelled'; END IF;
  IF p_outcome NOT IN ('completed','failed','cancelled') THEN RAISE EXCEPTION 'invalid workspace task terminal outcome'; END IF;
  IF p_outcome='completed' THEN
    IF jsonb_typeof(p_files) <> 'array' OR jsonb_array_length(p_files) <> 1 THEN RAISE EXCEPTION 'workspace task manifest incomplete'; END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_to_recordset(p_files) AS f(name text) WHERE f.name = ('workspace-follow-up-' || v_task.sequence || '.md')) THEN RAISE EXCEPTION 'workspace task manifest invalid'; END IF;
    SELECT u."clerkId" INTO v_owner_clerk_id FROM "Space" s JOIN "User" u ON u.id=s."ownerId" WHERE s.id=p_space_id;
    IF v_owner_clerk_id IS NULL THEN RAISE EXCEPTION 'workspace owner missing'; END IF;
    INSERT INTO "File"(id,"spaceId","userId","storageKey",name,"mimeType",category,"sizeBytes","isPublic")
      SELECT f.id,p_space_id,v_owner_clerk_id,f."storageKey",f.name,f."mimeType",'document',f."sizeBytes",false
      FROM jsonb_to_recordset(p_files) AS f(id text,"storageKey" text,name text,"mimeType" text,"sizeBytes" integer)
      ON CONFLICT (id) DO UPDATE SET "storageKey"=EXCLUDED."storageKey",name=EXCLUDED.name,"mimeType"=EXCLUDED."mimeType","sizeBytes"=EXCLUDED."sizeBytes","isPublic"=false WHERE "File"."spaceId"=p_space_id;
    INSERT INTO "WorkspaceRunTaskFile"("taskId","spaceId","fileId",name,"mimeType","sizeBytes")
      SELECT p_task_id,p_space_id,f.id,f.name,f."mimeType",f."sizeBytes"
      FROM jsonb_to_recordset(p_files) AS f(id text,"storageKey" text,name text,"mimeType" text,"sizeBytes" integer)
      ON CONFLICT ("taskId",name) DO UPDATE SET "fileId"=EXCLUDED."fileId","mimeType"=EXCLUDED."mimeType","sizeBytes"=EXCLUDED."sizeBytes";
    SELECT count(*) INTO v_file_count FROM "WorkspaceRunTaskFile" WHERE "taskId"=p_task_id AND name=('workspace-follow-up-' || v_task.sequence || '.md');
    IF v_file_count <> 1 THEN RAISE EXCEPTION 'workspace task manifest incomplete'; END IF;
  END IF;
  UPDATE "WorkspaceRunTask" SET status=p_outcome, output=CASE WHEN p_outcome='completed' THEN left(COALESCE(p_output,''),6000) ELSE NULL END,
    error=CASE WHEN p_outcome='failed' THEN left(COALESCE(p_error,''),1000) ELSE NULL END, "updatedAt"=now() WHERE id=p_task_id;
  IF p_sequence IS NOT NULL THEN INSERT INTO "WorkspaceRunTaskEvent"("taskId",sequence,type,message,output) VALUES (p_task_id,p_sequence,p_outcome,COALESCE(p_message,p_error,p_outcome),CASE WHEN p_outcome='completed' THEN left(COALESCE(p_output,''),6000) ELSE NULL END); END IF;
  RETURN true;
END $$;
