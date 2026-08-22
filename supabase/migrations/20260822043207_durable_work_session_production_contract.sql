-- Production catch-up for the durable research WorkSession rail.
--
-- The application already executes plan, step, and artifact phases as separate
-- Cloudflare Queue deliveries, but the production database predates the
-- columns and authorities those deliveries require. Keep this migration
-- intentionally limited to the established research rail: private WorkspaceRun
-- tables remain behind their existing independent rollout migrations.
--
-- Ordering note: this provider-recorded current-date migration repairs production without
-- applying the repository's future-dated feature backlog.

ALTER TABLE public."WorkSession"
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'research';

ALTER TABLE public."WorkSession"
  DROP CONSTRAINT IF EXISTS "WorkSession_kind_check";
ALTER TABLE public."WorkSession"
  ADD CONSTRAINT "WorkSession_kind_check"
  CHECK (kind IN ('research','workspace'));

COMMENT ON COLUMN public."WorkSession".kind IS
  'Execution rail discriminator. Production enables research; workspace remains feature-gated.';

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


-- Recover the two commit-before-enqueue windows: the initial plan wake and a
-- later chained advance wake. Queue deliveries are only wake-up signals; the
-- phase claim functions above remain the sole execution authority.
CREATE INDEX IF NOT EXISTS "WorkSession_research_recovery_scan_idx"
  ON public."WorkSession" ("updatedAt", id)
  WHERE kind = 'research' AND status IN ('planning', 'running');

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
    AND session."updatedAt" < now() - interval '10 minutes'
    AND (
      session."phaseClaimToken" IS NULL
      OR session."phaseLeaseExpiresAt" < now()
    )
  ORDER BY session."updatedAt" ASC, session.id ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 25), 1), 25)
$$;

REVOKE ALL ON FUNCTION public.list_research_work_session_recovery_candidates(integer)
  FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.list_research_work_session_recovery_candidates(integer)
      FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.list_research_work_session_recovery_candidates(integer)
      FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.list_research_work_session_recovery_candidates(integer)
      TO service_role;
  END IF;
END;
$$;


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

-- WorkSession artifact publication used to expose a File row, complete the
-- parent, insert proposed actions, and then reopen the parent in four separate
-- commits. A cancelled or superseded artifact owner could therefore publish a
-- File, and a crash could leave completed sessions with hidden proposed
-- actions. These service-only authorities make those state changes atomic.

