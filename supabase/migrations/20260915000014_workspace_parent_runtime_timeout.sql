-- A parent WorkspaceRun becomes running after its first fenced callback. If
-- the bounded Modal worker then crashes or reaches its 180-second ceiling,
-- there is no later callback to make the parent and WorkSession terminal.
-- Extend the existing five-minute recovery scan with a conservative idle
-- window and keep the terminal decision inside one token-fenced transaction.

CREATE INDEX IF NOT EXISTS "WorkspaceRun_parent_runtime_recovery_idx"
  ON public."WorkspaceRun" ("spaceId", "updatedAt")
  WHERE status = 'running' AND "cancellationRequestedAt" IS NULL;

CREATE OR REPLACE FUNCTION public.list_workspace_run_recovery_candidates(
  p_limit integer DEFAULT 25,
  p_space_ids text[] DEFAULT ARRAY[]::text[]
)
RETURNS TABLE(
  "runId" text,
  "workSessionId" text,
  "spaceId" text,
  "sessionStatus" text,
  "runStatus" text,
  "launchToken" text,
  action text,
  "recoveryKey" text,
  "staleForSeconds" integer
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    wr.id,
    wr."workSessionId",
    wr."spaceId",
    ws.status,
    wr.status,
    wr."launchToken",
    CASE
      WHEN wr.status = 'launching' AND wr."modalAcceptedAt" IS NOT NULL
        THEN 'fail_accepted_silent'
      WHEN wr.status = 'running'
        THEN 'fail_runtime_timeout'
      WHEN ws.status = 'planning'
        THEN 'plan'
      ELSE 'execute'
    END,
    concat_ws(
      ':',
      wr.status,
      COALESCE(wr."launchToken", 'unclaimed'),
      floor(extract(epoch FROM wr."updatedAt"))::bigint::text
    ),
    GREATEST(0, floor(extract(epoch FROM now() - wr."updatedAt")))::integer
  FROM public."WorkspaceRun" AS wr
  JOIN public."WorkSession" AS ws
    ON ws.id = wr."workSessionId"
   AND ws."spaceId" = wr."spaceId"
  WHERE
    wr."spaceId" = ANY(COALESCE(p_space_ids, ARRAY[]::text[]))
    AND wr."cancellationRequestedAt" IS NULL
    AND (
      (
        ws.status = 'planning'
        AND wr.status = 'queued'
        AND wr."updatedAt" < now() - interval '5 minutes'
      )
      OR (
        ws.status = 'running'
        AND wr.status = 'queued'
        AND wr."updatedAt" < now() - interval '30 seconds'
      )
      OR (
        ws.status = 'running'
        AND wr.status = 'launching'
        AND wr."launchLeaseExpiresAt" < now()
        AND wr."modalAcceptedAt" IS NULL
      )
      OR (
        ws.status = 'running'
        AND wr.status = 'launching'
        AND wr."modalAcceptedAt" < now() - interval '4 minutes'
      )
      OR (
        ws.status = 'running'
        AND wr.status = 'running'
        AND wr."modalAcceptedAt" IS NOT NULL
        AND NULLIF(btrim(wr."launchToken"), '') IS NOT NULL
        AND wr."updatedAt" < now() - interval '6 minutes'
      )
    )
  ORDER BY wr."updatedAt" ASC, wr.id ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 25), 1), 50)
$$;

CREATE OR REPLACE FUNCTION public.fail_stale_running_workspace_run(
  p_run_id text,
  p_space_id text,
  p_token text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_run public."WorkspaceRun"%ROWTYPE;
  v_session public."WorkSession"%ROWTYPE;
  v_attempt integer;
  v_event_sequence integer;
  v_error CONSTANT text := 'Workspace runtime started but did not finish within its bounded execution window.';
BEGIN
  IF NULLIF(btrim(p_run_id), '') IS NULL
    OR NULLIF(btrim(p_space_id), '') IS NULL
    OR NULLIF(btrim(p_token), '') IS NULL
  THEN
    RETURN false;
  END IF;

  -- Match cancellation and normal terminal completion: session first, then
  -- run. Every parent callback locks the run row before mutating it.
  SELECT ws.* INTO v_session
  FROM public."WorkSession" AS ws
  JOIN public."WorkspaceRun" AS wr ON wr."workSessionId" = ws.id
  WHERE wr.id = p_run_id
    AND wr."spaceId" = p_space_id
    AND ws."spaceId" = p_space_id
  FOR UPDATE OF ws;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT * INTO v_run
  FROM public."WorkspaceRun"
  WHERE id = p_run_id AND "spaceId" = p_space_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_session.status <> 'running'
    OR v_run.status <> 'running'
    OR v_run."launchToken" IS DISTINCT FROM p_token
    OR v_run."modalAcceptedAt" IS NULL
    OR v_run."updatedAt" >= now() - interval '6 minutes'
    OR v_run."cancellationRequestedAt" IS NOT NULL
  THEN
    RETURN false;
  END IF;

  SELECT receipt.attempt INTO v_attempt
  FROM public."WorkspaceRunLaunchReceipt" AS receipt
  WHERE receipt."runId" = p_run_id
    AND receipt."launchToken" = p_token
    AND receipt.state = 'claimed';

  IF v_attempt IS NOT NULL THEN
    INSERT INTO public."WorkspaceRunLaunchReceipt"(
      "runId", "spaceId", "launchToken", attempt, state, reason
    )
    VALUES (
      p_run_id, p_space_id, p_token, v_attempt, 'failed',
      'started runtime exceeded bounded execution window'
    )
    ON CONFLICT ("runId", "launchToken", state) DO NOTHING;
  END IF;

  SELECT COALESCE(max(event.sequence), 0) + 1 INTO v_event_sequence
  FROM public."WorkspaceRunEvent" AS event
  WHERE event."runId" = p_run_id;

  UPDATE public."WorkspaceRun"
  SET status = 'failed', error = v_error, "updatedAt" = now()
  WHERE id = p_run_id;

  UPDATE public."WorkSession"
  SET status = 'failed',
      plan = COALESCE((
        SELECT jsonb_agg(
          jsonb_set(step.value, '{status}', to_jsonb('skipped'::text))
          ORDER BY step.ordinality
        )
        FROM jsonb_array_elements(COALESCE(v_session.plan, '[]'::jsonb))
          WITH ORDINALITY AS step(value, ordinality)
      ), '[]'::jsonb),
      error = v_error,
      "completedAt" = NULL,
      "updatedAt" = now()
  WHERE id = v_run."workSessionId" AND "spaceId" = p_space_id;

  INSERT INTO public."WorkspaceRunEvent"("runId", sequence, type, message)
  VALUES (p_run_id, v_event_sequence, 'failed', v_error);

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.list_workspace_run_recovery_candidates(integer, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_stale_running_workspace_run(text, text, text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.list_workspace_run_recovery_candidates(integer, text[]) FROM anon;
    REVOKE ALL ON FUNCTION public.fail_stale_running_workspace_run(text, text, text) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.list_workspace_run_recovery_candidates(integer, text[]) FROM authenticated;
    REVOKE ALL ON FUNCTION public.fail_stale_running_workspace_run(text, text, text) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.list_workspace_run_recovery_candidates(integer, text[]) TO service_role;
    GRANT EXECUTE ON FUNCTION public.fail_stale_running_workspace_run(text, text, text) TO service_role;
  END IF;
END;
$$;
