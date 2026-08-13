-- Upgrade repair: WorkspaceRun rows created before launch receipts were added
-- can be accepted and silent without a matching claimed receipt. The original
-- recovery function raised in that state, aborting the entire recovery batch.
-- Preserve receipt history when present, but make the token-fenced terminal
-- transition authoritative for both legacy and current rows.

CREATE OR REPLACE FUNCTION public.fail_stale_accepted_workspace_launch(
  p_run_id text,
  p_space_id text,
  p_token text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_run public."WorkspaceRun"%ROWTYPE;
  v_session public."WorkSession"%ROWTYPE;
  v_attempt integer;
  v_error CONSTANT text := 'Workspace runtime accepted the launch but did not start.';
BEGIN
  IF NULLIF(btrim(p_run_id), '') IS NULL
    OR NULLIF(btrim(p_space_id), '') IS NULL
    OR NULLIF(btrim(p_token), '') IS NULL
  THEN
    RETURN false;
  END IF;

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
    OR v_run.status <> 'launching'
    OR v_run."launchToken" IS DISTINCT FROM p_token
    OR v_run."modalAcceptedAt" IS NULL
    OR v_run."modalAcceptedAt" >= now() - interval '4 minutes'
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
      'accepted runtime did not start'
    )
    ON CONFLICT ("runId", "launchToken", state) DO NOTHING;
  END IF;

  UPDATE public."WorkspaceRun"
  SET status = 'failed', error = v_error, "updatedAt" = now()
  WHERE id = p_run_id;

  UPDATE public."WorkSession"
  SET status = 'failed',
      error = v_error,
      plan = COALESCE((
        SELECT jsonb_agg(
          jsonb_set(step.value, '{status}', to_jsonb('skipped'::text))
          ORDER BY step.ordinality
        )
        FROM jsonb_array_elements(COALESCE(v_session.plan, '[]'::jsonb))
          WITH ORDINALITY AS step(value, ordinality)
      ), '[]'::jsonb),
      "completedAt" = NULL,
      "updatedAt" = now()
  WHERE id = v_run."workSessionId" AND "spaceId" = p_space_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.fail_stale_accepted_workspace_launch(text,text,text) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.fail_stale_accepted_workspace_launch(text,text,text) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.fail_stale_accepted_workspace_launch(text,text,text) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.fail_stale_accepted_workspace_launch(text,text,text) TO service_role;
  END IF;
END;
$$;
