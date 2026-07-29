-- ============================================================================
-- Chippi Research Workspace: fenced cloud-browser worker leases
-- ============================================================================
-- A public-web BrowserSession may be driven by an ephemeral Modal Playwright
-- worker. These fields + RPCs make launch idempotent and make a late/stale
-- worker unable to poll after another worker takes over. This is feature-off
-- until the migration, Modal deployment, and authenticated staging proof pass.
-- ============================================================================

ALTER TABLE "BrowserSession"
  ADD COLUMN IF NOT EXISTS "workerLeaseToken" text,
  ADD COLUMN IF NOT EXISTS "workerLeaseExpiresAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "workerStartedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "workerFinishedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "workerLastError" text;

CREATE INDEX IF NOT EXISTS "BrowserSession_headless_worker_lease_idx"
  ON "BrowserSession" ("spaceId", "source", status, "workerLeaseExpiresAt")
  WHERE "source" = 'headless';

-- Fail before attempting the uniqueness constraint if a legacy environment
-- contains ambiguous active cloud sessions. An operator must inspect/close
-- those rows deliberately; a migration must never pick a winner silently.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "BrowserSession"
    WHERE "source" = 'headless' AND status = 'active'
    GROUP BY "spaceId", "userId"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enable Research Workspace: duplicate active headless BrowserSession rows exist';
  END IF;
END;
$$;

-- One active public-web session per user/workspace. The function below uses
-- this partial uniqueness as its concurrency backstop: simultaneous starts
-- return the same winning row instead of spawning two cloud browsers.
CREATE UNIQUE INDEX IF NOT EXISTS "BrowserSession_one_active_headless_per_user_idx"
  ON "BrowserSession" ("spaceId", "userId")
  WHERE "source" = 'headless' AND status = 'active';

