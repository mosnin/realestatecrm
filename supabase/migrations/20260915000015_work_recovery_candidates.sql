-- Periodic recovery candidates for the two insert/commit-before-dispatch
-- windows that are not represented by a WorkspaceRun launch row:
--   1. ordinary research WorkSessions whose initial or chained wake-up was
--      lost after the row/phase result committed; and
--   2. private WorkspaceRunTasks whose queued row committed before its kick.
--
-- These functions only observe durable state. The existing WorkSession phase
-- token and WorkspaceRunTask launch token remain the execution authorities,
-- so repeated scanner ticks cannot authorize duplicate provider work.

CREATE INDEX IF NOT EXISTS "WorkSession_research_recovery_scan_idx"
  ON public."WorkSession" ("updatedAt", id)
  WHERE kind = 'research' AND status IN ('planning', 'running');

CREATE INDEX IF NOT EXISTS "WorkspaceRunTask_queued_recovery_scan_idx"
  ON public."WorkspaceRunTask" ("updatedAt", id)
  WHERE status = 'queued' AND "cancellationRequestedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "WorkspaceRunTask_accepted_recovery_scan_idx"
  ON public."WorkspaceRunTask" ("modalAcceptedAt", id)
  WHERE status IN ('launching', 'running')
    AND "modalAcceptedAt" IS NOT NULL
    AND "cancellationRequestedAt" IS NULL;

CREATE OR REPLACE FUNCTION public.list_research_work_session_recovery_candidates(
  p_limit integer DEFAULT 25
)
RETURNS TABLE(
  "sessionId" text,
  "spaceId" text,
  kind text,
  "sessionStatus" text,
  action text,
  "recoveryKey" text,
  "staleForSeconds" integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    session.id,
    session."spaceId",
    session.kind,
    session.status,
    CASE WHEN session.status = 'planning' THEN 'plan' ELSE 'advance' END,
    concat_ws(
      ':',
      session.status,
      floor(extract(epoch FROM session."updatedAt"))::bigint::text
    ),
    LEAST(
      2147483647,
      GREATEST(0, floor(extract(epoch FROM now() - session."updatedAt")))
    )::integer
  FROM public."WorkSession" AS session
  WHERE session.kind = 'research'
    AND session.status IN ('planning', 'running')
    -- The phase lease is seven minutes. Ten minutes supplies a conservative
    -- scheduler/clock margin and also covers the between-phase chain window.
    AND session."updatedAt" < now() - interval '10 minutes'
    -- A populated claim with a live lease still owns this phase. A populated
    -- claim with no lease is intentionally fail-closed, matching the claim
    -- RPC; it requires operator repair rather than speculative re-entry.
    AND (
      session."phaseClaimToken" IS NULL
      OR session."phaseLeaseExpiresAt" < now()
    )
  ORDER BY session."updatedAt" ASC, session.id ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 25), 1), 25)
$$;

CREATE OR REPLACE FUNCTION public.list_workspace_run_task_recovery_candidates(
  p_limit integer DEFAULT 25,
  p_space_ids text[] DEFAULT ARRAY[]::text[]
)
RETURNS TABLE(
  "taskId" text,
  "runId" text,
  "spaceId" text,
  "taskStatus" text,
  "runStatus" text,
  "launchToken" text,
  action text,
  "staleBasis" text,
  "recoveryKey" text,
  "staleForSeconds" integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    task.id,
    task."runId",
    task."spaceId",
    task.status,
    run.status,
    task."launchToken",
    CASE
      WHEN task.status = 'queued' THEN 'dispatch'
      ELSE 'fail_accepted_silent'
    END,
    CASE
      WHEN task.status = 'launching' THEN 'modalAcceptedAt'
      ELSE 'updatedAt'
    END,
    concat_ws(
      ':',
      task.status,
      COALESCE(task."launchToken", 'unclaimed'),
      floor(extract(epoch FROM CASE
        WHEN task.status = 'queued' THEN task."updatedAt"
        WHEN task.status = 'launching' THEN task."modalAcceptedAt"
        ELSE task."updatedAt"
      END))::bigint::text
    ),
    LEAST(
      2147483647,
      GREATEST(0, floor(extract(epoch FROM now() - CASE
        WHEN task.status = 'queued' THEN task."updatedAt"
        WHEN task.status = 'launching' THEN task."modalAcceptedAt"
        ELSE task."updatedAt"
      END))
    ))::integer
  FROM public."WorkspaceRunTask" AS task
  JOIN public."WorkspaceRun" AS run
    ON run.id = task."runId"
   AND run."spaceId" = task."spaceId"
  WHERE task."spaceId" = ANY(COALESCE(p_space_ids, ARRAY[]::text[]))
    AND run.status = 'completed'
    AND task."cancellationRequestedAt" IS NULL
    AND (
      (
        task.status = 'queued'
        AND task."launchToken" IS NULL
        AND task."launchLeaseExpiresAt" IS NULL
        AND task."modalAcceptedAt" IS NULL
        AND task."updatedAt" < now() - interval '2 minutes'
      )
      OR (
        task.status = 'launching'
        AND NULLIF(btrim(task."launchToken"), '') IS NOT NULL
        AND task."modalAcceptedAt" < now() - interval '5 minutes'
      )
      OR (
        task.status = 'running'
        AND NULLIF(btrim(task."launchToken"), '') IS NOT NULL
        AND task."modalAcceptedAt" IS NOT NULL
        -- A running worker can remain healthy well after provider acceptance.
        -- Its latest fenced callback updates this row, so activity age is the
        -- conservative bounded-runtime clock (Modal max 180s plus margin).
        AND task."updatedAt" < now() - interval '5 minutes'
      )
    )
  ORDER BY
    CASE
      WHEN task.status = 'queued' THEN task."updatedAt"
      WHEN task.status = 'launching' THEN task."modalAcceptedAt"
      ELSE task."updatedAt"
    END ASC,
    task.id ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 25), 1), 25)
$$;

REVOKE ALL ON FUNCTION public.list_research_work_session_recovery_candidates(integer)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_workspace_run_task_recovery_candidates(integer, text[])
  FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.list_research_work_session_recovery_candidates(integer)
      FROM anon;
    REVOKE ALL ON FUNCTION public.list_workspace_run_task_recovery_candidates(integer, text[])
      FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.list_research_work_session_recovery_candidates(integer)
      FROM authenticated;
    REVOKE ALL ON FUNCTION public.list_workspace_run_task_recovery_candidates(integer, text[])
      FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.list_research_work_session_recovery_candidates(integer)
      TO service_role;
    GRANT EXECUTE ON FUNCTION public.list_workspace_run_task_recovery_candidates(integer, text[])
      TO service_role;
  END IF;
END;
$$;
