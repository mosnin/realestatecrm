-- Feature-off typed managed-workspace artifacts. Keep every pre-existing
-- continuation row legal so an enabled rollout can be rolled back safely.
ALTER TABLE "WorkspaceRunTask" DROP CONSTRAINT IF EXISTS "WorkspaceRunTask_commandPlan_check";
ALTER TABLE "WorkspaceRunTask" ADD CONSTRAINT workspace_run_task_command_plan_compatible_check
  CHECK (jsonb_typeof("commandPlan") = 'array' AND jsonb_array_length("commandPlan") BETWEEN 1 AND 5);

ALTER TABLE "WorkspaceRunTaskFile" DROP CONSTRAINT IF EXISTS "WorkspaceRunTaskFile_name_check";
ALTER TABLE "WorkspaceRunTaskFile" DROP CONSTRAINT IF EXISTS "WorkspaceRunTaskFile_mimeType_check";
ALTER TABLE "WorkspaceRunTaskFile" ADD CONSTRAINT workspace_run_task_file_compatible_name_check
  CHECK (name ~ '^(workspace-follow-up-[1-9][0-9]*\.md|workspace-report-[1-9][0-9]*\.md|workspace-comps-[1-9][0-9]*\.csv|workspace-actions-[1-9][0-9]*\.json)$');
ALTER TABLE "WorkspaceRunTaskFile" ADD CONSTRAINT workspace_run_task_file_compatible_mime_check
  CHECK ((name ~ '\.md$' AND "mimeType" = 'text/markdown') OR (name ~ '\.csv$' AND "mimeType" = 'text/csv') OR (name ~ '\.json$' AND "mimeType" = 'application/json'));

-- Preserve 00003’s single locked authority path.  Typed plans are new; a
-- 1–3-command legacy plan remains valid only for compatibility/recovery.
CREATE OR REPLACE FUNCTION enqueue_workspace_run_task_with_plan(
  p_run_id text, p_space_id text, p_task_id text, p_idempotency_key text,
  p_instruction text, p_command_plan jsonb, p_execution_plan jsonb
) RETURNS TABLE("taskId" text, status text, created boolean)
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_run "WorkspaceRun"%ROWTYPE; v_existing "WorkspaceRunTask"%ROWTYPE; v_sequence integer; v_instruction text; v_typed boolean;
BEGIN
  v_typed := COALESCE(jsonb_typeof(p_execution_plan->'operations') = 'array', false);
  IF jsonb_typeof(p_execution_plan) <> 'object'
    OR jsonb_typeof(p_execution_plan->'evidence') <> 'array' OR jsonb_array_length(p_execution_plan->'evidence') NOT BETWEEN 1 AND 3
    OR (v_typed AND (jsonb_typeof(p_command_plan) <> 'array' OR jsonb_array_length(p_command_plan) NOT BETWEEN 4 AND 5
      OR jsonb_typeof(p_execution_plan->'nextSteps') <> 'array' OR jsonb_array_length(p_execution_plan->'nextSteps') NOT BETWEEN 1 AND 5
      OR jsonb_array_length(p_execution_plan->'operations') NOT BETWEEN 2 AND 3
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_execution_plan->'operations') op WHERE op->>'type' NOT IN ('grounded_markdown_report','comps_csv_projection','json_action_register') OR op->>'id' !~ '^[a-z][a-z0-9_-]{0,39}$')
      OR (SELECT count(DISTINCT op->>'id') FROM jsonb_array_elements(p_execution_plan->'operations') op) <> jsonb_array_length(p_execution_plan->'operations')
      OR (SELECT count(DISTINCT op->>'type') FROM jsonb_array_elements(p_execution_plan->'operations') op) <> jsonb_array_length(p_execution_plan->'operations')))
    OR (NOT v_typed AND (jsonb_typeof(p_command_plan) <> 'array' OR jsonb_array_length(p_command_plan) NOT BETWEEN 1 AND 3)) THEN
    RAISE EXCEPTION 'workspace continuation plan is invalid';
  END IF;
  v_instruction := regexp_replace(btrim(COALESCE(p_instruction, '')), '\s+', ' ', 'g');
  IF char_length(v_instruction) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'workspace continuation instruction is invalid'; END IF;
  SELECT * INTO v_run FROM "WorkspaceRun" WHERE id=p_run_id AND "spaceId"=p_space_id FOR UPDATE;
  IF NOT FOUND OR v_run.status <> 'completed' THEN RETURN; END IF;
  SELECT * INTO v_existing FROM "WorkspaceRunTask" WHERE "runId"=p_run_id AND "idempotencyKey"=p_idempotency_key;
  IF FOUND THEN
    IF regexp_replace(btrim(v_existing.instruction), '\s+', ' ', 'g') <> v_instruction THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='workspace continuation idempotency conflict'; END IF;
    RETURN QUERY SELECT v_existing.id,v_existing.status,false; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM "WorkspaceRunTask" t WHERE t."runId"=p_run_id AND t.status IN ('queued','launching','running')) THEN RAISE EXCEPTION 'workspace continuation already active'; END IF;
  SELECT COALESCE(max(sequence),0)+1 INTO v_sequence FROM "WorkspaceRunTask" WHERE "runId"=p_run_id;
  INSERT INTO "WorkspaceRunTask"(id,"runId","spaceId",sequence,"idempotencyKey",instruction,"commandPlan","executionPlan") VALUES (p_task_id,p_run_id,p_space_id,v_sequence,p_idempotency_key,v_instruction,p_command_plan,p_execution_plan);
  RETURN QUERY SELECT p_task_id,'queued'::text,true;
