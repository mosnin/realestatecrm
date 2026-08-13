-- A continuation is only accepted when its private, bounded transformation
-- program has been persisted before dispatch. Keep this additive so an
-- already-applied task migration is never rewritten.
ALTER TABLE "WorkspaceRunTask"
  ADD COLUMN IF NOT EXISTS "executionProgram" text,
  ADD COLUMN IF NOT EXISTS "executionProgramHash" text;

CREATE OR REPLACE FUNCTION enqueue_workspace_run_task_with_program(
  p_run_id text, p_space_id text, p_task_id text, p_idempotency_key text,
  p_instruction text, p_command_plan jsonb, p_execution_program text
) RETURNS TABLE("taskId" text, status text, created boolean)
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_row record;
BEGIN
  IF char_length(COALESCE(p_execution_program,'')) NOT BETWEEN 1 AND 12000 THEN
    RAISE EXCEPTION 'workspace continuation program is invalid';
  END IF;
  SELECT * INTO v_row FROM enqueue_workspace_run_task(p_run_id,p_space_id,p_task_id,p_idempotency_key,p_instruction,p_command_plan);
  IF NOT FOUND THEN RETURN; END IF;
  IF v_row.created THEN
    UPDATE "WorkspaceRunTask" t SET "executionProgram"=p_execution_program,
      "executionProgramHash"=encode(digest(p_execution_program,'sha256'),'hex'), "updatedAt"=now()
    WHERE t.id=v_row."taskId" AND t."spaceId"=p_space_id AND t.status='queued';
  END IF;
  RETURN QUERY SELECT v_row."taskId", v_row.status, v_row.created;
END $$;

CREATE OR REPLACE FUNCTION cancel_workspace_run_task(p_task_id text, p_space_id text)
RETURNS boolean LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE "WorkspaceRunTask" t SET status='cancelled',
    "cancellationRequestedAt"=COALESCE(t."cancellationRequestedAt",now()), "updatedAt"=now()
  FROM "WorkspaceRun" r
  WHERE t.id=p_task_id AND t."spaceId"=p_space_id AND t."runId"=r.id
    AND r.status='completed' AND t.status IN ('queued','launching','running');
  RETURN FOUND;
END $$;
