-- Token-fenced assistant transcript finalization for ConversationTurn.
--
-- A Message insert followed by a separate ConversationTurn finish has two
-- unsafe crash windows: an expired attempt can publish after recovery, and a
-- committed insert whose HTTP response is lost can be retried as a duplicate.
-- This receipt table and RPC make transcript insert + terminal settlement one
-- short transaction under the exact v2 attempt token.

CREATE TABLE IF NOT EXISTS public."ConversationTurnAssistantCommit" (
  "turnId" text NOT NULL REFERENCES public."ConversationTurn"(id) ON DELETE CASCADE,
  "attemptToken" text NOT NULL,
  "messageId" text NOT NULL REFERENCES public."Message"(id) ON DELETE CASCADE,
  "requestedStatus" text NOT NULL
    CHECK ("requestedStatus" IN ('paused', 'completed', 'failed', 'cancelled')),
  "terminalStatus" text NOT NULL
    CHECK ("terminalStatus" IN ('paused', 'completed', 'failed', 'cancelled')),
  "terminalReason" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("turnId", "attemptToken"),
  UNIQUE ("messageId")
);

ALTER TABLE public."ConversationTurnAssistantCommit" ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.commit_conversation_turn_assistant_v2(
  p_turn_id text,
  p_space_id text,
  p_conversation_id text,
  p_attempt_token text,
  p_message_id text,
  p_content text,
  p_blocks jsonb,
  p_status text,
  p_terminal_reason text,
  p_error text,
  p_pause_lease_seconds integer
)
RETURNS TABLE (
  "turnId" text,
  "attemptToken" text,
  "messageId" text,
  "requestedStatus" text,
  "terminalStatus" text,
  "terminalReason" text,
  "createdAt" timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_turn public."ConversationTurn"%ROWTYPE;
  v_commit public."ConversationTurnAssistantCommit"%ROWTYPE;
  v_message public."Message"%ROWTYPE;
  v_terminal_status text;
  v_terminal_reason text;
BEGIN
  IF NULLIF(btrim(COALESCE(p_turn_id, '')), '') IS NULL
    OR NULLIF(btrim(COALESCE(p_space_id, '')), '') IS NULL
    OR NULLIF(btrim(COALESCE(p_conversation_id, '')), '') IS NULL
    OR NULLIF(btrim(COALESCE(p_attempt_token, '')), '') IS NULL
    OR length(p_attempt_token) > 200
    OR NULLIF(btrim(COALESCE(p_message_id, '')), '') IS NULL
    OR length(p_message_id) > 200
    OR NULLIF(COALESCE(p_content, ''), '') IS NULL
    OR octet_length(p_content) > 1048576
    OR p_blocks IS NULL
    OR jsonb_typeof(p_blocks) <> 'array'
    OR jsonb_array_length(p_blocks) < 1
    OR octet_length(p_blocks::text) > 2097152
    OR p_status NOT IN ('paused', 'completed', 'failed', 'cancelled')
    OR NULLIF(btrim(COALESCE(p_terminal_reason, '')), '') IS NULL
    OR p_pause_lease_seconds IS NULL
    OR p_pause_lease_seconds < 60
    OR p_pause_lease_seconds > 2592000
  THEN
    RAISE EXCEPTION 'invalid conversation turn assistant commit';
  END IF;

  -- Match claim/finish/recovery lock ordering. No provider or other external
  -- work occurs while this transaction owns the per-conversation lock.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_space_id || ':' || p_conversation_id, 0)
  );

  SELECT * INTO v_turn
  FROM public."ConversationTurn"
  WHERE id = p_turn_id
    AND "spaceId" = p_space_id
    AND "conversationId" = p_conversation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'conversation turn not found';
  END IF;

  v_terminal_status := CASE
    WHEN v_turn."cancelRequestedAt" IS NOT NULL THEN 'cancelled'
    ELSE p_status
  END;
  v_terminal_reason := left(
    CASE
      WHEN v_turn."cancelRequestedAt" IS NOT NULL AND p_status <> 'cancelled'
        THEN 'cancel_requested'
      ELSE p_terminal_reason
    END,
    200
  );

  -- An exact retry after a committed-but-unacknowledged RPC returns the same
  -- receipt. Verify the entire payload so an idempotency key can never be
  -- reused for different transcript content or a different requested result.
  SELECT * INTO v_commit
  FROM public."ConversationTurnAssistantCommit" AS prior_commit
  WHERE prior_commit."turnId" = p_turn_id
    AND prior_commit."attemptToken" = p_attempt_token;

  IF FOUND THEN
    SELECT * INTO v_message
    FROM public."Message" AS committed_message
    WHERE committed_message.id = v_commit."messageId";

    IF NOT FOUND
      OR v_commit."messageId" IS DISTINCT FROM p_message_id
      OR v_commit."requestedStatus" IS DISTINCT FROM p_status
      OR v_commit."terminalStatus" IS DISTINCT FROM v_terminal_status
      OR v_commit."terminalReason" IS DISTINCT FROM v_terminal_reason
      OR v_message."spaceId" IS DISTINCT FROM p_space_id
      OR v_message."conversationId" IS DISTINCT FROM p_conversation_id
      OR v_message.role IS DISTINCT FROM 'assistant'
      OR v_message.content IS DISTINCT FROM p_content
      OR v_message.blocks IS DISTINCT FROM p_blocks
      OR (
        v_terminal_status = 'failed'
        AND v_turn."lastError" IS DISTINCT FROM left(COALESCE(p_error, 'turn failed'), 1000)
      )
    THEN
      RAISE EXCEPTION 'conversation turn assistant idempotency conflict';
    END IF;

    "turnId" := v_commit."turnId";
    "attemptToken" := v_commit."attemptToken";
    "messageId" := v_commit."messageId";
    "requestedStatus" := v_commit."requestedStatus";
    "terminalStatus" := v_commit."terminalStatus";
    "terminalReason" := v_commit."terminalReason";
    "createdAt" := v_commit."createdAt";
    RETURN NEXT;
    RETURN;
  END IF;

  -- A recovered, expired, cancelled, paused, completed, or superseded attempt
  -- has no authority to publish a new Message.
  IF v_turn."attemptToken" IS DISTINCT FROM p_attempt_token THEN
    RAISE EXCEPTION 'conversation turn attempt token mismatch';
  END IF;
  IF v_turn.status <> 'running'
    OR v_turn."leaseExpiresAt" IS NULL
    OR v_turn."leaseExpiresAt" <= now()
  THEN
    RAISE EXCEPTION 'conversation turn lease is no longer active';
  END IF;

  IF EXISTS (SELECT 1 FROM public."Message" AS existing_message WHERE existing_message.id = p_message_id) THEN
    RAISE EXCEPTION 'conversation turn assistant message id conflict';
  END IF;

  INSERT INTO public."Message" (
    id, "spaceId", "conversationId", role, content, blocks
  ) VALUES (
    p_message_id, p_space_id, p_conversation_id, 'assistant', p_content, p_blocks
  );

  UPDATE public."ConversationTurn"
  SET status = v_terminal_status,
      "terminalReason" = v_terminal_reason,
      "lastError" = CASE
        WHEN v_terminal_status = 'failed'
          THEN left(COALESCE(p_error, 'turn failed'), 1000)
        ELSE NULL
      END,
      "finishedAt" = CASE WHEN v_terminal_status = 'paused' THEN NULL ELSE now() END,
      "leaseExpiresAt" = CASE
        WHEN v_terminal_status = 'paused'
          THEN now() + make_interval(secs => p_pause_lease_seconds)
        ELSE NULL
      END,
      "updatedAt" = now()
  WHERE id = p_turn_id;

  INSERT INTO public."ConversationTurnAssistantCommit" (
    "turnId", "attemptToken", "messageId", "requestedStatus",
    "terminalStatus", "terminalReason"
  ) VALUES (
    p_turn_id, p_attempt_token, p_message_id, p_status,
    v_terminal_status, v_terminal_reason
  )
  RETURNING * INTO v_commit;

  "turnId" := v_commit."turnId";
  "attemptToken" := v_commit."attemptToken";
  "messageId" := v_commit."messageId";
  "requestedStatus" := v_commit."requestedStatus";
  "terminalStatus" := v_commit."terminalStatus";
  "terminalReason" := v_commit."terminalReason";
  "createdAt" := v_commit."createdAt";
  RETURN NEXT;
