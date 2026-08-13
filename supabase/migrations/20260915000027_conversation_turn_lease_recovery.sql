-- Hard-kill recovery and attempt fencing for ConversationTurn.
--
-- 00026 makes a turn durable, but a process death can leave a row in
-- `running` (or an approval in `paused`) forever.  This additive migration
-- gives every execution attempt a bounded lease.  Recovery terminal-cancels
-- the expired attempt instead of recycling the same row, so a late process
-- can never settle work under a newer attempt's authority.

ALTER TABLE public."ConversationTurn"
  ADD COLUMN IF NOT EXISTS "attemptToken" text,
  ADD COLUMN IF NOT EXISTS "attempts" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "leaseExpiresAt" timestamptz;

ALTER TABLE public."ConversationTurn"
  DROP CONSTRAINT IF EXISTS "ConversationTurn_attempts_check";
ALTER TABLE public."ConversationTurn"
  ADD CONSTRAINT "ConversationTurn_attempts_check" CHECK ("attempts" >= 0);

CREATE INDEX IF NOT EXISTS "ConversationTurn_expired_lease_idx"
  ON public."ConversationTurn" ("leaseExpiresAt", "enqueueSeq")
  WHERE status IN ('running', 'paused') AND "leaseExpiresAt" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "ConversationTurn_attempt_token_idx"
  ON public."ConversationTurn" ("attemptToken")
  WHERE "attemptToken" IS NOT NULL;

-- Rolling-deploy grace: existing live rows get a token and a fresh bounded
-- lease rather than being declared stale at migration time.
UPDATE public."ConversationTurn"
SET "attemptToken" = COALESCE("attemptToken", gen_random_uuid()::text),
    "attempts" = GREATEST("attempts", 1),
    "leaseExpiresAt" = COALESCE(
      "leaseExpiresAt",
      CASE WHEN status = 'paused' THEN now() + interval '24 hours'
           ELSE now() + interval '15 minutes' END
    ),
    "updatedAt" = now()
WHERE status IN ('running', 'paused');

CREATE OR REPLACE FUNCTION public.claim_conversation_turn_v2(
  p_turn_id text,
  p_space_id text,
  p_conversation_id text,
  p_client_request_id text,
  p_message text,
  p_attachment_ids jsonb,
  p_attempt_token text,
  p_lease_seconds integer
)
RETURNS SETOF public."ConversationTurn"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_turn public."ConversationTurn"%ROWTYPE;
  v_head_id text;
BEGIN
  IF NULLIF(btrim(COALESCE(p_attempt_token, '')), '') IS NULL
    OR length(p_attempt_token) > 200
    OR p_lease_seconds IS NULL
    OR p_lease_seconds < 30
    OR p_lease_seconds > 3600
  THEN
    RAISE EXCEPTION 'invalid conversation turn lease';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_space_id || ':' || p_conversation_id, 0));

  SELECT * INTO v_turn
  FROM public."ConversationTurn"
  WHERE id = p_turn_id
    AND "spaceId" = p_space_id
    AND "conversationId" = p_conversation_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_turn."clientRequestId" <> p_client_request_id
    OR v_turn.message <> btrim(p_message)
    OR v_turn."attachmentIds" <> COALESCE(p_attachment_ids, '[]'::jsonb)
  THEN
    RAISE EXCEPTION 'conversation turn claim binding mismatch';
  END IF;

  IF v_turn.status <> 'pending' THEN
    RAISE EXCEPTION 'conversation turn is %', v_turn.status;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public."ConversationTurn"
    WHERE "spaceId" = p_space_id
      AND "conversationId" = p_conversation_id
      AND status IN ('running', 'paused', 'failed')
  ) THEN
    RAISE EXCEPTION 'conversation queue is held';
  END IF;

  SELECT id INTO v_head_id
  FROM public."ConversationTurn"
  WHERE "spaceId" = p_space_id
    AND "conversationId" = p_conversation_id
    AND status = 'pending'
  ORDER BY priority DESC, "enqueueSeq" ASC
  LIMIT 1;

  IF v_head_id IS DISTINCT FROM p_turn_id THEN
    RAISE EXCEPTION 'conversation turn is not queue head';
  END IF;

  UPDATE public."ConversationTurn"
  SET status = 'running',
      "startedAt" = COALESCE("startedAt", now()),
      "attemptToken" = p_attempt_token,
      "attempts" = "attempts" + 1,
      "leaseExpiresAt" = now() + make_interval(secs => p_lease_seconds),
      "updatedAt" = now(),
      "lastError" = NULL,
      "terminalReason" = NULL
  WHERE id = p_turn_id
  RETURNING * INTO v_turn;

  RETURN NEXT v_turn;
