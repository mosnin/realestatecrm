-- Feature-off hardening for private Workspace continuation planning.
-- Planning is billable, so the idempotency key is reserved transactionally
-- before any private files are loaded or any model is called. A bounded lease
-- lets the same instruction recover from a crashed planner. Only the current
-- planning token can atomically publish a queued task.
CREATE TABLE IF NOT EXISTS "WorkspaceRunTaskPlanClaim" (
  "runId" text NOT NULL REFERENCES "WorkspaceRun"(id) ON DELETE CASCADE,
  "spaceId" text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "idempotencyKey" text NOT NULL CHECK (char_length("idempotencyKey") BETWEEN 16 AND 128),
  instruction text NOT NULL CHECK (char_length(instruction) BETWEEN 3 AND 1000),
  "planningToken" text NOT NULL CHECK (char_length("planningToken") BETWEEN 16 AND 128),
  "leaseExpiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("runId", "idempotencyKey")
);

CREATE INDEX IF NOT EXISTS workspace_run_task_plan_claim_run_lease_idx
  ON "WorkspaceRunTaskPlanClaim" ("runId", "leaseExpiresAt");

ALTER TABLE "WorkspaceRunTaskPlanClaim" ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION reserve_workspace_run_task_plan(
  p_run_id text,
  p_space_id text,
  p_idempotency_key text,
  p_instruction text,
  p_planning_token text,
  p_lease_seconds integer DEFAULT 180
) RETURNS TABLE(
  state text,
  "planningToken" text,
  "taskId" text,
  status text,
  instruction text
)
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_run "WorkspaceRun"%ROWTYPE;
  v_existing "WorkspaceRunTask"%ROWTYPE;
  v_claim "WorkspaceRunTaskPlanClaim"%ROWTYPE;
  v_instruction text;
  v_lease_seconds integer;
BEGIN
  v_instruction := regexp_replace(btrim(COALESCE(p_instruction, '')), '\s+', ' ', 'g');
  v_lease_seconds := greatest(30, least(COALESCE(p_lease_seconds, 180), 300));
  IF char_length(v_instruction) NOT BETWEEN 3 AND 1000
    OR char_length(COALESCE(p_idempotency_key, '')) NOT BETWEEN 16 AND 128
    OR char_length(btrim(COALESCE(p_planning_token, ''))) NOT BETWEEN 16 AND 128
  THEN
    RAISE EXCEPTION 'workspace continuation planning reservation is invalid';
  END IF;

  -- Every reservation and final enqueue takes the same parent row lock. This
  -- serializes both same-key retries and different continuation keys per run.
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
    RETURN QUERY SELECT
      'existing'::text, NULL::text, v_existing.id, v_existing.status, v_existing.instruction;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM "WorkspaceRunTask" t
    WHERE t."runId" = p_run_id AND t.status IN ('queued','launching','running')
  ) OR EXISTS (
    SELECT 1 FROM "WorkspaceRunTaskPlanClaim" c
    WHERE c."runId" = p_run_id
      AND c."idempotencyKey" <> p_idempotency_key
      AND c."leaseExpiresAt" > now()
  ) THEN
    RAISE EXCEPTION 'workspace continuation already active';
  END IF;

  SELECT * INTO v_claim
  FROM "WorkspaceRunTaskPlanClaim"
  WHERE "runId" = p_run_id AND "idempotencyKey" = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF regexp_replace(btrim(v_claim.instruction), '\s+', ' ', 'g') <> v_instruction THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'workspace continuation idempotency conflict';
    END IF;
    IF v_claim."leaseExpiresAt" > now() THEN
      RETURN QUERY SELECT
        'pending'::text, NULL::text, NULL::text, 'planning'::text, v_claim.instruction;
      RETURN;
    END IF;
    UPDATE "WorkspaceRunTaskPlanClaim"
    SET "planningToken" = p_planning_token,
      "leaseExpiresAt" = now() + make_interval(secs => v_lease_seconds),
      "updatedAt" = now()
    WHERE "runId" = p_run_id AND "idempotencyKey" = p_idempotency_key;
  ELSE
    INSERT INTO "WorkspaceRunTaskPlanClaim"(
      "runId", "spaceId", "idempotencyKey", instruction,
      "planningToken", "leaseExpiresAt"
    ) VALUES (
      p_run_id, p_space_id, p_idempotency_key, v_instruction,
      p_planning_token, now() + make_interval(secs => v_lease_seconds)
    );
  END IF;

  RETURN QUERY SELECT
    'claimed'::text, p_planning_token, NULL::text, 'planning'::text, v_instruction;