END $$;

CREATE OR REPLACE FUNCTION finish_workspace_run_task(
  p_task_id text, p_space_id text, p_launch_token text, p_outcome text,
  p_error text DEFAULT NULL,
  p_sequence integer DEFAULT NULL, p_message text DEFAULT NULL,
  p_output text DEFAULT NULL, p_files jsonb DEFAULT '[]'::jsonb
) RETURNS boolean LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_task "WorkspaceRunTask"%ROWTYPE; v_owner_clerk_id text; v_file_count integer; v_typed boolean; v_expected_count integer;
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
    v_typed := COALESCE(jsonb_typeof(v_task."executionPlan"->'operations') = 'array', false);
    v_expected_count := CASE WHEN v_typed THEN jsonb_array_length(v_task."executionPlan"->'operations') ELSE 1 END;
    IF jsonb_typeof(p_files) <> 'array' OR jsonb_array_length(p_files) <> v_expected_count OR (v_typed AND v_expected_count NOT BETWEEN 2 AND 3) THEN RAISE EXCEPTION 'workspace task manifest incomplete'; END IF;
    IF v_typed THEN
      IF EXISTS (WITH expected AS (SELECT CASE op->>'type' WHEN 'grounded_markdown_report' THEN 'workspace-report-'||v_task.sequence||'.md' WHEN 'comps_csv_projection' THEN 'workspace-comps-'||v_task.sequence||'.csv' WHEN 'json_action_register' THEN 'workspace-actions-'||v_task.sequence||'.json' END AS name, CASE op->>'type' WHEN 'grounded_markdown_report' THEN 'text/markdown' WHEN 'comps_csv_projection' THEN 'text/csv' WHEN 'json_action_register' THEN 'application/json' END AS "mimeType" FROM jsonb_array_elements(v_task."executionPlan"->'operations') op), supplied AS (SELECT f.name,f."mimeType",f."sizeBytes" FROM jsonb_to_recordset(p_files) AS f(id text,"storageKey" text,name text,"mimeType" text,"sizeBytes" integer)) SELECT 1 FROM expected FULL OUTER JOIN supplied USING (name,"mimeType") WHERE expected.name IS NULL OR supplied.name IS NULL OR supplied."sizeBytes" NOT BETWEEN 1 AND 32000) THEN RAISE EXCEPTION 'workspace task manifest invalid'; END IF;
    ELSIF NOT EXISTS (SELECT 1 FROM jsonb_to_recordset(p_files) AS f(name text,"mimeType" text,"sizeBytes" integer) WHERE f.name=('workspace-follow-up-'||v_task.sequence||'.md') AND f."mimeType"='text/markdown' AND f."sizeBytes" BETWEEN 1 AND 32000) THEN RAISE EXCEPTION 'workspace task manifest invalid'; END IF;
    SELECT u."clerkId" INTO v_owner_clerk_id FROM "Space" s JOIN "User" u ON u.id=s."ownerId" WHERE s.id=p_space_id;
    IF v_owner_clerk_id IS NULL THEN RAISE EXCEPTION 'workspace owner missing'; END IF;
    INSERT INTO "File"(id,"spaceId","userId","storageKey",name,"mimeType",category,"sizeBytes","isPublic") SELECT f.id,p_space_id,v_owner_clerk_id,f."storageKey",f.name,f."mimeType",'document',f."sizeBytes",false FROM jsonb_to_recordset(p_files) AS f(id text,"storageKey" text,name text,"mimeType" text,"sizeBytes" integer) ON CONFLICT (id) DO UPDATE SET "storageKey"=EXCLUDED."storageKey",name=EXCLUDED.name,"mimeType"=EXCLUDED."mimeType","sizeBytes"=EXCLUDED."sizeBytes","isPublic"=false WHERE "File"."spaceId"=p_space_id;
    INSERT INTO "WorkspaceRunTaskFile"("taskId","spaceId","fileId",name,"mimeType","sizeBytes") SELECT p_task_id,p_space_id,f.id,f.name,f."mimeType",f."sizeBytes" FROM jsonb_to_recordset(p_files) AS f(id text,"storageKey" text,name text,"mimeType" text,"sizeBytes" integer) ON CONFLICT ("taskId",name) DO UPDATE SET "fileId"=EXCLUDED."fileId","mimeType"=EXCLUDED."mimeType","sizeBytes"=EXCLUDED."sizeBytes";
    SELECT count(*) INTO v_file_count FROM "WorkspaceRunTaskFile" WHERE "taskId"=p_task_id;
    IF v_file_count <> v_expected_count THEN RAISE EXCEPTION 'workspace task manifest incomplete'; END IF;
  END IF;
  UPDATE "WorkspaceRunTask" SET status=p_outcome,output=CASE WHEN p_outcome='completed' THEN left(COALESCE(p_output,''),6000) ELSE NULL END,error=CASE WHEN p_outcome='failed' THEN left(COALESCE(p_error,''),1000) ELSE NULL END,"updatedAt"=now() WHERE id=p_task_id;
  IF p_sequence IS NOT NULL THEN INSERT INTO "WorkspaceRunTaskEvent"("taskId",sequence,type,message,output) VALUES (p_task_id,p_sequence,p_outcome,COALESCE(p_message,p_error,p_outcome),CASE WHEN p_outcome='completed' THEN left(COALESCE(p_output,''),6000) ELSE NULL END); END IF;
  RETURN true;
END $$;
