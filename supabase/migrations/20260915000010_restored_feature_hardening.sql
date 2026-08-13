-- Final additive hardening for the restored Chippi execution surfaces.
--
-- This migration intentionally leaves the historical migrations immutable. It
-- closes their server-only RPC grants, removes the superseded free-form task
-- program entrypoint, and replaces lease operations whose old signatures did
-- not carry enough fencing authority for an at-least-once worker.

-- ---------------------------------------------------------------------------
-- AgentJobRun: every claim/reclaim gets a caller-generated opaque token and a
-- monotonically increasing generation. A worker must present both, while the
-- lease is still live, to heartbeat or finish. The old worker-id-only overloads
-- are revoked and dropped so PostgREST cannot keep exposing an unsafe path.
-- ---------------------------------------------------------------------------

ALTER TABLE public."AgentJobRun"
  ADD COLUMN IF NOT EXISTS "leaseToken" text,
  ADD COLUMN IF NOT EXISTS "leaseGeneration" bigint NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public."AgentJobRun"'::regclass
      AND conname = 'AgentJobRun_running_lease_fence_check'
  ) THEN
    -- NOT VALID keeps this upgrade safe if a deployment has a legacy running
    -- row. The replacement claim upgrades that row on its first expired-lease
    -- reclaim, while every new/updated running row is fenced immediately.
    ALTER TABLE public."AgentJobRun"
      ADD CONSTRAINT "AgentJobRun_running_lease_fence_check"
      CHECK (
        status <> 'running'
        OR (
          "leaseToken" IS NOT NULL
          AND char_length("leaseToken") BETWEEN 32 AND 256
          AND "leaseGeneration" > 0
        )
      ) NOT VALID;
  END IF;
END;
$$;

DO $$
DECLARE
  v_signature text;
  v_proc regprocedure;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.claim_agent_job(text,integer)',
    'public.heartbeat_agent_job(uuid,text,integer)',
    'public.finish_agent_job(uuid,text,text,jsonb,text,text)'
  ] LOOP
    v_proc := to_regprocedure(v_signature);
    IF v_proc IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', v_proc);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', v_proc);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', v_proc);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM service_role', v_proc);
    END IF;
  END LOOP;
END;
$$;

DROP FUNCTION IF EXISTS public.claim_agent_job(text, integer);
DROP FUNCTION IF EXISTS public.heartbeat_agent_job(uuid, text, integer);
DROP FUNCTION IF EXISTS public.finish_agent_job(uuid, text, text, jsonb, text, text);

CREATE OR REPLACE FUNCTION public.claim_agent_job(
  p_worker_id text,
  p_lease_token text,
  p_lease_seconds integer DEFAULT 60
)
RETURNS SETOF public."AgentJobRun"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  claimed public."AgentJobRun"%ROWTYPE;
BEGIN
  IF p_worker_id IS NULL OR length(btrim(p_worker_id)) = 0 THEN
    RAISE EXCEPTION 'worker id is required';
  END IF;
  IF p_lease_token IS NULL
     OR p_lease_token IS DISTINCT FROM btrim(p_lease_token)
     OR char_length(p_lease_token) NOT BETWEEN 32 AND 256 THEN
    RAISE EXCEPTION 'opaque lease token is invalid';
  END IF;
  IF p_lease_seconds NOT BETWEEN 15 AND 600 THEN
    RAISE EXCEPTION 'lease seconds out of range';
  END IF;

  SELECT * INTO claimed
  FROM public."AgentJobRun"
  WHERE (
      status IN ('queued', 'accepted', 'retry_wait')
      OR (
        status = 'running'
        AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= now())
      )
    )
    AND "availableAt" <= now()
    AND "cancellationRequestedAt" IS NULL
    AND attempt < "maxAttempts"
  ORDER BY priority DESC, "availableAt", "createdAt"
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public."AgentJobRun"
  SET status = 'running',
      attempt = attempt + 1,
      "leaseOwner" = p_worker_id,
      "leaseToken" = p_lease_token,
      "leaseGeneration" = "leaseGeneration" + 1,
      "leaseExpiresAt" = now() + make_interval(secs => p_lease_seconds),
      "heartbeatAt" = now(),
      "startedAt" = COALESCE("startedAt", now()),
      "updatedAt" = now()
  WHERE id = claimed.id
  RETURNING * INTO claimed;

  RETURN NEXT claimed;
END;
$$;

