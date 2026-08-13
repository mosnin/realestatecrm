-- Additive repair for a WorkspaceRunTask launch that Modal accepted but either
-- never started or never reached a terminal callback. The delayed queue
-- message is only a wake-up signal: this fixed, token-fenced authority is the
-- sole place that can decide the launch exceeded its bounded runtime.

CREATE OR REPLACE FUNCTION public.fail_silent_accepted_workspace_run_task(
  p_task_id text,
  p_space_id text,
  p_launch_token text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NULLIF(btrim(p_task_id), '') IS NULL
    OR NULLIF(btrim(p_space_id), '') IS NULL
    OR NULLIF(btrim(p_launch_token), '') IS NULL
    OR p_launch_token !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    RETURN false;
  END IF;

  UPDATE public."WorkspaceRunTask" AS t
  SET status = 'failed',
      error = CASE
        WHEN t.status = 'launching'
          THEN 'Workspace continuation runtime accepted the launch but did not start.'
        ELSE 'Workspace continuation runtime started but did not finish.'
      END,
      "updatedAt" = now()
  WHERE t.id = p_task_id
    AND t."spaceId" = p_space_id
    AND t.status IN ('launching', 'running')
    AND t."launchToken" = p_launch_token
    AND t."modalAcceptedAt" IS NOT NULL
    AND t."modalAcceptedAt" < now() - interval '5 minutes'
    AND t."cancellationRequestedAt" IS NULL
    AND (
      t.status = 'running'
      OR NOT EXISTS (
        SELECT 1
        FROM public."WorkspaceRunTaskEvent" AS e
        WHERE e."taskId" = t.id
          AND e.type = 'workspace_started'
      )
    );

  -- Concurrent or replayed timeout jobs serialize on the task row. Once one
  -- wins, status is terminal and every later invocation returns false.
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.fail_silent_accepted_workspace_run_task(text, text, text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.fail_silent_accepted_workspace_run_task(text, text, text) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.fail_silent_accepted_workspace_run_task(text, text, text) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.fail_silent_accepted_workspace_run_task(text, text, text) TO service_role;
  END IF;
END;
$$;