CREATE OR REPLACE FUNCTION public.start_headless_browser_session(
  p_space_id text,
  p_user_id text,
  p_session_id text,
  p_started_at timestamptz
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_session_id text;
BEGIN
  INSERT INTO "BrowserSession" (id, "spaceId", "userId", "linkId", status, "source", "startedAt")
  VALUES (p_session_id, p_space_id, p_user_id, NULL, 'active', 'headless', p_started_at)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_session_id;

  IF v_session_id IS NULL THEN
    SELECT id INTO v_session_id
    FROM "BrowserSession"
    WHERE "spaceId" = p_space_id
      AND "userId" = p_user_id
      AND "source" = 'headless'
      AND status = 'active'
    ORDER BY "startedAt" DESC
    LIMIT 1;
  END IF;
  RETURN v_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_headless_browser_worker(
  p_session_id text,
  p_lease_token text,
  p_lease_seconds integer DEFAULT 30
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_claimed boolean := false;
BEGIN
  IF p_session_id IS NULL OR length(p_session_id) = 0
     OR p_lease_token IS NULL OR length(p_lease_token) < 16
     OR p_lease_seconds < 10 OR p_lease_seconds > 60 THEN
    RAISE EXCEPTION 'invalid headless worker lease request';
  END IF;

  UPDATE "BrowserSession"
  SET "workerLeaseToken" = p_lease_token,
      "workerLeaseExpiresAt" = now() + make_interval(secs => p_lease_seconds),
      "workerStartedAt" = coalesce("workerStartedAt", now()),
      "workerFinishedAt" = NULL,
      "workerLastError" = NULL,
      "lastPolledAt" = NULL,
      "lastFrame" = NULL,
      "lastFrameAt" = NULL
  WHERE id = p_session_id
    AND "source" = 'headless'
    AND status = 'active'
    AND ("workerLeaseExpiresAt" IS NULL OR "workerLeaseExpiresAt" < now())
  RETURNING true INTO v_claimed;

  IF v_claimed THEN
    UPDATE "BrowserAction"
    SET status = 'error', result = jsonb_build_object('ok', false, 'error', 'Cloud research worker lease expired.'), "completedAt" = now()
    WHERE "sessionId" = p_session_id AND status = 'running';
  END IF;

  RETURN coalesce(v_claimed, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.renew_headless_browser_worker_lease(
  p_session_id text,
  p_lease_token text,
  p_lease_seconds integer DEFAULT 30
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_renewed boolean := false;
BEGIN
  UPDATE "BrowserSession"
  SET "workerLeaseExpiresAt" = now() + make_interval(secs => p_lease_seconds)
  WHERE id = p_session_id
    AND "source" = 'headless'
    AND status = 'active'
    AND "workerLeaseToken" = p_lease_token
    AND "workerLeaseExpiresAt" >= now()
  RETURNING true INTO v_renewed;
  RETURN coalesce(v_renewed, false);
END;
$$;

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
  UPDATE "BrowserSession"
  SET "workerLeaseToken" = NULL,
      "workerLeaseExpiresAt" = NULL,
      "workerFinishedAt" = now(),
      "workerLastError" = left(nullif(p_error, ''), 1000),
      status = 'ended',
      "endedAt" = now()
  WHERE id = p_session_id
    AND "source" = 'headless'
    AND "workerLeaseToken" = p_lease_token
  RETURNING true INTO v_finished;
  IF v_finished THEN
    UPDATE "BrowserAction"
    SET status = 'error',
        result = jsonb_build_object('ok', false, 'error', coalesce(nullif(p_error, ''), 'Cloud research worker finished before this action ran.')),
        "completedAt" = now()
    WHERE "sessionId" = p_session_id AND status IN ('queued', 'running');
  END IF;
  RETURN coalesce(v_finished, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.stop_headless_browser_session(
  p_session_id text,
  p_space_id text,
  p_reason text DEFAULT 'Stopped'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE v_session "BrowserSession"%ROWTYPE;
BEGIN
  SELECT * INTO v_session FROM "BrowserSession"
  WHERE id = p_session_id AND "spaceId" = p_space_id AND "source" = 'headless'
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE "BrowserSession" SET status = 'ended', "endedAt" = now(),
    "workerLeaseToken" = NULL, "workerLeaseExpiresAt" = NULL,
    "workerFinishedAt" = now(), "workerLastError" = NULL
  WHERE id = v_session.id;
  UPDATE "BrowserAction" SET status = 'error',
    result = jsonb_build_object('ok', false, 'error', left(coalesce(nullif(p_reason, ''), 'Stopped'), 1000)),
    "completedAt" = now()
  WHERE "sessionId" = v_session.id AND "spaceId" = p_space_id AND status IN ('queued', 'running');
  RETURN true;
END;
$$;

-- One fenced transaction for a worker heartbeat: lease ownership, optional
-- completion, frame, expiry, and FIFO claim happen together. A Stop that
-- clears the lease therefore wins over a late worker before it can overwrite
-- a terminal action or obtain another one.
CREATE OR REPLACE FUNCTION public.poll_headless_browser_worker(
  p_session_id text,
  p_lease_token text,
  p_completed_action_id text DEFAULT NULL,
  p_completed_result jsonb DEFAULT NULL,
  p_frame jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_session "BrowserSession"%ROWTYPE;
  v_action "BrowserAction"%ROWTYPE;
  v_result_ok boolean;
BEGIN
  SELECT * INTO v_session FROM "BrowserSession" WHERE id = p_session_id FOR UPDATE;
  IF p_lease_token IS NULL OR length(p_lease_token) < 16
     OR NOT FOUND OR v_session."source" <> 'headless' OR v_session.status <> 'active'
     OR v_session."workerLeaseToken" IS DISTINCT FROM p_lease_token
     OR v_session."workerLeaseExpiresAt" IS NULL
     OR v_session."workerLeaseExpiresAt" < now() THEN
    RETURN jsonb_build_object('stop', true, 'action', NULL);
  END IF;

  UPDATE "BrowserSession"
  SET "workerLeaseExpiresAt" = now() + interval '30 seconds',
      "lastPolledAt" = now(),
      "lastFrame" = coalesce(p_frame, "lastFrame"),
      "lastFrameAt" = CASE WHEN p_frame IS NULL THEN "lastFrameAt" ELSE now() END
  WHERE id = v_session.id;

  IF p_completed_action_id IS NOT NULL AND p_completed_result IS NOT NULL THEN
    v_result_ok := coalesce((p_completed_result->>'ok')::boolean, false);
    UPDATE "BrowserAction"
    SET status = CASE WHEN v_result_ok THEN 'done' ELSE 'error' END,
        result = p_completed_result,
        "completedAt" = now()
    WHERE id = p_completed_action_id
      AND "sessionId" = v_session.id
      AND "spaceId" = v_session."spaceId"
      AND status = 'running';
  END IF;

  IF EXISTS (SELECT 1 FROM "BrowserAction" WHERE "sessionId" = v_session.id AND status = 'running') THEN
    RETURN jsonb_build_object('stop', false, 'action', NULL);
  END IF;

  UPDATE "BrowserAction"
  SET status = 'expired', "completedAt" = now()
  WHERE "sessionId" = v_session.id AND "spaceId" = v_session."spaceId"
    AND status = 'queued' AND "createdAt" < now() - interval '120 seconds';

  SELECT * INTO v_action FROM "BrowserAction"
  WHERE "sessionId" = v_session.id AND "spaceId" = v_session."spaceId" AND status = 'queued'
  ORDER BY "createdAt" ASC FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('stop', false, 'action', NULL); END IF;

  UPDATE "BrowserAction" SET status = 'running', "dispatchedAt" = now() WHERE id = v_action.id;
  RETURN jsonb_build_object(
    'stop', false,
    'action', jsonb_build_object('id', v_action.id, 'sessionId', v_action."sessionId", 'input', v_action.params)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_headless_browser_worker(text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.renew_headless_browser_worker_lease(text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_headless_browser_worker(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.poll_headless_browser_worker(text, text, text, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stop_headless_browser_session(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_headless_browser_worker(text, text, integer) TO service_role;
REVOKE ALL ON FUNCTION public.start_headless_browser_session(text, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_headless_browser_session(text, text, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.renew_headless_browser_worker_lease(text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_headless_browser_worker(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.poll_headless_browser_worker(text, text, text, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.stop_headless_browser_session(text, text, text) TO service_role;