CREATE OR REPLACE FUNCTION public.finalize_work_session_artifact(
  p_session_id text,
  p_space_id text,
  p_token text,
  p_summary text,
  p_file jsonb,
  p_actions jsonb DEFAULT '[]'::jsonb
)
RETURNS TABLE(
  "finalStatus" text,
  "artifactFileId" text,
  "proposedCount" integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public."WorkSession"%ROWTYPE;
  v_owner_clerk_id text;
  v_file_id text;
  v_storage_key text;
  v_file_name text;
  v_mime_type text;
  v_size_bytes bigint;
  v_expected_key_prefix text;
  v_action jsonb;
  v_action_id text;
  v_action_count integer;
  v_ordinal bigint;
  v_final_status text;
BEGIN
  IF NULLIF(btrim(p_session_id), '') IS NULL
    OR NULLIF(btrim(p_space_id), '') IS NULL
    OR NULLIF(p_token, '') IS NULL
    OR length(p_token) NOT BETWEEN 16 AND 200
    OR p_summary IS NULL
    OR length(p_summary) > 500
    OR p_file IS NULL
    OR jsonb_typeof(p_file) <> 'object'
    OR p_actions IS NULL
    OR jsonb_typeof(p_actions) <> 'array'
    OR jsonb_array_length(p_actions) > 10
  THEN
    RAISE EXCEPTION 'invalid WorkSession artifact finalization payload';
  END IF;

  IF p_file - ARRAY['storageKey','name','mimeType','sizeBytes'] <> '{}'::jsonb
    OR NOT (p_file ?& ARRAY['storageKey','name','mimeType','sizeBytes'])
    OR jsonb_typeof(p_file->'storageKey') <> 'string'
    OR jsonb_typeof(p_file->'name') <> 'string'
    OR jsonb_typeof(p_file->'mimeType') <> 'string'
    OR jsonb_typeof(p_file->'sizeBytes') <> 'number'
    OR (p_file->>'sizeBytes') !~ '^[0-9]+$'
  THEN
    RAISE EXCEPTION 'invalid WorkSession artifact file metadata';
  END IF;

  v_storage_key := p_file->>'storageKey';
  v_file_name := p_file->>'name';
  v_mime_type := p_file->>'mimeType';
  v_size_bytes := (p_file->>'sizeBytes')::bigint;
  v_expected_key_prefix := 'files/' || p_space_id || '/'
    || left(p_session_id, 8) || '-' || left(p_token, 8) || '-';

  IF length(v_storage_key) NOT BETWEEN 1 AND 1024
    OR left(v_storage_key, length(v_expected_key_prefix)) <> v_expected_key_prefix
    OR v_storage_key LIKE '%..%'
    OR v_storage_key LIKE E'%\\\\%'
    OR length(v_file_name) NOT BETWEEN 1 AND 180
    OR right(lower(v_file_name), 3) <> '.md'
    OR v_file_name !~ '^[A-Za-z0-9_ -]+[.]md$'
    OR v_file_name LIKE '%/%'
    OR v_file_name LIKE E'%\\\\%'
    OR v_mime_type <> 'text/markdown'
    OR v_size_bytes NOT BETWEEN 1 AND 10485760
  THEN
    RAISE EXCEPTION 'unsafe WorkSession artifact file metadata';
  END IF;

  SELECT * INTO v_session
  FROM public."WorkSession"
  WHERE id = p_session_id AND "spaceId" = p_space_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  -- The row lock and database clock make cancellation, lease expiry, and a
  -- newer recovery claim win before any File/action metadata becomes visible.
  IF v_session.status <> 'running'
    OR COALESCE(v_session.kind, 'research') <> 'research'
    OR v_session."phaseClaimKind" IS DISTINCT FROM 'artifact'
    OR v_session."phaseClaimKey" IS DISTINCT FROM 'artifact'
    OR v_session."phaseClaimToken" IS DISTINCT FROM p_token
    OR v_session."phaseLeaseExpiresAt" IS NULL
    OR v_session."phaseLeaseExpiresAt" < now()
  THEN
    RETURN;
  END IF;

  IF jsonb_typeof(v_session.findings) <> 'array'
    OR jsonb_array_length(v_session.findings) = 0
    OR jsonb_typeof(v_session.plan) <> 'array'
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_session.plan) AS planned(step)
      WHERE COALESCE(planned.step->>'status', 'pending') NOT IN ('done','skipped')
    )
  THEN
    RETURN;
  END IF;

  SELECT owner."clerkId" INTO v_owner_clerk_id
  FROM public."Space" AS space
  JOIN public."User" AS owner ON owner.id = space."ownerId"
  WHERE space.id = p_space_id;
  IF v_owner_clerk_id IS NULL THEN
    RAISE EXCEPTION 'WorkSession artifact owner is missing';
  END IF;

  -- IDs depend on the opaque winning token, so retries cannot create a second
  -- File or second set of proposals. Exact-row verification makes a collision
  -- fail the whole transaction rather than silently adopting foreign metadata.
  v_file_id := 'work-session-artifact-' || md5(p_session_id || ':' || p_token);
  INSERT INTO public."File"(
    id, "spaceId", "userId", "storageKey", name, "mimeType",
    category, "sizeBytes", "isPublic"
  ) VALUES (
    v_file_id, p_space_id, v_owner_clerk_id, v_storage_key, v_file_name,
    v_mime_type, 'document', v_size_bytes, false
  )
  ON CONFLICT (id) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM public."File" AS file
    WHERE file.id = v_file_id
      AND file."spaceId" = p_space_id
      AND file."userId" = v_owner_clerk_id
      AND file."storageKey" = v_storage_key
      AND file.name = v_file_name
      AND file."mimeType" = v_mime_type
      AND file.category = 'document'
      AND file."sizeBytes" = v_size_bytes
      AND file."isPublic" = false
  ) THEN
    RAISE EXCEPTION 'WorkSession artifact idempotency collision';
  END IF;

  v_action_count := jsonb_array_length(p_actions);
  FOR v_action, v_ordinal IN
    SELECT item.action, item.ordinal
    FROM jsonb_array_elements(p_actions) WITH ORDINALITY AS item(action, ordinal)
  LOOP
    IF jsonb_typeof(v_action) <> 'object'
      OR v_action - ARRAY['tool','args','summary','rationale'] <> '{}'::jsonb
      OR NOT (v_action ?& ARRAY['tool','args','summary'])
      OR jsonb_typeof(v_action->'tool') <> 'string'
      OR jsonb_typeof(v_action->'args') <> 'object'
      OR jsonb_typeof(v_action->'summary') <> 'string'
      OR (
        v_action ? 'rationale'
        AND jsonb_typeof(v_action->'rationale') NOT IN ('string','null')
      )
      OR (v_action->>'tool') NOT IN (
        'send_email', 'draft_email', 'send_message', 'create_task',
        'schedule_follow_up', 'book_tour', 'add_note', 'tag_contact',
        'update_deal_stage'
      )
      OR length(v_action->>'summary') NOT BETWEEN 1 AND 500
      OR length(COALESCE(v_action->>'rationale', '')) > 300
    THEN
      RAISE EXCEPTION 'invalid WorkSession action proposal at position %', v_ordinal;
    END IF;

    v_action_id := 'work-session-action-'
      || md5(p_session_id || ':' || p_token || ':' || v_ordinal::text);
    INSERT INTO public."WorkSessionAction"(
      id, "sessionId", "spaceId", tool, args, summary, rationale, status
    ) VALUES (
      v_action_id, p_session_id, p_space_id, v_action->>'tool',
      v_action->'args', v_action->>'summary', v_action->>'rationale', 'proposed'
    )
    ON CONFLICT (id) DO NOTHING;

    IF NOT EXISTS (
      SELECT 1 FROM public."WorkSessionAction" AS action
      WHERE action.id = v_action_id
        AND action."sessionId" = p_session_id
        AND action."spaceId" = p_space_id
        AND action.tool = v_action->>'tool'
        AND action.args = v_action->'args'
        AND action.summary = v_action->>'summary'
        AND action.rationale IS NOT DISTINCT FROM v_action->>'rationale'
        AND action.status = 'proposed'
    ) THEN
      RAISE EXCEPTION 'WorkSession action idempotency collision at position %', v_ordinal;
    END IF;
  END LOOP;

  IF (
    SELECT count(*) FROM public."WorkSessionAction" AS action
    WHERE action."sessionId" = p_session_id
  ) <> v_action_count THEN
    RAISE EXCEPTION 'unexpected existing WorkSession actions';
  END IF;

  v_final_status := CASE WHEN v_action_count > 0
    THEN 'awaiting_actions' ELSE 'completed' END;
  UPDATE public."WorkSession"
  SET status = v_final_status,
      summary = p_summary,
      "artifactFileId" = v_file_id,
      "artifactName" = v_file_name,
      error = NULL,
      "completedAt" = CASE WHEN v_action_count = 0 THEN now() ELSE NULL END,
      "phaseClaimToken" = NULL,
      "phaseClaimKind" = NULL,
      "phaseClaimKey" = NULL,
      "phaseLeaseExpiresAt" = NULL,
      "updatedAt" = now()
  WHERE id = p_session_id
    AND "spaceId" = p_space_id
    AND status = 'running'
    AND "phaseClaimToken" = p_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'WorkSession artifact finalization fence changed under lock';
  END IF;

  RETURN QUERY SELECT v_final_status, v_file_id, v_action_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_work_session_action_decision(
  p_session_id text,
  p_action_id text,
  p_space_id text,
  p_decision text,
  p_decided_by_user_id text
)
RETURNS TABLE(id text, tool text, args jsonb, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public."WorkSession"%ROWTYPE;
  v_next_status text;
  v_action_id text;
  v_action_tool text;
  v_action_args jsonb;
BEGIN
  IF NULLIF(btrim(p_session_id), '') IS NULL
    OR NULLIF(btrim(p_action_id), '') IS NULL
    OR NULLIF(btrim(p_space_id), '') IS NULL
    OR NULLIF(btrim(p_decided_by_user_id), '') IS NULL
    OR length(p_decided_by_user_id) > 200
    OR p_decision NOT IN ('approve','deny')
  THEN
    RAISE EXCEPTION 'invalid WorkSession action decision';
  END IF;

  SELECT * INTO v_session
  FROM public."WorkSession"
  WHERE "WorkSession".id = p_session_id
    AND "WorkSession"."spaceId" = p_space_id
  FOR UPDATE;
  IF NOT FOUND OR v_session.status <> 'awaiting_actions' THEN RETURN; END IF;

  v_next_status := CASE WHEN p_decision = 'approve' THEN 'approved' ELSE 'denied' END;
  UPDATE public."WorkSessionAction" AS action
  SET status = v_next_status,
      "decidedByUserId" = p_decided_by_user_id,
      "decidedAt" = now()
  WHERE action.id = p_action_id
    AND action."sessionId" = p_session_id
    AND action."spaceId" = p_space_id
    AND action.status = 'proposed'
  RETURNING action.id, action.tool, action.args
  INTO v_action_id, v_action_tool, v_action_args;

  IF NOT FOUND THEN RETURN; END IF;
  IF p_decision = 'deny' AND NOT EXISTS (
    SELECT 1 FROM public."WorkSessionAction" AS pending
    WHERE pending."sessionId" = p_session_id
      AND pending."spaceId" = p_space_id
      AND pending.status IN ('proposed','approved')
  ) THEN
    UPDATE public."WorkSession"
    SET status = 'completed', "completedAt" = now(), "updatedAt" = now()
    WHERE "WorkSession".id = p_session_id
      AND "WorkSession"."spaceId" = p_space_id
      AND "WorkSession".status = 'awaiting_actions';
  END IF;
  RETURN QUERY SELECT v_action_id, v_action_tool, v_action_args, v_next_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_work_session_action_execution(
  p_session_id text,
  p_action_id text,
  p_space_id text,
  p_terminal_status text,
  p_result jsonb,
  p_error text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public."WorkSession"%ROWTYPE;
BEGIN
  IF NULLIF(btrim(p_session_id), '') IS NULL
    OR NULLIF(btrim(p_action_id), '') IS NULL
    OR NULLIF(btrim(p_space_id), '') IS NULL
    OR p_terminal_status NOT IN ('executed','failed')
    OR (p_terminal_status = 'executed' AND p_error IS NOT NULL)
    OR (
      p_terminal_status = 'failed'
      AND (NULLIF(btrim(p_error), '') IS NULL OR length(p_error) > 1000)
    )
  THEN
    RAISE EXCEPTION 'invalid WorkSession action execution result';
  END IF;

  SELECT * INTO v_session
  FROM public."WorkSession"
  WHERE "WorkSession".id = p_session_id
    AND "WorkSession"."spaceId" = p_space_id
  FOR UPDATE;
  IF NOT FOUND OR v_session.status <> 'awaiting_actions' THEN RETURN false; END IF;

  UPDATE public."WorkSessionAction" AS action
  SET status = p_terminal_status,
      result = CASE WHEN p_terminal_status = 'executed' THEN p_result ELSE NULL END,
      error = CASE WHEN p_terminal_status = 'failed' THEN p_error ELSE NULL END,
      "executedAt" = now()
  WHERE action.id = p_action_id
    AND action."sessionId" = p_session_id
    AND action."spaceId" = p_space_id
    AND action.status = 'approved';
  IF NOT FOUND THEN RETURN false; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public."WorkSessionAction" AS pending
    WHERE pending."sessionId" = p_session_id
      AND pending."spaceId" = p_space_id
      AND pending.status IN ('proposed','approved')
  ) THEN
    UPDATE public."WorkSession"
    SET status = 'completed', "completedAt" = now(), "updatedAt" = now()
    WHERE "WorkSession".id = p_session_id
      AND "WorkSession"."spaceId" = p_space_id
      AND "WorkSession".status = 'awaiting_actions';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'WorkSession action parent changed under lock';
    END IF;
  END IF;
  RETURN true;
END;
$$;

-- Defense in depth for any future service-role writer that bypasses the RPCs:
-- a child decision/finish is invalid unless its tenant-matched parent is still
-- awaiting actions. The RPCs already hold this parent lock, so this trigger is
-- a no-op validation on the supported path and closes the old split-write path.
CREATE OR REPLACE FUNCTION public.enforce_work_session_action_parent_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_parent_status text;
BEGIN
  IF OLD.status = NEW.status
    OR NEW.status NOT IN ('approved','denied','executed','failed')
  THEN
    RETURN NEW;
  END IF;
  IF NOT (
    (OLD.status = 'proposed' AND NEW.status IN ('approved','denied'))
    OR (OLD.status = 'approved' AND NEW.status IN ('executed','failed'))
  ) THEN
    RAISE EXCEPTION 'invalid WorkSession action status transition';
  END IF;

  SELECT status INTO v_parent_status
  FROM public."WorkSession"
  WHERE id = NEW."sessionId" AND "spaceId" = NEW."spaceId"
  FOR UPDATE;
  IF NOT FOUND OR v_parent_status <> 'awaiting_actions' THEN
    RAISE EXCEPTION 'WorkSession action parent is not awaiting actions';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_work_session_action_parent_state
  ON public."WorkSessionAction";
CREATE TRIGGER enforce_work_session_action_parent_state
BEFORE UPDATE OF status ON public."WorkSessionAction"
FOR EACH ROW
EXECUTE FUNCTION public.enforce_work_session_action_parent_state();

-- Forward-repair the old artifact patch authority. Plan and step behavior is
-- unchanged; artifact callers may only renew an empty live claim. Publishing a
-- terminal artifact now requires finalize_work_session_artifact so File,
-- proposals, and parent status share one transaction.
CREATE OR REPLACE FUNCTION public.patch_work_session_phase(
  p_session_id text,
  p_phase text,
  p_phase_key text,
  p_token text,
  p_patch jsonb,
  p_release boolean DEFAULT true,
  p_lease_seconds integer DEFAULT 900
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public."WorkSession"%ROWTYPE;
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
  FROM public."WorkSession"
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
  IF p_phase = 'artifact' AND (p_release OR p_patch <> '{}'::jsonb) THEN
    RAISE EXCEPTION 'artifact terminal transition requires atomic finalization';
  END IF;

  v_unknown := CASE p_phase
    WHEN 'plan' THEN p_patch - ARRAY['status','plan','question','error']
    WHEN 'step' THEN p_patch - ARRAY['status','plan','findings','error']
    WHEN 'artifact' THEN p_patch
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
  UPDATE public."WorkSession"
  SET status = CASE WHEN p_patch ? 'status' THEN p_patch->>'status' ELSE status END,
      plan = CASE WHEN p_patch ? 'plan' THEN p_patch->'plan' ELSE plan END,
      findings = CASE WHEN p_patch ? 'findings' THEN p_patch->'findings' ELSE findings END,
      question = CASE WHEN p_patch ? 'question' THEN p_patch->>'question' ELSE question END,
      error = CASE WHEN p_patch ? 'error' THEN p_patch->>'error' ELSE error END,
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
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_work_session_artifact(text,text,text,text,jsonb,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_work_session_action_decision(text,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_work_session_action_execution(text,text,text,text,jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_work_session_action_parent_state() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.patch_work_session_phase(text,text,text,text,jsonb,boolean,integer) FROM PUBLIC;

DO $$
DECLARE v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.finalize_work_session_artifact(text,text,text,text,jsonb,jsonb) FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON FUNCTION public.claim_work_session_action_decision(text,text,text,text,text) FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON FUNCTION public.finish_work_session_action_execution(text,text,text,text,jsonb,text) FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON FUNCTION public.enforce_work_session_action_parent_state() FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON FUNCTION public.patch_work_session_phase(text,text,text,text,jsonb,boolean,integer) FROM %I', v_role);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.finalize_work_session_artifact(text,text,text,text,jsonb,jsonb) TO service_role;
    GRANT EXECUTE ON FUNCTION public.claim_work_session_action_decision(text,text,text,text,text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.finish_work_session_action_execution(text,text,text,text,jsonb,text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.patch_work_session_phase(text,text,text,text,jsonb,boolean,integer) TO service_role;
  END IF;
END;
$$;

-- Durable execution fence for the quarantined WorkSessionAction path.
--
-- Approval and provider execution were previously split by an unleased
-- process boundary: a crash after the provider accepted an email but before
-- the terminal database write left an approved row forever, and blindly
-- retrying it could duplicate the side effect. This migration adds an opaque
-- claim/lease, bounded retry accounting, an action-scoped provider key, and a
-- recovery query. It does not enable proposal/review product surfaces.

ALTER TABLE public."WorkSessionAction"
  ADD COLUMN IF NOT EXISTS "executionClaimToken" text,
  ADD COLUMN IF NOT EXISTS "executionLeaseExpiresAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "executionAttempts" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "executionFirstAttemptAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "executionIdempotencyKey" text,
  ADD COLUMN IF NOT EXISTS "reconciliationRequiredAt" timestamptz;

ALTER TABLE public."WorkSessionAction"
  DROP CONSTRAINT IF EXISTS "WorkSessionAction_executionAttempts_check";
ALTER TABLE public."WorkSessionAction"
  ADD CONSTRAINT "WorkSessionAction_executionAttempts_check"
  CHECK ("executionAttempts" >= 0);

-- Resend evaluates idempotency at the account/provider boundary, not merely
-- inside one tenant, so the stable provider key is globally unique.
CREATE UNIQUE INDEX IF NOT EXISTS uq_wsaction_execution_idempotency_key
  ON public."WorkSessionAction"("executionIdempotencyKey")
  WHERE "executionIdempotencyKey" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wsaction_execution_recovery
  ON public."WorkSessionAction"("executionLeaseExpiresAt", "createdAt")
  WHERE status = 'approved';

-- Older direct writers could complete a parent after counting only proposed
-- children while another child was already approved/in flight. Reopen only
-- that invalid completed state so the null-key recovery path can mark the
-- ambiguous approval for manual reconciliation. Failed/cancelled parents are
-- intentionally not resurrected.
UPDATE public."WorkSession" AS session
SET status = 'awaiting_actions',
    "completedAt" = NULL,
    "updatedAt" = now()
WHERE session.status = 'completed'
  AND EXISTS (
    SELECT 1
    FROM public."WorkSessionAction" AS action
    WHERE action."sessionId" = session.id
      AND action."spaceId" = session."spaceId"
      AND action.status = 'approved'
  );

-- Fence direct writes from an older app instance during migration rollout.
-- Current main historically updated WorkSessionAction rows through PostgREST,
-- so disabling only the old RPC is insufficient: proposed -> approved must
-- carry the v2 action key in the same statement, and approved -> terminal must
-- either own a lease or be an explicit fail-closed reconciliation transition.
CREATE OR REPLACE FUNCTION public.enforce_work_session_action_execution_fence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status = 'proposed' AND NEW.status = 'approved' AND (
    NEW."executionIdempotencyKey" IS NULL
    OR NEW."executionIdempotencyKey" IS DISTINCT FROM
      'work-session-action-' || md5(NEW.id)
  ) THEN
    RAISE EXCEPTION 'WorkSession approval requires the durable v2 authority';
  END IF;

  IF OLD.status = 'approved'
    AND NEW.status IN ('executed','failed')
    AND OLD."executionClaimToken" IS NULL
    AND NEW."reconciliationRequiredAt" IS NULL
  THEN
    RAISE EXCEPTION 'WorkSession action finish requires an execution lease';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_work_session_action_execution_fence
  ON public."WorkSessionAction";
CREATE TRIGGER enforce_work_session_action_execution_fence
BEFORE UPDATE OF status ON public."WorkSessionAction"
FOR EACH ROW
EXECUTE FUNCTION public.enforce_work_session_action_execution_fence();

-- An old app's completeIfSettled() counted only proposed children. Prevent it
-- from closing an awaiting-actions parent while an approved child remains for
-- the durable recovery rail.
CREATE OR REPLACE FUNCTION public.enforce_work_session_action_parent_completion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status = 'awaiting_actions' AND NEW.status = 'completed' AND EXISTS (
    SELECT 1
    FROM public."WorkSessionAction" AS pending
    WHERE pending."sessionId" = OLD.id
      AND pending."spaceId" = OLD."spaceId"
      AND pending.status IN ('proposed','approved')
  ) THEN
    RAISE EXCEPTION 'WorkSession still has unsettled actions';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_work_session_action_parent_completion
  ON public."WorkSession";
CREATE TRIGGER enforce_work_session_action_parent_completion
BEFORE UPDATE OF status ON public."WorkSession"
FOR EACH ROW
EXECUTE FUNCTION public.enforce_work_session_action_parent_completion();

-- V2 is intentionally a distinct authority. During a rolling deployment an
-- old application process must not receive a newly-keyed approval and then
-- perform an unkeyed provider call. The historical authority below is changed
-- to fail closed for approve while preserving denial compatibility.
CREATE OR REPLACE FUNCTION public.claim_work_session_action_decision_v2(
  p_session_id text,
  p_action_id text,
  p_space_id text,
  p_decision text,
  p_decided_by_user_id text
)
RETURNS TABLE(id text, tool text, args jsonb, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public."WorkSession"%ROWTYPE;
  v_next_status text;
  v_action_id text;
  v_action_tool text;
  v_action_args jsonb;
BEGIN
  IF NULLIF(btrim(p_session_id), '') IS NULL
    OR NULLIF(btrim(p_action_id), '') IS NULL
    OR NULLIF(btrim(p_space_id), '') IS NULL
    OR NULLIF(btrim(p_decided_by_user_id), '') IS NULL
    OR length(p_session_id) > 200
    OR length(p_action_id) > 200
    OR length(p_space_id) > 200
    OR length(p_decided_by_user_id) > 200
    OR p_decision IS NULL
    OR p_decision NOT IN ('approve','deny')
  THEN
    RAISE EXCEPTION 'invalid WorkSession action decision';
  END IF;

  SELECT * INTO v_session
  FROM public."WorkSession"
  WHERE "WorkSession".id = p_session_id
    AND "WorkSession"."spaceId" = p_space_id
  FOR UPDATE;
  IF NOT FOUND OR v_session.status <> 'awaiting_actions' THEN RETURN; END IF;

  v_next_status := CASE WHEN p_decision = 'approve' THEN 'approved' ELSE 'denied' END;
  UPDATE public."WorkSessionAction" AS action
  SET status = v_next_status,
      "decidedByUserId" = p_decided_by_user_id,
      "decidedAt" = now(),
      "executionIdempotencyKey" = CASE
        WHEN p_decision = 'approve'
          THEN 'work-session-action-' || md5(action.id)
        ELSE action."executionIdempotencyKey"
      END
  WHERE action.id = p_action_id
    AND action."sessionId" = p_session_id
    AND action."spaceId" = p_space_id
    AND action.status = 'proposed'
  RETURNING action.id, action.tool, action.args
  INTO v_action_id, v_action_tool, v_action_args;

  IF NOT FOUND THEN RETURN; END IF;
  IF p_decision = 'deny' AND NOT EXISTS (
    SELECT 1 FROM public."WorkSessionAction" AS pending
    WHERE pending."sessionId" = p_session_id
      AND pending."spaceId" = p_space_id
      AND pending.status IN ('proposed','approved')
  ) THEN
    UPDATE public."WorkSession"
    SET status = 'completed', "completedAt" = now(), "updatedAt" = now()
    WHERE "WorkSession".id = p_session_id
      AND "WorkSession"."spaceId" = p_space_id
      AND "WorkSession".status = 'awaiting_actions';
  END IF;
  RETURN QUERY SELECT v_action_id, v_action_tool, v_action_args, v_next_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_work_session_action_decision(
  p_session_id text,
  p_action_id text,
  p_space_id text,
  p_decision text,
  p_decided_by_user_id text
)
RETURNS TABLE(id text, tool text, args jsonb, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_decision = 'approve' THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT decision.id, decision.tool, decision.args, decision.status
  FROM public.claim_work_session_action_decision_v2(
    p_session_id, p_action_id, p_space_id, p_decision, p_decided_by_user_id
  ) AS decision;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_work_session_action_execution(
  p_session_id text,
  p_action_id text,
  p_space_id text,
  p_claim_token text,
  p_lease_seconds integer DEFAULT 120
)
RETURNS TABLE(
  disposition text,
  id text,
  tool text,
  args jsonb,
  "executionIdempotencyKey" text,
  "executionAttempts" integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public."WorkSession"%ROWTYPE;
  v_action public."WorkSessionAction"%ROWTYPE;
  v_attempts integer;
BEGIN
  IF NULLIF(btrim(p_session_id), '') IS NULL
    OR NULLIF(btrim(p_action_id), '') IS NULL
    OR NULLIF(btrim(p_space_id), '') IS NULL
    OR NULLIF(btrim(p_claim_token), '') IS NULL
    OR p_claim_token !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR p_lease_seconds IS NULL
    OR p_lease_seconds NOT BETWEEN 30 AND 600
    OR length(p_session_id) > 200
    OR length(p_action_id) > 200
    OR length(p_space_id) > 200
  THEN
    RAISE EXCEPTION 'invalid WorkSession action execution claim';
  END IF;

  SELECT * INTO v_session
  FROM public."WorkSession"
  WHERE "WorkSession".id = p_session_id
    AND "WorkSession"."spaceId" = p_space_id
  FOR UPDATE;
  IF NOT FOUND OR v_session.status <> 'awaiting_actions' THEN RETURN; END IF;

  SELECT * INTO v_action
  FROM public."WorkSessionAction" AS action
  WHERE action.id = p_action_id
    AND action."sessionId" = p_session_id
    AND action."spaceId" = p_space_id
  FOR UPDATE;
  IF NOT FOUND OR v_action.status <> 'approved' THEN RETURN; END IF;

  -- Never auto-retry an approval that predates provider idempotency. Its side
  -- effect may already have happened under the old executor.
  IF v_action."executionIdempotencyKey" IS NULL
    OR v_action."executionIdempotencyKey" IS DISTINCT FROM
      'work-session-action-' || md5(v_action.id)
  THEN
    UPDATE public."WorkSessionAction"
    SET status = 'failed',
        result = NULL,
        error = 'Legacy approved action requires manual reconciliation; automatic retry was not attempted.',
        "executionClaimToken" = NULL,
        "executionLeaseExpiresAt" = NULL,
        "reconciliationRequiredAt" = now(),
        "executedAt" = now()
    WHERE "WorkSessionAction".id = v_action.id;

    IF NOT EXISTS (
      SELECT 1 FROM public."WorkSessionAction" AS pending
      WHERE pending."sessionId" = p_session_id
        AND pending."spaceId" = p_space_id
        AND pending.status IN ('proposed','approved')
    ) THEN
      UPDATE public."WorkSession"
      SET status = 'completed', "completedAt" = now(), "updatedAt" = now()
      WHERE "WorkSession".id = p_session_id
        AND "WorkSession"."spaceId" = p_space_id
        AND "WorkSession".status = 'awaiting_actions';
    END IF;

    RETURN QUERY SELECT
      'reconciliation_required'::text, v_action.id, v_action.tool,
      v_action.args, v_action."executionIdempotencyKey", v_action."executionAttempts";
    RETURN;
  END IF;

  IF v_action."executionClaimToken" IS NOT NULL
    AND v_action."executionLeaseExpiresAt" IS NOT NULL
    AND v_action."executionLeaseExpiresAt" >= now()
  THEN
    RETURN;
  END IF;

  -- Resend retains provider idempotency keys for 24 hours. Stop one hour
  -- earlier so a delayed recovery can never issue the same external request
  -- after the provider's duplicate-suppression window has expired.
  IF v_action."executionFirstAttemptAt" IS NOT NULL
    AND v_action."executionFirstAttemptAt" <= now() - interval '23 hours'
  THEN
    UPDATE public."WorkSessionAction"
    SET status = 'failed',
        result = NULL,
        error = 'The provider idempotency retry window expired; manual reconciliation is required.',
        "executionClaimToken" = NULL,
        "executionLeaseExpiresAt" = NULL,
        "reconciliationRequiredAt" = now(),
        "executedAt" = now()
    WHERE "WorkSessionAction".id = v_action.id;

    IF NOT EXISTS (
      SELECT 1 FROM public."WorkSessionAction" AS pending
      WHERE pending."sessionId" = p_session_id
        AND pending."spaceId" = p_space_id
        AND pending.status IN ('proposed','approved')
    ) THEN
      UPDATE public."WorkSession"
      SET status = 'completed', "completedAt" = now(), "updatedAt" = now()
      WHERE "WorkSession".id = p_session_id
        AND "WorkSession"."spaceId" = p_space_id
        AND "WorkSession".status = 'awaiting_actions';
    END IF;

    RETURN QUERY SELECT
      'reconciliation_required'::text, v_action.id, v_action.tool,
      v_action.args, v_action."executionIdempotencyKey", v_action."executionAttempts";
    RETURN;
  END IF;

  IF v_action."executionAttempts" >= 5 THEN
    UPDATE public."WorkSessionAction"
    SET status = 'failed',
        result = NULL,
        error = 'Automatic action retries were exhausted; manual reconciliation is required.',
        "executionClaimToken" = NULL,
        "executionLeaseExpiresAt" = NULL,
        "reconciliationRequiredAt" = now(),
        "executedAt" = now()
    WHERE "WorkSessionAction".id = v_action.id;

    IF NOT EXISTS (
      SELECT 1 FROM public."WorkSessionAction" AS pending
      WHERE pending."sessionId" = p_session_id
        AND pending."spaceId" = p_space_id
        AND pending.status IN ('proposed','approved')
    ) THEN
      UPDATE public."WorkSession"
      SET status = 'completed', "completedAt" = now(), "updatedAt" = now()
      WHERE "WorkSession".id = p_session_id
        AND "WorkSession"."spaceId" = p_space_id
        AND "WorkSession".status = 'awaiting_actions';
    END IF;

    RETURN QUERY SELECT
      'reconciliation_required'::text, v_action.id, v_action.tool,
      v_action.args, v_action."executionIdempotencyKey", v_action."executionAttempts";
    RETURN;
  END IF;

  UPDATE public."WorkSessionAction" AS claimed_action
  SET "executionClaimToken" = p_claim_token,
      "executionLeaseExpiresAt" = now() + make_interval(secs => p_lease_seconds),
      "executionFirstAttemptAt" = COALESCE(claimed_action."executionFirstAttemptAt", now()),
      "executionAttempts" = claimed_action."executionAttempts" + 1
  WHERE claimed_action.id = v_action.id
  RETURNING claimed_action."executionAttempts" INTO v_attempts;

  RETURN QUERY SELECT
    'claimed'::text, v_action.id, v_action.tool, v_action.args,
    v_action."executionIdempotencyKey", v_attempts;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_claimed_work_session_action_execution(
  p_session_id text,
  p_action_id text,
  p_space_id text,
  p_claim_token text,
  p_terminal_status text,
  p_result jsonb,
  p_error text,
  p_reconciliation_required boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public."WorkSession"%ROWTYPE;
BEGIN
  IF NULLIF(btrim(p_session_id), '') IS NULL
    OR NULLIF(btrim(p_action_id), '') IS NULL
    OR NULLIF(btrim(p_space_id), '') IS NULL
    OR NULLIF(btrim(p_claim_token), '') IS NULL
    OR p_claim_token !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR p_terminal_status IS NULL
    OR p_terminal_status NOT IN ('executed','failed')
    OR p_reconciliation_required IS NULL
    OR (p_terminal_status = 'executed' AND (p_error IS NOT NULL OR p_reconciliation_required))
    OR (p_terminal_status = 'failed' AND (NULLIF(btrim(p_error), '') IS NULL OR length(p_error) > 1000))
  THEN
    RAISE EXCEPTION 'invalid WorkSession action execution result';
  END IF;

  SELECT * INTO v_session
  FROM public."WorkSession"
  WHERE "WorkSession".id = p_session_id
    AND "WorkSession"."spaceId" = p_space_id
  FOR UPDATE;
  IF NOT FOUND OR v_session.status <> 'awaiting_actions' THEN RETURN false; END IF;

  UPDATE public."WorkSessionAction" AS action
  SET status = p_terminal_status,
      result = CASE WHEN p_terminal_status = 'executed' THEN p_result ELSE NULL END,
      error = CASE WHEN p_terminal_status = 'failed' THEN p_error ELSE NULL END,
      "reconciliationRequiredAt" = CASE
        WHEN p_reconciliation_required THEN now() ELSE NULL
      END,
      "executionClaimToken" = NULL,
      "executionLeaseExpiresAt" = NULL,
      "executedAt" = now()
  WHERE action.id = p_action_id
    AND action."sessionId" = p_session_id
    AND action."spaceId" = p_space_id
    AND action.status = 'approved'
    AND action."executionClaimToken" = p_claim_token
    AND action."executionLeaseExpiresAt" >= now();
  IF NOT FOUND THEN RETURN false; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public."WorkSessionAction" AS pending
    WHERE pending."sessionId" = p_session_id
      AND pending."spaceId" = p_space_id
      AND pending.status IN ('proposed','approved')
  ) THEN
    UPDATE public."WorkSession"
    SET status = 'completed', "completedAt" = now(), "updatedAt" = now()
    WHERE "WorkSession".id = p_session_id
      AND "WorkSession"."spaceId" = p_space_id
      AND "WorkSession".status = 'awaiting_actions';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'WorkSession action parent changed under lock';
    END IF;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_work_session_action_execution_claim(
  p_session_id text,
  p_action_id text,
  p_space_id text,
  p_claim_token text,
  p_error text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public."WorkSession"%ROWTYPE;
BEGIN
  IF NULLIF(btrim(p_session_id), '') IS NULL
    OR NULLIF(btrim(p_action_id), '') IS NULL
    OR NULLIF(btrim(p_space_id), '') IS NULL
    OR NULLIF(btrim(p_claim_token), '') IS NULL
    OR p_claim_token !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR NULLIF(btrim(p_error), '') IS NULL
    OR length(p_error) > 1000
  THEN
    RAISE EXCEPTION 'invalid WorkSession action execution release';
  END IF;

  SELECT * INTO v_session
  FROM public."WorkSession"
  WHERE "WorkSession".id = p_session_id
    AND "WorkSession"."spaceId" = p_space_id
  FOR UPDATE;
  IF NOT FOUND OR v_session.status <> 'awaiting_actions' THEN RETURN false; END IF;

  UPDATE public."WorkSessionAction" AS action
  SET error = p_error,
      "executionClaimToken" = NULL,
      "executionLeaseExpiresAt" = NULL
  WHERE action.id = p_action_id
    AND action."sessionId" = p_session_id
    AND action."spaceId" = p_space_id
    AND action.status = 'approved'
    AND action."executionClaimToken" = p_claim_token
    AND action."executionLeaseExpiresAt" >= now();
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_recoverable_work_session_actions(
  p_limit integer DEFAULT 50
)
RETURNS TABLE("sessionId" text, "actionId" text, "spaceId" text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid WorkSession action recovery limit';
  END IF;
  RETURN QUERY
  SELECT action."sessionId", action.id, action."spaceId"
  FROM public."WorkSessionAction" AS action
  JOIN public."WorkSession" AS session
    ON session.id = action."sessionId"
   AND session."spaceId" = action."spaceId"
  WHERE session.status = 'awaiting_actions'
    AND action.status = 'approved'
    AND (
      action."executionClaimToken" IS NULL
      OR action."executionLeaseExpiresAt" IS NULL
      OR action."executionLeaseExpiresAt" < now()
    )
  ORDER BY action."createdAt", action.id
  LIMIT p_limit;
END;
$$;

-- The unfenced historical finisher is retained only as a rolling-deploy
-- compatibility symbol. It cannot mutate any row.
CREATE OR REPLACE FUNCTION public.finish_work_session_action_execution(
  p_session_id text,
  p_action_id text,
  p_space_id text,
  p_terminal_status text,
  p_result jsonb,
  p_error text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_work_session_action_decision_v2(text,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_work_session_action_decision(text,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_work_session_action_execution(text,text,text,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_claimed_work_session_action_execution(text,text,text,text,text,jsonb,text,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_work_session_action_execution_claim(text,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_recoverable_work_session_actions(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_work_session_action_execution(text,text,text,text,jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_work_session_action_execution_fence() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_work_session_action_parent_completion() FROM PUBLIC;

DO $$
DECLARE v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.claim_work_session_action_decision_v2(text,text,text,text,text) FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON FUNCTION public.claim_work_session_action_decision(text,text,text,text,text) FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON FUNCTION public.claim_work_session_action_execution(text,text,text,text,integer) FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON FUNCTION public.finish_claimed_work_session_action_execution(text,text,text,text,text,jsonb,text,boolean) FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON FUNCTION public.release_work_session_action_execution_claim(text,text,text,text,text) FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON FUNCTION public.list_recoverable_work_session_actions(integer) FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON FUNCTION public.finish_work_session_action_execution(text,text,text,text,jsonb,text) FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON FUNCTION public.enforce_work_session_action_execution_fence() FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON FUNCTION public.enforce_work_session_action_parent_completion() FROM %I', v_role);
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.claim_work_session_action_decision_v2(text,text,text,text,text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.claim_work_session_action_decision(text,text,text,text,text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.claim_work_session_action_execution(text,text,text,text,integer) TO service_role;
    GRANT EXECUTE ON FUNCTION public.finish_claimed_work_session_action_execution(text,text,text,text,text,jsonb,text,boolean) TO service_role;
    GRANT EXECUTE ON FUNCTION public.release_work_session_action_execution_claim(text,text,text,text,text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.list_recoverable_work_session_actions(integer) TO service_role;
    GRANT EXECUTE ON FUNCTION public.finish_work_session_action_execution(text,text,text,text,jsonb,text) TO service_role;
  END IF;
END $$;