CREATE OR REPLACE FUNCTION public.heartbeat_agent_job(
  p_run_id uuid,
  p_worker_id text,
  p_lease_token text,
  p_lease_generation bigint,
  p_lease_seconds integer DEFAULT 60
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH touched AS (
    UPDATE public."AgentJobRun"
    SET "heartbeatAt" = now(),
        "leaseExpiresAt" = now() + make_interval(secs => p_lease_seconds),
        "updatedAt" = now()
    WHERE id = p_run_id
      AND status = 'running'
      AND "leaseOwner" = p_worker_id
      AND "leaseToken" = p_lease_token
      AND "leaseGeneration" = p_lease_generation
      AND "leaseExpiresAt" > now()
      AND "cancellationRequestedAt" IS NULL
      AND p_lease_seconds BETWEEN 15 AND 600
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM touched);
$$;

CREATE OR REPLACE FUNCTION public.finish_agent_job(
  p_run_id uuid,
  p_worker_id text,
  p_lease_token text,
  p_lease_generation bigint,
  p_status text,
  p_output jsonb DEFAULT NULL,
  p_error_code text DEFAULT NULL,
  p_error_message text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_status NOT IN ('completed', 'failed', 'cancelled', 'dead_letter') THEN
    RAISE EXCEPTION 'invalid terminal status';
  END IF;

  UPDATE public."AgentJobRun"
  SET status = p_status,
      output = p_output,
      "errorCode" = p_error_code,
      "errorMessage" = p_error_message,
      "completedAt" = now(),
      "cancelledAt" = CASE WHEN p_status = 'cancelled' THEN now() ELSE "cancelledAt" END,
      "leaseOwner" = NULL,
      "leaseToken" = NULL,
      "leaseExpiresAt" = NULL,
      "updatedAt" = now()
  WHERE id = p_run_id
    AND status = 'running'
    AND "leaseOwner" = p_worker_id
    AND "leaseToken" = p_lease_token
    AND "leaseGeneration" = p_lease_generation
    AND "leaseExpiresAt" > now();

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_agent_job(text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.heartbeat_agent_job(uuid, text, text, bigint, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_agent_job(uuid, text, text, bigint, text, jsonb, text, text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.claim_agent_job(text, text, integer) FROM anon;
    REVOKE ALL ON FUNCTION public.heartbeat_agent_job(uuid, text, text, bigint, integer) FROM anon;
    REVOKE ALL ON FUNCTION public.finish_agent_job(uuid, text, text, bigint, text, jsonb, text, text) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.claim_agent_job(text, text, integer) FROM authenticated;
    REVOKE ALL ON FUNCTION public.heartbeat_agent_job(uuid, text, text, bigint, integer) FROM authenticated;
    REVOKE ALL ON FUNCTION public.finish_agent_job(uuid, text, text, bigint, text, jsonb, text, text) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.claim_agent_job(text, text, integer) TO service_role;
    GRANT EXECUTE ON FUNCTION public.heartbeat_agent_job(uuid, text, text, bigint, integer) TO service_role;
    GRANT EXECUTE ON FUNCTION public.finish_agent_job(uuid, text, text, bigint, text, jsonb, text, text) TO service_role;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Research Workspace: an expired browser worker is no longer current even if
-- no successor has claimed yet. It therefore cannot end the active session or
-- rewrite queued/running BrowserAction rows.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.finish_headless_browser_worker(
  p_session_id text,
  p_lease_token text,
  p_error text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_finished boolean := false;
BEGIN
  UPDATE public."BrowserSession"
  SET "workerLeaseToken" = NULL,
      "workerLeaseExpiresAt" = NULL,
      "workerFinishedAt" = now(),
      "workerLastError" = left(nullif(p_error, ''), 1000),
      status = 'ended',
      "endedAt" = now()
  WHERE id = p_session_id
    AND "source" = 'headless'
    AND status = 'active'
    AND "workerLeaseToken" = p_lease_token
    AND "workerLeaseExpiresAt" > now()
  RETURNING true INTO v_finished;

  IF v_finished THEN
    UPDATE public."BrowserAction"
    SET status = 'error',
        result = jsonb_build_object(
          'ok', false,
          'error', coalesce(nullif(p_error, ''), 'Cloud research worker finished before this action ran.')
        ),
        "completedAt" = now()
    WHERE "sessionId" = p_session_id
      AND status IN ('queued', 'running');
  END IF;
  RETURN coalesce(v_finished, false);
END;
$$;

REVOKE ALL ON FUNCTION public.finish_headless_browser_worker(text, text, text) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.finish_headless_browser_worker(text, text, text) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.finish_headless_browser_worker(text, text, text) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.finish_headless_browser_worker(text, text, text) TO service_role;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Durable schedules: a caller cannot materialize a tenant-scoped occurrence
-- by pairing its own space with another tenant's source identifier. The source
-- tables and their spaceId columns already exist, so no guessed FK is needed.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.materialize_schedule_occurrence(
  p_space_id text,
  p_schedule_type text,
  p_schedule_id text,
  p_scheduled_for timestamptz,
  p_max_attempts integer DEFAULT 3,
  p_workflow_version integer DEFAULT NULL
)
RETURNS SETOF public."ScheduleOccurrence"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_space_id IS NULL OR length(btrim(p_space_id)) = 0
     OR p_schedule_id IS NULL OR length(btrim(p_schedule_id)) = 0 THEN
    RAISE EXCEPTION 'space id and schedule id are required';
  END IF;
  IF p_schedule_type NOT IN ('routine', 'workflow', 'agent_task') THEN
    RAISE EXCEPTION 'invalid schedule type';
  END IF;
  IF p_scheduled_for IS NULL OR p_max_attempts NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'invalid occurrence arguments';
  END IF;
  IF p_schedule_type = 'workflow' AND p_workflow_version IS NULL THEN
    RAISE EXCEPTION 'workflow version is required for a workflow occurrence';
  END IF;

  IF p_schedule_type = 'routine' THEN
    PERFORM 1
    FROM public."Routine"
    WHERE id = p_schedule_id AND "spaceId" = p_space_id
    FOR KEY SHARE;
  ELSIF p_schedule_type = 'workflow' THEN
    PERFORM 1
    FROM public."Workflow"
    WHERE id::text = p_schedule_id AND "spaceId" = p_space_id
    FOR KEY SHARE;
  ELSE
    PERFORM 1
    FROM public."AgentTask"
    WHERE id = p_schedule_id AND "spaceId" = p_space_id
    FOR KEY SHARE;
  END IF;

  IF NOT FOUND THEN
    -- One response for missing and cross-space sources avoids making this RPC
    -- a tenant-identifier oracle even if it is accidentally called internally.
    RAISE EXCEPTION 'schedule source not found in requested space';
  END IF;

  INSERT INTO public."ScheduleOccurrence" (
    "spaceId", "scheduleType", "scheduleId", "scheduledFor", "maxAttempts", "workflowVersion"
  )
  VALUES (
    p_space_id, p_schedule_type, p_schedule_id, p_scheduled_for, p_max_attempts, p_workflow_version
  )
  ON CONFLICT ("spaceId", "scheduleType", "scheduleId", "scheduledFor") DO NOTHING;

  RETURN QUERY
  SELECT *
  FROM public."ScheduleOccurrence"
  WHERE "spaceId" = p_space_id
    AND "scheduleType" = p_schedule_type
    AND "scheduleId" = p_schedule_id
    AND "scheduledFor" = p_scheduled_for;

  IF p_schedule_type = 'workflow' AND EXISTS (
    SELECT 1
    FROM public."ScheduleOccurrence"
    WHERE "spaceId" = p_space_id
      AND "scheduleType" = p_schedule_type
      AND "scheduleId" = p_schedule_id
      AND "scheduledFor" = p_scheduled_for
      AND "workflowVersion" IS DISTINCT FROM p_workflow_version
  ) THEN
    RAISE EXCEPTION 'workflow definition version changed after occurrence materialization';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.materialize_schedule_occurrence(text, text, text, timestamptz, integer, integer) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.materialize_schedule_occurrence(text, text, text, timestamptz, integer, integer) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.materialize_schedule_occurrence(text, text, text, timestamptz, integer, integer) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.materialize_schedule_occurrence(text, text, text, timestamptz, integer, integer) TO service_role;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Workspace Runs: all lifecycle, recovery, follow-up, and workspace-to-
-- Workbench RPCs are server-to-server. RLS on their tables is not a substitute
-- for removing PostgreSQL's default PUBLIC execute grant.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_obsolete regprocedure;
BEGIN
  v_obsolete := to_regprocedure(
    'public.enqueue_workspace_run_task_with_program(text,text,text,text,text,jsonb,text)'
  );
  IF v_obsolete IS NOT NULL THEN
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', v_obsolete);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', v_obsolete);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', v_obsolete);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM service_role', v_obsolete);
    END IF;
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.enqueue_workspace_run_task_with_program(
  text, text, text, text, text, jsonb, text
);

DO $$
DECLARE
  v_names constant text[] := ARRAY[
    'cancel_workspace_run_and_session',
    'record_workspace_run_event',
    'finish_workspace_run_and_session',
    'claim_workspace_launch',
    'accept_workspace_launch',
    'record_workspace_launch_receipt',
    'list_workspace_run_recovery_candidates',
    'fail_stale_accepted_workspace_launch',
    'enqueue_workspace_run_task',
    'enqueue_workspace_run_task_with_plan',
    'claim_workspace_run_task_launch',
    'accept_workspace_run_task_launch',
    'record_workspace_run_task_event',
    'finish_workspace_run_task',
    'cancel_workspace_run_task',
    'create_workspace_workbook_artifact'
  ];
  v_proc regprocedure;
BEGIN
  FOR v_proc IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY(v_names)
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', v_proc);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', v_proc);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', v_proc);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_proc);
    END IF;
  END LOOP;
END;
$$;
