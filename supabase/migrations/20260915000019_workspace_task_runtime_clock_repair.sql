-- The accepted-silence repair originally measured both launching and running
-- tasks from modalAcceptedAt. Modal can accept a request and queue it before
-- workspace_started, so a newly started bounded task could otherwise be timed
-- out immediately. Launching remains acceptance-clocked; running is measured
-- from the fenced workspace_started update (and any future task activity).

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

  UPDATE public."WorkspaceRunTask" AS task
  SET status = 'failed',
      error = CASE
        WHEN task.status = 'launching'
          THEN 'Workspace continuation runtime accepted the launch but did not start.'
        ELSE 'Workspace continuation runtime started but did not finish.'
      END,
      "updatedAt" = now()
  WHERE task.id = p_task_id
    AND task."spaceId" = p_space_id
    AND task.status IN ('launching', 'running')
    AND task."launchToken" = p_launch_token
    AND task."modalAcceptedAt" IS NOT NULL
    AND task."cancellationRequestedAt" IS NULL
    AND (
      (
        task.status = 'launching'
        AND task."modalAcceptedAt" < now() - interval '5 minutes'
        AND NOT EXISTS (
          SELECT 1
          FROM public."WorkspaceRunTaskEvent" AS event
          WHERE event."taskId" = task.id
            AND event.type = 'workspace_started'
        )
      )
      OR (
        task.status = 'running'
        AND task."updatedAt" < now() - interval '5 minutes'
      )
    );

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
