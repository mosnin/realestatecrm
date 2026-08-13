-- A research WorkSession whose every bounded step failed previously advanced
-- to artifact generation with no findings and could be reported as completed.
-- Fail that state honestly while preserving the phase-token concurrency fence.

CREATE OR REPLACE FUNCTION fail_empty_work_session_artifact(
  p_session_id text,
  p_token text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public."WorkSession"%ROWTYPE;
BEGIN
  IF p_session_id IS NULL OR length(p_session_id) NOT BETWEEN 1 AND 200
    OR p_token IS NULL OR length(p_token) NOT BETWEEN 16 AND 200
  THEN
    RAISE EXCEPTION 'invalid empty WorkSession artifact failure request';
  END IF;

  SELECT * INTO v_session
  FROM public."WorkSession"
  WHERE id = p_session_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  IF v_session.status <> 'running'
    OR COALESCE(v_session.kind, 'research') <> 'research'
    OR v_session."phaseClaimToken" IS NULL
    OR v_session."phaseClaimToken" <> p_token
    OR v_session."phaseClaimKind" IS DISTINCT FROM 'artifact'
    OR v_session."phaseClaimKey" IS DISTINCT FROM 'artifact'
    OR v_session."phaseLeaseExpiresAt" IS NULL
    OR v_session."phaseLeaseExpiresAt" < now()
  THEN
    RETURN false;
  END IF;

  IF jsonb_typeof(COALESCE(v_session.findings, '[]'::jsonb)) <> 'array'
    OR jsonb_array_length(COALESCE(v_session.findings, '[]'::jsonb)) <> 0
  THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(v_session.plan) = 'array'
        THEN v_session.plan ELSE '[]'::jsonb END
    ) AS item(step)
    WHERE COALESCE(item.step->>'status', 'pending') NOT IN ('done', 'skipped')
  ) THEN
    RETURN false;
  END IF;

  UPDATE public."WorkSession"
  SET status = 'failed',
      error = 'All research steps failed; no report was produced.',
      "completedAt" = NULL,
      "phaseClaimToken" = NULL,
      "phaseClaimKind" = NULL,
      "phaseClaimKey" = NULL,
      "phaseLeaseExpiresAt" = NULL,
      "updatedAt" = now()
  WHERE id = p_session_id;
  RETURN true;
END $$;

REVOKE EXECUTE ON FUNCTION fail_empty_work_session_artifact(text,text) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE EXECUTE ON FUNCTION fail_empty_work_session_artifact(text,text) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE EXECUTE ON FUNCTION fail_empty_work_session_artifact(text,text) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION fail_empty_work_session_artifact(text,text) TO service_role;
  END IF;
END $$;