END;
$$;

-- Compatibility entrypoint for the currently deployed task route.  It gains
-- hard-kill recovery immediately; callers that carry the returned token must
-- use the v2 finish function below for complete stale-attempt fencing.
CREATE OR REPLACE FUNCTION public.claim_conversation_turn(
  p_turn_id text,
  p_space_id text,
  p_conversation_id text,
  p_client_request_id text,
  p_message text,
  p_attachment_ids jsonb
)
RETURNS SETOF public."ConversationTurn"
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT * FROM public.claim_conversation_turn_v2(
    p_turn_id,
    p_space_id,
    p_conversation_id,
    p_client_request_id,
    p_message,
    p_attachment_ids,
    gen_random_uuid()::text,
    900
  );
$$;

CREATE OR REPLACE FUNCTION public.renew_conversation_turn_lease_v2(
  p_turn_id text,
  p_space_id text,
  p_conversation_id text,
  p_attempt_token text,
  p_lease_seconds integer
)
RETURNS SETOF public."ConversationTurn"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_turn public."ConversationTurn"%ROWTYPE;
BEGIN
  IF NULLIF(btrim(COALESCE(p_attempt_token, '')), '') IS NULL
    OR p_lease_seconds IS NULL
    OR p_lease_seconds < 30
    OR p_lease_seconds > 3600
  THEN RAISE EXCEPTION 'invalid conversation turn lease'; END IF;

  UPDATE public."ConversationTurn"
  SET "leaseExpiresAt" = now() + make_interval(secs => p_lease_seconds),
      "updatedAt" = now()
  WHERE id = p_turn_id
    AND "spaceId" = p_space_id
    AND "conversationId" = p_conversation_id
    AND status = 'running'
    AND "attemptToken" = p_attempt_token
    AND "leaseExpiresAt" > now()
  RETURNING * INTO v_turn;

  IF NOT FOUND THEN RAISE EXCEPTION 'conversation turn lease is no longer active'; END IF;
  RETURN NEXT v_turn;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_conversation_turn_v2(
  p_turn_id text,
  p_space_id text,
  p_conversation_id text,
  p_attempt_token text,
  p_status text,
  p_terminal_reason text,
  p_error text,
  p_pause_lease_seconds integer
)
RETURNS SETOF public."ConversationTurn"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_turn public."ConversationTurn"%ROWTYPE;
  v_status text;
BEGIN
  IF p_status NOT IN ('paused', 'completed', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'invalid conversation turn terminal status';
  END IF;
  IF NULLIF(btrim(COALESCE(p_attempt_token, '')), '') IS NULL
    OR p_pause_lease_seconds IS NULL
    OR p_pause_lease_seconds < 60
    OR p_pause_lease_seconds > 2592000
  THEN RAISE EXCEPTION 'invalid conversation turn finish lease'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_space_id || ':' || p_conversation_id, 0));

  SELECT * INTO v_turn
  FROM public."ConversationTurn"
  WHERE id = p_turn_id
    AND "spaceId" = p_space_id
    AND "conversationId" = p_conversation_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'conversation turn not found'; END IF;
  IF v_turn."attemptToken" IS DISTINCT FROM p_attempt_token THEN
    RAISE EXCEPTION 'conversation turn attempt token mismatch';
  END IF;

  -- Exact-token retries can observe the terminal result, but cannot alter it.
  IF v_turn.status IN ('paused', 'completed', 'failed', 'cancelled') THEN
    RETURN NEXT v_turn;
    RETURN;
  END IF;

  IF v_turn.status <> 'running' OR v_turn."leaseExpiresAt" IS NULL
    OR v_turn."leaseExpiresAt" <= now()
  THEN
    RAISE EXCEPTION 'conversation turn lease is no longer active';
  END IF;

  v_status := CASE
    WHEN v_turn."cancelRequestedAt" IS NOT NULL THEN 'cancelled'
    ELSE p_status
  END;

  UPDATE public."ConversationTurn"
  SET status = v_status,
      "terminalReason" = left(COALESCE(p_terminal_reason, v_status), 200),
      "lastError" = CASE WHEN v_status = 'failed' THEN left(COALESCE(p_error, 'turn failed'), 1000) ELSE NULL END,
      "finishedAt" = CASE WHEN v_status = 'paused' THEN NULL ELSE now() END,
      "leaseExpiresAt" = CASE
        WHEN v_status = 'paused' THEN now() + make_interval(secs => p_pause_lease_seconds)
        ELSE NULL
      END,
      "updatedAt" = now()
  WHERE id = p_turn_id
  RETURNING * INTO v_turn;

  RETURN NEXT v_turn;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_conversation_turn_cancel_v2(
  p_turn_id text,
  p_space_id text,
  p_conversation_id text,
  p_attempt_token text
)
RETURNS SETOF public."ConversationTurn"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_turn public."ConversationTurn"%ROWTYPE;
BEGIN
  UPDATE public."ConversationTurn"
  SET "cancelRequestedAt" = COALESCE("cancelRequestedAt", now()),
      "updatedAt" = now()
  WHERE id = p_turn_id
    AND "spaceId" = p_space_id
    AND "conversationId" = p_conversation_id
    AND status = 'running'
    AND "attemptToken" = p_attempt_token
    AND "leaseExpiresAt" > now()
  RETURNING * INTO v_turn;
  IF NOT FOUND THEN RAISE EXCEPTION 'active conversation turn attempt not found'; END IF;
  RETURN NEXT v_turn;