END;
$$;

-- Harden the non-transcript terminal path too. An exact-token retry may read
-- the previously requested result, but it must never silently accept a
-- different already-terminal transition.
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
  v_reason text;
  v_error text;
BEGIN
  IF p_status NOT IN ('paused', 'completed', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'invalid conversation turn terminal status';
  END IF;
  IF NULLIF(btrim(COALESCE(p_attempt_token, '')), '') IS NULL
    OR p_pause_lease_seconds IS NULL
    OR p_pause_lease_seconds < 60
    OR p_pause_lease_seconds > 2592000
  THEN
    RAISE EXCEPTION 'invalid conversation turn finish lease';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_space_id || ':' || p_conversation_id, 0)
  );

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

  v_status := CASE
    WHEN v_turn."cancelRequestedAt" IS NOT NULL THEN 'cancelled'
    ELSE p_status
  END;
  v_reason := left(
    CASE
      WHEN v_turn."cancelRequestedAt" IS NOT NULL AND p_status <> 'cancelled'
        THEN 'cancel_requested'
      ELSE COALESCE(p_terminal_reason, v_status)
    END,
    200
  );
  v_error := CASE
    WHEN v_status = 'failed' THEN left(COALESCE(p_error, 'turn failed'), 1000)
    ELSE NULL
  END;

  IF v_turn.status IN ('paused', 'completed', 'failed', 'cancelled') THEN
    IF v_turn.status IS DISTINCT FROM v_status
      OR v_turn."terminalReason" IS DISTINCT FROM v_reason
      OR v_turn."lastError" IS DISTINCT FROM v_error
    THEN
      RAISE EXCEPTION 'conversation turn terminal result conflict';
    END IF;
    RETURN NEXT v_turn;
    RETURN;
  END IF;

  IF v_turn.status <> 'running'
    OR v_turn."leaseExpiresAt" IS NULL
    OR v_turn."leaseExpiresAt" <= now()
  THEN
    RAISE EXCEPTION 'conversation turn lease is no longer active';
  END IF;

  UPDATE public."ConversationTurn"
  SET status = v_status,
      "terminalReason" = v_reason,
      "lastError" = v_error,
      "finishedAt" = CASE WHEN v_status = 'paused' THEN NULL ELSE now() END,
      "leaseExpiresAt" = CASE
        WHEN v_status = 'paused'
          THEN now() + make_interval(secs => p_pause_lease_seconds)
        ELSE NULL
      END,
      "updatedAt" = now()
  WHERE id = p_turn_id
  RETURNING * INTO v_turn;

  RETURN NEXT v_turn;
