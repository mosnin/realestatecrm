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
