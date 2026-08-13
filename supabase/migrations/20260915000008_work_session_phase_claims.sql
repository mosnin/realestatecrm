-- WorkSession planning, research steps, and artifact generation call remote
-- providers. Queue delivery is at-least-once, so checking JSON step status in
-- application code is not a concurrency lock: two deliveries can both read
-- "pending" and execute the same provider/tool work. A single leased phase
-- claim on the WorkSession row serializes those phases. All result patches are
-- fenced by the opaque claim token and the database clock.

ALTER TABLE "WorkSession"
  ADD COLUMN IF NOT EXISTS "phaseClaimToken" text,
  ADD COLUMN IF NOT EXISTS "phaseClaimKind" text,
  ADD COLUMN IF NOT EXISTS "phaseClaimKey" text,
  ADD COLUMN IF NOT EXISTS "phaseLeaseExpiresAt" timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'WorkSession_phase_claim_kind_check'
  ) THEN
    ALTER TABLE "WorkSession"
      ADD CONSTRAINT "WorkSession_phase_claim_kind_check"
      CHECK ("phaseClaimKind" IS NULL OR "phaseClaimKind" IN ('plan','step','artifact'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "WorkSession_phase_lease_idx"
  ON "WorkSession" ("phaseLeaseExpiresAt")
  WHERE "phaseClaimToken" IS NOT NULL;

CREATE OR REPLACE FUNCTION claim_work_session_phase(
  p_session_id text,
  p_phase text,
  p_phase_key text,
  p_token text,
  p_lease_seconds integer DEFAULT 900
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_session "WorkSession"%ROWTYPE;
  v_expected_key text;
  v_lease_seconds integer;
BEGIN
  IF p_phase NOT IN ('plan','step','artifact') THEN
    RAISE EXCEPTION 'invalid WorkSession phase';
  END IF;
  IF p_phase_key IS NULL OR length(p_phase_key) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'invalid WorkSession phase key';
  END IF;
  IF p_token IS NULL OR length(p_token) NOT BETWEEN 16 AND 200 THEN
    RAISE EXCEPTION 'invalid WorkSession claim token';
  END IF;
  v_lease_seconds := LEAST(GREATEST(COALESCE(p_lease_seconds, 900), 60), 3600);

  SELECT * INTO v_session
  FROM "WorkSession"
  WHERE id = p_session_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  -- A cancellation or any already-completed transition wins over a queued
  -- delivery. Workspace execution has its own WorkspaceRun launch fence; only
  -- its fixed planning packet uses this WorkSession claim.
  IF p_phase = 'plan' AND v_session.status <> 'planning' THEN RETURN false; END IF;
  IF p_phase IN ('step','artifact') AND v_session.status <> 'running' THEN RETURN false; END IF;
  IF p_phase IN ('step','artifact') AND COALESCE(v_session.kind, 'research') <> 'research' THEN
    RETURN false;
  END IF;

  IF p_phase = 'plan' AND p_phase_key <> 'plan' THEN RETURN false; END IF;

  IF p_phase IN ('step','artifact') THEN
    SELECT item.step->>'id' INTO v_expected_key
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(v_session.plan) = 'array' THEN v_session.plan ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS item(step, ordinal)
    WHERE COALESCE(item.step->>'status', 'pending') NOT IN ('done','skipped')
    ORDER BY item.ordinal
    LIMIT 1;

    IF p_phase = 'step' AND (v_expected_key IS NULL OR v_expected_key <> p_phase_key) THEN
      RETURN false;
    END IF;
    IF p_phase = 'artifact' AND (v_expected_key IS NOT NULL OR p_phase_key <> 'artifact') THEN
      RETURN false;
    END IF;
  END IF;

  -- A missing lease on a populated claim fails closed. An expired, well-formed
  -- lease may be replaced, which is the crash-recovery path.
  IF v_session."phaseClaimToken" IS NOT NULL AND (
    v_session."phaseLeaseExpiresAt" IS NULL
    OR v_session."phaseLeaseExpiresAt" >= now()
  ) THEN
    RETURN false;
  END IF;

  UPDATE "WorkSession"
  SET "phaseClaimToken" = p_token,
      "phaseClaimKind" = p_phase,
      "phaseClaimKey" = p_phase_key,
      "phaseLeaseExpiresAt" = now() + make_interval(secs => v_lease_seconds),
      "updatedAt" = now()
  WHERE id = p_session_id;
  RETURN true;
END $$;

-- The application uses this function for both an in-progress step marker and
-- the terminal result. It accepts only phase-owned columns, verifies the live
-- status again, rejects expired/replaced tokens, and applies the patch while
-- holding the same row lock. p_release=false renews the lease for the next
-- bounded provider call; terminal patches clear all claim columns.
CREATE OR REPLACE FUNCTION patch_work_session_phase(
  p_session_id text,
  p_phase text,
  p_phase_key text,
  p_token text,
  p_patch jsonb,
  p_release boolean DEFAULT true,
  p_lease_seconds integer DEFAULT 900
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_session "WorkSession"%ROWTYPE;
  v_unknown jsonb;
  v_status text;
  v_lease_seconds integer;
BEGIN
  IF p_phase NOT IN ('plan','step','artifact') OR p_patch IS NULL
    OR jsonb_typeof(p_patch) <> 'object' OR p_release IS NULL
  THEN
    RAISE EXCEPTION 'invalid WorkSession phase patch';
  END IF;
  v_lease_seconds := LEAST(GREATEST(COALESCE(p_lease_seconds, 900), 60), 3600);

  SELECT * INTO v_session
  FROM "WorkSession"
  WHERE id = p_session_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  IF v_session."phaseClaimToken" IS NULL OR v_session."phaseClaimToken" <> p_token
    OR v_session."phaseClaimKind" IS NULL OR v_session."phaseClaimKind" <> p_phase
    OR v_session."phaseClaimKey" IS NULL OR v_session."phaseClaimKey" <> p_phase_key
    OR v_session."phaseLeaseExpiresAt" IS NULL OR v_session."phaseLeaseExpiresAt" < now()
  THEN
    RETURN false;
  END IF;
  IF p_phase = 'plan' AND v_session.status <> 'planning' THEN RETURN false; END IF;
  IF p_phase IN ('step','artifact') AND v_session.status <> 'running' THEN RETURN false; END IF;

  v_unknown := CASE p_phase
    WHEN 'plan' THEN p_patch - ARRAY['status','plan','question','error']
    WHEN 'step' THEN p_patch - ARRAY['status','plan','findings','error']
    WHEN 'artifact' THEN p_patch - ARRAY[
      'status','summary','artifactFileId','artifactName','error','completedAt'
    ]
  END;
  IF v_unknown <> '{}'::jsonb THEN
    RAISE EXCEPTION 'WorkSession phase patch contains unowned columns';
  END IF;

  IF p_patch ? 'plan' AND jsonb_typeof(p_patch->'plan') <> 'array' THEN
    RAISE EXCEPTION 'WorkSession plan must be an array';
  END IF;
  IF p_patch ? 'findings' AND jsonb_typeof(p_patch->'findings') <> 'array' THEN
    RAISE EXCEPTION 'WorkSession findings must be an array';
  END IF;
  v_status := CASE WHEN p_patch ? 'status' THEN p_patch->>'status' ELSE NULL END;
  IF p_phase = 'plan' AND (
    NOT p_release OR v_status IS NULL
    OR v_status NOT IN ('awaiting_input','awaiting_approval','running','failed')
  ) THEN
    RAISE EXCEPTION 'invalid planning transition';
  END IF;
  IF p_phase = 'step' AND v_status IS NOT NULL AND v_status NOT IN ('running','failed') THEN
    RAISE EXCEPTION 'invalid step transition';
  END IF;
  IF p_phase = 'artifact' AND (
    (p_release AND v_status IS DISTINCT FROM 'completed')
    OR (NOT p_release AND p_patch <> '{}'::jsonb)
  ) THEN
    RAISE EXCEPTION 'invalid artifact transition';
  END IF;

  UPDATE "WorkSession"
  SET status = CASE WHEN p_patch ? 'status' THEN p_patch->>'status' ELSE status END,
      plan = CASE WHEN p_patch ? 'plan' THEN p_patch->'plan' ELSE plan END,
      findings = CASE WHEN p_patch ? 'findings' THEN p_patch->'findings' ELSE findings END,
      question = CASE WHEN p_patch ? 'question' THEN p_patch->>'question' ELSE question END,
      summary = CASE WHEN p_patch ? 'summary' THEN p_patch->>'summary' ELSE summary END,
      "artifactFileId" = CASE WHEN p_patch ? 'artifactFileId' THEN p_patch->>'artifactFileId' ELSE "artifactFileId" END,
      "artifactName" = CASE WHEN p_patch ? 'artifactName' THEN p_patch->>'artifactName' ELSE "artifactName" END,
      error = CASE WHEN p_patch ? 'error' THEN p_patch->>'error' ELSE error END,
      "completedAt" = CASE
        WHEN p_patch ? 'completedAt' THEN NULLIF(p_patch->>'completedAt','')::timestamptz
        ELSE "completedAt"
      END,
      "phaseClaimToken" = CASE WHEN p_release THEN NULL ELSE "phaseClaimToken" END,
      "phaseClaimKind" = CASE WHEN p_release THEN NULL ELSE "phaseClaimKind" END,
      "phaseClaimKey" = CASE WHEN p_release THEN NULL ELSE "phaseClaimKey" END,
      "phaseLeaseExpiresAt" = CASE
        WHEN p_release THEN NULL
        ELSE now() + make_interval(secs => v_lease_seconds)
      END,
      "updatedAt" = now()
  WHERE id = p_session_id;
  RETURN true;
END $$;

REVOKE EXECUTE ON FUNCTION claim_work_session_phase(text,text,text,text,integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION patch_work_session_phase(text,text,text,text,jsonb,boolean,integer) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE EXECUTE ON FUNCTION claim_work_session_phase(text,text,text,text,integer) FROM anon;
    REVOKE EXECUTE ON FUNCTION patch_work_session_phase(text,text,text,text,jsonb,boolean,integer) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE EXECUTE ON FUNCTION claim_work_session_phase(text,text,text,text,integer) FROM authenticated;
    REVOKE EXECUTE ON FUNCTION patch_work_session_phase(text,text,text,text,jsonb,boolean,integer) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION claim_work_session_phase(text,text,text,text,integer) TO service_role;
    GRANT EXECUTE ON FUNCTION patch_work_session_phase(text,text,text,text,jsonb,boolean,integer) TO service_role;
  END IF;
END $$;