END;
$$;

-- Rolling-deploy compatibility: reject settlement after lease expiry, then
-- delegate to the fenced implementation using the row's current token.  This
-- path cannot protect a same-row future attempt; recovery therefore never
-- requeues an expired row, and v2 callers should carry the claim token.
CREATE OR REPLACE FUNCTION public.finish_conversation_turn(
  p_turn_id text,
  p_space_id text,
  p_conversation_id text,
  p_status text,
  p_terminal_reason text DEFAULT NULL,
  p_error text DEFAULT NULL
)
RETURNS SETOF public."ConversationTurn"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_turn public."ConversationTurn"%ROWTYPE;
BEGIN
  SELECT * INTO v_turn
  FROM public."ConversationTurn"
  WHERE id = p_turn_id
    AND "spaceId" = p_space_id
    AND "conversationId" = p_conversation_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'conversation turn not found'; END IF;
  IF v_turn.status IN ('completed', 'cancelled') THEN RETURN NEXT v_turn; RETURN; END IF;
  IF v_turn."attemptToken" IS NULL OR v_turn."leaseExpiresAt" IS NULL
    OR v_turn."leaseExpiresAt" <= now()
  THEN RAISE EXCEPTION 'conversation turn lease is no longer active'; END IF;

  RETURN QUERY SELECT * FROM public.finish_conversation_turn_v2(
    p_turn_id, p_space_id, p_conversation_id, v_turn."attemptToken",
    p_status, p_terminal_reason, p_error, 86400
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resume_paused_conversation_turn_v2(
  p_paused_run_id text,
  p_turn_id text,
  p_space_id text,
  p_user_id text,
  p_attempt_token text,
  p_lease_seconds integer
)
RETURNS SETOF public."ConversationTurn"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_turn public."ConversationTurn"%ROWTYPE;
  v_conversation_id text;
BEGIN
  IF NULLIF(btrim(COALESCE(p_attempt_token, '')), '') IS NULL
    OR p_lease_seconds IS NULL
    OR p_lease_seconds < 30
    OR p_lease_seconds > 3600
  THEN RAISE EXCEPTION 'invalid conversation turn resume lease'; END IF;

  SELECT "conversationId" INTO v_conversation_id
  FROM public."ConversationTurn"
  WHERE id = p_turn_id AND "spaceId" = p_space_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'paused conversation turn not found or expired'; END IF;

  -- Match claim/finish/recovery lock ordering.  A different advisory key here
  -- could deadlock with recovery (paused row first versus turn row first).
  PERFORM pg_advisory_xact_lock(hashtextextended(p_space_id || ':' || v_conversation_id, 0));

  UPDATE public."AgentPausedRun"
  SET status = 'resumed', "updatedAt" = now()
  WHERE id = p_paused_run_id
    AND "turnId" = p_turn_id
    AND "spaceId" = p_space_id
    AND "userId" = p_user_id
    AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'paused run is already resolved'; END IF;

  UPDATE public."ConversationTurn"
  SET status = 'running',
      "attemptToken" = p_attempt_token,
      "attempts" = "attempts" + 1,
      "leaseExpiresAt" = now() + make_interval(secs => p_lease_seconds),
      "updatedAt" = now(),
      "terminalReason" = NULL
  WHERE id = p_turn_id
    AND "spaceId" = p_space_id
    AND status = 'paused'
    AND "leaseExpiresAt" > now()
  RETURNING * INTO v_turn;
  IF NOT FOUND THEN RAISE EXCEPTION 'paused conversation turn not found or expired'; END IF;

  RETURN NEXT v_turn;
END;
$$;

CREATE OR REPLACE FUNCTION public.resume_paused_conversation_turn(
  p_paused_run_id text,
  p_turn_id text,
  p_space_id text,
  p_user_id text
)
RETURNS SETOF public."ConversationTurn"
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT * FROM public.resume_paused_conversation_turn_v2(
    p_paused_run_id, p_turn_id, p_space_id, p_user_id,
    gen_random_uuid()::text, 900
  );
$$;

CREATE OR REPLACE FUNCTION public.recover_expired_conversation_turns(
  p_limit integer
)
RETURNS TABLE (
  "turnId" text,
  "spaceId" text,
  "conversationId" text,
  "previousStatus" text,
  "terminalStatus" text,
  reason text,
  "recoveredAt" timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_candidate record;
  v_turn public."ConversationTurn"%ROWTYPE;
  v_reason text;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'invalid conversation turn recovery limit';
  END IF;

  FOR v_candidate IN
    SELECT candidate.id, candidate."spaceId", candidate."conversationId"
    FROM public."ConversationTurn" AS candidate
    WHERE candidate.status IN ('running', 'paused')
      AND candidate."leaseExpiresAt" IS NOT NULL
      AND candidate."leaseExpiresAt" <= now()
    ORDER BY candidate."leaseExpiresAt" ASC, candidate."enqueueSeq" ASC
    LIMIT p_limit
  LOOP
    IF NOT pg_try_advisory_xact_lock(
      hashtextextended(v_candidate."spaceId" || ':' || v_candidate."conversationId", 0)
    ) THEN CONTINUE; END IF;

    SELECT * INTO v_turn
    FROM public."ConversationTurn"
    WHERE id = v_candidate.id
      AND status IN ('running', 'paused')
      AND "leaseExpiresAt" IS NOT NULL
      AND "leaseExpiresAt" <= now()
    FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;

    v_reason := CASE WHEN v_turn.status = 'paused'
      THEN 'approval_lease_expired'
      ELSE 'execution_lease_expired' END;

    -- A hard kill can happen after AgentPausedRun insert but before the parent
    -- moves from running to paused. Expire any linked checkpoint whenever its
    -- authoritative turn lease dies, regardless of the row's prior status.
    UPDATE public."AgentPausedRun" AS paused_run
    SET status = 'expired', "updatedAt" = now()
    WHERE paused_run."turnId" = v_turn.id AND paused_run.status = 'pending';

    UPDATE public."ConversationTurn" AS expired_turn
    SET status = 'cancelled',
        "terminalReason" = v_reason,
        "lastError" = NULL,
        "finishedAt" = now(),
        "leaseExpiresAt" = NULL,
        "updatedAt" = now()
    WHERE expired_turn.id = v_turn.id;

    "turnId" := v_turn.id;
    "spaceId" := v_turn."spaceId";
    "conversationId" := v_turn."conversationId";
    "previousStatus" := v_turn.status;
    "terminalStatus" := 'cancelled';
    reason := v_reason;
    "recoveredAt" := now();
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_conversation_turn_v2(text,text,text,text,text,jsonb,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.renew_conversation_turn_lease_v2(text,text,text,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_conversation_turn_v2(text,text,text,text,text,text,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_conversation_turn_cancel_v2(text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resume_paused_conversation_turn_v2(text,text,text,text,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recover_expired_conversation_turns(integer) FROM PUBLIC;

DO $$
DECLARE v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.claim_conversation_turn_v2(text,text,text,text,text,jsonb,text,integer) FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON FUNCTION public.renew_conversation_turn_lease_v2(text,text,text,text,integer) FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON FUNCTION public.finish_conversation_turn_v2(text,text,text,text,text,text,text,integer) FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON FUNCTION public.request_conversation_turn_cancel_v2(text,text,text,text) FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON FUNCTION public.resume_paused_conversation_turn_v2(text,text,text,text,text,integer) FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON FUNCTION public.recover_expired_conversation_turns(integer) FROM %I', v_role);
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.claim_conversation_turn_v2(text,text,text,text,text,jsonb,text,integer) TO service_role;
    GRANT EXECUTE ON FUNCTION public.renew_conversation_turn_lease_v2(text,text,text,text,integer) TO service_role;
    GRANT EXECUTE ON FUNCTION public.finish_conversation_turn_v2(text,text,text,text,text,text,text,integer) TO service_role;
    GRANT EXECUTE ON FUNCTION public.request_conversation_turn_cancel_v2(text,text,text,text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.resume_paused_conversation_turn_v2(text,text,text,text,text,integer) TO service_role;
    GRANT EXECUTE ON FUNCTION public.recover_expired_conversation_turns(integer) TO service_role;
  END IF;
END;
$$;
