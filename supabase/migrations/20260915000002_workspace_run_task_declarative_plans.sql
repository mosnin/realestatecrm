-- Replace arbitrary generated programs with a persisted, declarative plan.
-- The VM has one fixed interpreter; the model never supplies executable code.
ALTER TABLE "WorkspaceRunTask" ADD COLUMN IF NOT EXISTS "executionPlan" jsonb;

CREATE OR REPLACE FUNCTION enqueue_workspace_run_task_with_plan(
  p_run_id text, p_space_id text, p_task_id text, p_idempotency_key text,
  p_instruction text, p_command_plan jsonb, p_execution_plan jsonb
) RETURNS TABLE("taskId" text, status text, created boolean)
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_row record;
BEGIN
  IF jsonb_typeof(p_execution_plan) <> 'object'
    OR jsonb_typeof(p_execution_plan->'evidence') <> 'array'
    OR jsonb_array_length(p_execution_plan->'evidence') < 1
    OR jsonb_array_length(p_execution_plan->'evidence') > 3 THEN
    RAISE EXCEPTION 'workspace continuation plan is invalid';
  END IF;
  SELECT * INTO v_row FROM enqueue_workspace_run_task(
    p_run_id,p_space_id,p_task_id,p_idempotency_key,p_instruction,p_command_plan);
  IF NOT FOUND THEN RETURN; END IF;
  IF v_row.created THEN
    UPDATE "WorkspaceRunTask" t SET "executionPlan"=p_execution_plan,
      "updatedAt"=now()
    WHERE t.id=v_row."taskId" AND t."spaceId"=p_space_id AND t.status='queued';
  END IF;
  RETURN QUERY SELECT v_row."taskId", v_row.status, v_row.created;
END $$;
