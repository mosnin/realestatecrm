-- The API-level idempotency read is only an optimization. The durable queue
-- authority must make a conflicting retry impossible even when two requests
-- race after planning. This replacement takes the existing WorkspaceRun row
-- lock before inspecting or creating the idempotency key.
CREATE OR REPLACE FUNCTION enqueue_workspace_run_task_with_plan(
  p_run_id text, p_space_id text, p_task_id text, p_idempotency_key text,
  p_instruction text, p_command_plan jsonb, p_execution_plan jsonb
) RETURNS TABLE("taskId" text, status text, created boolean)
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_run "WorkspaceRun"%ROWTYPE;
  v_existing "WorkspaceRunTask"%ROWTYPE;
  v_sequence integer;
  v_instruction text;
BEGIN
  IF jsonb_typeof(p_execution_plan) <> 'object'
    OR jsonb_typeof(p_execution_plan->'evidence') <> 'array'
    OR jsonb_array_length(p_execution_plan->'evidence') < 1
    OR jsonb_array_length(p_execution_plan->'evidence') > 3 THEN
    RAISE EXCEPTION 'workspace continuation plan is invalid';
  END IF;

  v_instruction := regexp_replace(btrim(COALESCE(p_instruction, '')), '\s+', ' ', 'g');
  IF char_length(v_instruction) NOT BETWEEN 3 AND 1000 THEN
    RAISE EXCEPTION 'workspace continuation instruction is invalid';
  END IF;

  SELECT * INTO v_run
  FROM "WorkspaceRun"
  WHERE id = p_run_id AND "spaceId" = p_space_id
  FOR UPDATE;
  IF NOT FOUND OR v_run.status <> 'completed' THEN RETURN; END IF;

  SELECT * INTO v_existing
  FROM "WorkspaceRunTask"
  WHERE "runId" = p_run_id AND "idempotencyKey" = p_idempotency_key;
  IF FOUND THEN
    IF regexp_replace(btrim(v_existing.instruction), '\s+', ' ', 'g') <> v_instruction THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'workspace continuation idempotency conflict';
    END IF;
    RETURN QUERY SELECT v_existing.id, v_existing.status, false;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM "WorkspaceRunTask" t
    WHERE t."runId" = p_run_id AND t.status IN ('queued','launching','running')
  ) THEN
    RAISE EXCEPTION 'workspace continuation already active';
  END IF;

  SELECT COALESCE(max(sequence), 0) + 1 INTO v_sequence
  FROM "WorkspaceRunTask" WHERE "runId" = p_run_id;
  INSERT INTO "WorkspaceRunTask"(
    id,"runId","spaceId",sequence,"idempotencyKey",instruction,"commandPlan","executionPlan"
  ) VALUES (
    p_task_id,p_run_id,p_space_id,v_sequence,p_idempotency_key,v_instruction,p_command_plan,p_execution_plan
  );
  RETURN QUERY SELECT p_task_id, 'queued'::text, true;
END $$;