END;
$$;

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
BEGIN
  -- Fail closed instead of borrowing the row's *current* token. A stale
  -- rolling-deploy caller has no way to prove it owns a resumed attempt.
  RAISE EXCEPTION 'finish_conversation_turn requires explicit v2 attempt authority';
END;
$$;

REVOKE ALL ON TABLE public."ConversationTurnAssistantCommit" FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_conversation_turn(
  text,text,text,text,text,text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commit_conversation_turn_assistant_v2(
  text,text,text,text,text,text,jsonb,text,text,text,integer
) FROM PUBLIC;

DO $$
DECLARE v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format(
        'REVOKE ALL ON TABLE public."ConversationTurnAssistantCommit" FROM %I',
        v_role
      );
      EXECUTE format(
        'REVOKE ALL ON FUNCTION public.commit_conversation_turn_assistant_v2(text,text,text,text,text,text,jsonb,text,text,text,integer) FROM %I',
        v_role
      );
      EXECUTE format(
        'REVOKE ALL ON FUNCTION public.finish_conversation_turn(text,text,text,text,text,text) FROM %I',
        v_role
      );
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE EXECUTE ON FUNCTION public.finish_conversation_turn(
      text,text,text,text,text,text
    ) FROM service_role;
    GRANT EXECUTE ON FUNCTION public.commit_conversation_turn_assistant_v2(
      text,text,text,text,text,text,jsonb,text,text,text,integer
    ) TO service_role;
  END IF;
END;
$$;