END $$;

-- A planner that sees a deterministic provider/validation failure can give up
-- its own lease immediately. The row and instruction remain so the key cannot
-- later be reused for a different request. A process crash is recovered by the
-- same bounded lease without this helper.
CREATE OR REPLACE FUNCTION release_workspace_run_task_plan(
  p_run_id text,
  p_space_id text,
  p_idempotency_key text,
  p_planning_token text
) RETURNS boolean
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE "WorkspaceRunTaskPlanClaim"
  SET "leaseExpiresAt" = now(), "updatedAt" = now()
  WHERE "runId" = p_run_id
    AND "spaceId" = p_space_id
    AND "idempotencyKey" = p_idempotency_key
    AND "planningToken" = p_planning_token;
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION enqueue_reserved_workspace_run_task_with_plan(
  p_run_id text,
  p_space_id text,
  p_task_id text,
  p_idempotency_key text,
  p_instruction text,
  p_command_plan jsonb,
  p_execution_plan jsonb,
  p_planning_token text
) RETURNS TABLE("taskId" text, status text, created boolean)
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_run "WorkspaceRun"%ROWTYPE;
  v_existing "WorkspaceRunTask"%ROWTYPE;
  v_claim "WorkspaceRunTaskPlanClaim"%ROWTYPE;
  v_sequence integer;
  v_instruction text;
  v_typed boolean;
BEGIN
  v_typed := COALESCE(jsonb_typeof(p_execution_plan->'operations') = 'array', false);
  IF jsonb_typeof(p_execution_plan) <> 'object'
    OR jsonb_typeof(p_execution_plan->'evidence') <> 'array'
    OR jsonb_array_length(p_execution_plan->'evidence') NOT BETWEEN 1 AND 3
    OR (v_typed AND (
      jsonb_typeof(p_command_plan) <> 'array'
      OR jsonb_array_length(p_command_plan) NOT BETWEEN 4 AND 5
      OR jsonb_typeof(p_execution_plan->'nextSteps') <> 'array'
      OR jsonb_array_length(p_execution_plan->'nextSteps') NOT BETWEEN 1 AND 5
      OR jsonb_array_length(p_execution_plan->'operations') NOT BETWEEN 2 AND 3
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_execution_plan->'operations') op
        WHERE op->>'type' NOT IN ('grounded_markdown_report','comps_csv_projection','json_action_register')
          OR op->>'id' !~ '^[a-z][a-z0-9_-]{0,39}$'
      )
      OR (SELECT count(DISTINCT op->>'id') FROM jsonb_array_elements(p_execution_plan->'operations') op)
        <> jsonb_array_length(p_execution_plan->'operations')
      OR (SELECT count(DISTINCT op->>'type') FROM jsonb_array_elements(p_execution_plan->'operations') op)
        <> jsonb_array_length(p_execution_plan->'operations')
    ))
    OR (NOT v_typed AND (
      jsonb_typeof(p_command_plan) <> 'array'
      OR jsonb_array_length(p_command_plan) NOT BETWEEN 1 AND 3
    ))
  THEN
    RAISE EXCEPTION 'workspace continuation plan is invalid';
  END IF;

  v_instruction := regexp_replace(btrim(COALESCE(p_instruction, '')), '\s+', ' ', 'g');
  IF char_length(v_instruction) NOT BETWEEN 3 AND 1000
    OR char_length(btrim(COALESCE(p_planning_token, ''))) NOT BETWEEN 16 AND 128
  THEN
    RAISE EXCEPTION 'workspace continuation planning reservation is invalid';
  END IF;

  SELECT * INTO v_run
  FROM "WorkspaceRun"
  WHERE id = p_run_id AND "spaceId" = p_space_id
  FOR UPDATE;
  IF NOT FOUND OR v_run.status <> 'completed' THEN RETURN; END IF;

  -- A committed enqueue whose response was lost is safely reusable even
  -- though its claim was consumed in the same transaction.
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

  SELECT * INTO v_claim
  FROM "WorkspaceRunTaskPlanClaim"
  WHERE "runId" = p_run_id AND "idempotencyKey" = p_idempotency_key
  FOR UPDATE;
  IF NOT FOUND
    OR v_claim."spaceId" <> p_space_id
    OR v_claim."planningToken" IS DISTINCT FROM p_planning_token
    OR v_claim."leaseExpiresAt" <= now()
  THEN
    RAISE EXCEPTION 'workspace continuation planning reservation is stale';
  END IF;
  IF regexp_replace(btrim(v_claim.instruction), '\s+', ' ', 'g') <> v_instruction THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'workspace continuation idempotency conflict';
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
    id, "runId", "spaceId", sequence, "idempotencyKey", instruction,
    "commandPlan", "executionPlan"
  ) VALUES (
    p_task_id, p_run_id, p_space_id, v_sequence, p_idempotency_key,
    v_instruction, p_command_plan, p_execution_plan
  );

  DELETE FROM "WorkspaceRunTaskPlanClaim"
  WHERE "runId" = p_run_id
    AND "idempotencyKey" = p_idempotency_key
    AND "planningToken" = p_planning_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace continuation planning reservation is stale';
  END IF;

  RETURN QUERY SELECT p_task_id, 'queued'::text, true;
