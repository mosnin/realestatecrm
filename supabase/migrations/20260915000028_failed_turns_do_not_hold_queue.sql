-- A failed turn is terminal. It remains visible/removable for diagnosis but
-- must not prevent the next pending instruction from being claimed.
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
      AND status IN ('running', 'paused')
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
      attempts = attempts + 1,
      "leaseExpiresAt" = now() + make_interval(secs => p_lease_seconds),
      "updatedAt" = now(),
      "lastError" = NULL,
      "terminalReason" = NULL
  WHERE id = p_turn_id
  RETURNING * INTO v_turn;

  RETURN NEXT v_turn;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_conversation_turn_v2(
  text, text, text, text, text, jsonb, text, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_conversation_turn_v2(
  text, text, text, text, text, jsonb, text, integer
) TO service_role;