END $$;

-- Retire both historical enqueue seams. New callers must reserve before the
-- model call and present the current token to the atomic enqueue function.
CREATE OR REPLACE FUNCTION enqueue_workspace_run_task(
  p_run_id text, p_space_id text, p_task_id text, p_idempotency_key text,
  p_instruction text, p_command_plan jsonb
) RETURNS TABLE("taskId" text, status text, created boolean)
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'workspace continuation planning reservation required';
END $$;

CREATE OR REPLACE FUNCTION enqueue_workspace_run_task_with_plan(
  p_run_id text, p_space_id text, p_task_id text, p_idempotency_key text,
  p_instruction text, p_command_plan jsonb, p_execution_plan jsonb
) RETURNS TABLE("taskId" text, status text, created boolean)
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'workspace continuation planning reservation required';
END $$;

-- This migration follows the broader workspace RPC hardening migration, so
-- reapply least privilege to every new/replaced planning seam explicitly.
REVOKE ALL ON FUNCTION reserve_workspace_run_task_plan(text,text,text,text,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION release_workspace_run_task_plan(text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION enqueue_reserved_workspace_run_task_with_plan(text,text,text,text,text,jsonb,jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION enqueue_workspace_run_task(text,text,text,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION enqueue_workspace_run_task_with_plan(text,text,text,text,text,jsonb,jsonb) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION reserve_workspace_run_task_plan(text,text,text,text,text,integer) FROM anon;
    REVOKE ALL ON FUNCTION release_workspace_run_task_plan(text,text,text,text) FROM anon;
    REVOKE ALL ON FUNCTION enqueue_reserved_workspace_run_task_with_plan(text,text,text,text,text,jsonb,jsonb,text) FROM anon;
    REVOKE ALL ON FUNCTION enqueue_workspace_run_task(text,text,text,text,text,jsonb) FROM anon;
    REVOKE ALL ON FUNCTION enqueue_workspace_run_task_with_plan(text,text,text,text,text,jsonb,jsonb) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION reserve_workspace_run_task_plan(text,text,text,text,text,integer) FROM authenticated;
    REVOKE ALL ON FUNCTION release_workspace_run_task_plan(text,text,text,text) FROM authenticated;
    REVOKE ALL ON FUNCTION enqueue_reserved_workspace_run_task_with_plan(text,text,text,text,text,jsonb,jsonb,text) FROM authenticated;
    REVOKE ALL ON FUNCTION enqueue_workspace_run_task(text,text,text,text,text,jsonb) FROM authenticated;
    REVOKE ALL ON FUNCTION enqueue_workspace_run_task_with_plan(text,text,text,text,text,jsonb,jsonb) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION reserve_workspace_run_task_plan(text,text,text,text,text,integer) TO service_role;
    GRANT EXECUTE ON FUNCTION release_workspace_run_task_plan(text,text,text,text) TO service_role;
    GRANT EXECUTE ON FUNCTION enqueue_reserved_workspace_run_task_with_plan(text,text,text,text,text,jsonb,jsonb,text) TO service_role;
    GRANT EXECUTE ON FUNCTION enqueue_workspace_run_task(text,text,text,text,text,jsonb) TO service_role;
    GRANT EXECUTE ON FUNCTION enqueue_workspace_run_task_with_plan(text,text,text,text,text,jsonb,jsonb) TO service_role;
  END IF;
END $$;
