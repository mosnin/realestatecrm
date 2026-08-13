-- Durable Chat/Work turn queue.
--
-- A browser-local array cannot survive navigation, reload, or another device,
-- and a conversation-scoped stop bit can cancel the wrong turn.  This ledger
-- gives every submitted instruction a stable identity and keeps queue order,
-- steering, cancellation, approval pauses, and idempotency in PostgreSQL.

CREATE TABLE IF NOT EXISTS public."ConversationTurn" (
  id text PRIMARY KEY,
  "spaceId" text NOT NULL REFERENCES public."Space"(id) ON DELETE CASCADE,
  "conversationId" text NOT NULL REFERENCES public."Conversation"(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('chat', 'work')),
  source text NOT NULL CHECK (source IN ('typed', 'voice', 'steer')),
  "clientRequestId" text NOT NULL,
  message text NOT NULL,
  "attachmentIds" jsonb NOT NULL DEFAULT '[]'::jsonb,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  priority smallint NOT NULL DEFAULT 0 CHECK (priority IN (0, 1)),
  "enqueueSeq" bigint GENERATED ALWAYS AS IDENTITY,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed', 'cancelled')),
  "cancelRequestedAt" timestamptz,
  "startedAt" timestamptz,
  "finishedAt" timestamptz,
  "terminalReason" text,
  "lastError" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("spaceId", "conversationId", "clientRequestId")
);

CREATE INDEX IF NOT EXISTS "ConversationTurn_conversation_queue_idx"
  ON public."ConversationTurn" ("spaceId", "conversationId", priority DESC, "enqueueSeq" ASC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS "ConversationTurn_conversation_live_idx"
  ON public."ConversationTurn" ("spaceId", "conversationId", status, "updatedAt" DESC)
  WHERE status IN ('running', 'paused', 'failed');

-- One active execution (including an approval pause) per conversation.
CREATE UNIQUE INDEX IF NOT EXISTS "ConversationTurn_one_active_idx"
  ON public."ConversationTurn" ("spaceId", "conversationId")
  WHERE status IN ('running', 'paused');

ALTER TABLE public."ConversationTurn" ENABLE ROW LEVEL SECURITY;

-- Bind SDK approval checkpoints to the exact turn that created them.
ALTER TABLE public."AgentPausedRun"
  ADD COLUMN IF NOT EXISTS "turnId" text REFERENCES public."ConversationTurn"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "AgentPausedRun_turnId_idx"
  ON public."AgentPausedRun" ("turnId")
  WHERE "turnId" IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enqueue_conversation_turn(
  p_turn_id text,
  p_space_id text,
  p_conversation_id text,
  p_mode text,
  p_source text,
  p_client_request_id text,
  p_message text,
  p_attachment_ids jsonb DEFAULT '[]'::jsonb,
  p_attachments jsonb DEFAULT '[]'::jsonb,
  p_active_turn_id text DEFAULT NULL
)
RETURNS SETOF public."ConversationTurn"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_conversation public."Conversation"%ROWTYPE;
  v_existing public."ConversationTurn"%ROWTYPE;
  v_attachment_ids jsonb := COALESCE(p_attachment_ids, '[]'::jsonb);
  v_attachments jsonb := COALESCE(p_attachments, '[]'::jsonb);
BEGIN
  IF NULLIF(btrim(p_turn_id), '') IS NULL
    OR length(p_turn_id) > 200
    OR NULLIF(btrim(p_space_id), '') IS NULL
    OR NULLIF(btrim(p_conversation_id), '') IS NULL
    OR p_mode NOT IN ('chat', 'work')
    OR p_source NOT IN ('typed', 'voice', 'steer')
    OR NULLIF(btrim(p_client_request_id), '') IS NULL
    OR length(p_client_request_id) > 200
    OR NULLIF(btrim(p_message), '') IS NULL
    OR length(p_message) > 8000
    OR jsonb_typeof(v_attachment_ids) <> 'array'
    OR jsonb_array_length(v_attachment_ids) > 20
    OR jsonb_typeof(v_attachments) <> 'array'
    OR jsonb_array_length(v_attachments) > 20
  THEN
    RAISE EXCEPTION 'invalid conversation turn';
  END IF;

  SELECT * INTO v_conversation
  FROM public."Conversation"
  WHERE id = p_conversation_id AND "spaceId" = p_space_id
  FOR UPDATE;

  IF NOT FOUND OR v_conversation.mode IS DISTINCT FROM p_mode THEN
    RAISE EXCEPTION 'conversation turn binding mismatch';
  END IF;

  SELECT * INTO v_existing
  FROM public."ConversationTurn"
  WHERE "spaceId" = p_space_id
    AND "conversationId" = p_conversation_id
    AND "clientRequestId" = p_client_request_id;

  IF FOUND THEN
    IF v_existing.id <> p_turn_id
      OR v_existing.mode <> p_mode
      OR v_existing.source <> p_source
      OR v_existing.message <> btrim(p_message)
      OR v_existing."attachmentIds" <> v_attachment_ids
      OR v_existing.attachments <> v_attachments
    THEN
      RAISE EXCEPTION 'conversation turn idempotency conflict';
    END IF;
    RETURN NEXT v_existing;
    RETURN;
  END IF;

  IF (
    SELECT count(*)
    FROM public."ConversationTurn"
    WHERE "spaceId" = p_space_id
      AND "conversationId" = p_conversation_id
      AND status = 'pending'
  ) >= 50 THEN
    RAISE EXCEPTION 'conversation queue limit reached';
  END IF;

  IF p_source = 'steer' THEN
    IF NULLIF(btrim(COALESCE(p_active_turn_id, '')), '') IS NULL THEN
      RAISE EXCEPTION 'active turn required for steering';
    END IF;

    UPDATE public."ConversationTurn"
    SET "cancelRequestedAt" = COALESCE("cancelRequestedAt", now()),
        "updatedAt" = now()
    WHERE id = p_active_turn_id
      AND "spaceId" = p_space_id
      AND "conversationId" = p_conversation_id
      AND status = 'running';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'active turn is not running';
    END IF;
  ELSIF p_active_turn_id IS NOT NULL THEN
    RAISE EXCEPTION 'active turn is only valid for steering';
  END IF;

  INSERT INTO public."ConversationTurn" (
    id, "spaceId", "conversationId", mode, source, "clientRequestId",
    message, "attachmentIds", attachments, priority
  ) VALUES (
    p_turn_id, p_space_id, p_conversation_id, p_mode, p_source,
    p_client_request_id, btrim(p_message), v_attachment_ids, v_attachments,
    CASE WHEN p_source = 'steer' THEN 1 ELSE 0 END
  )
  RETURNING * INTO v_existing;

  RETURN NEXT v_existing;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_conversation_turn(
  p_turn_id text,
  p_space_id text,
  p_conversation_id text,
  p_client_request_id text,
  p_message text,
  p_attachment_ids jsonb
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
  -- Serialize claim/finish/enqueue decisions per conversation without a
  -- global queue lock.  hashtextextended is deterministic within Postgres.
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

  -- A review pause or unresolved failure deliberately holds later work.
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
  SET status = 'running', "startedAt" = COALESCE("startedAt", now()),
      "updatedAt" = now(), "lastError" = NULL, "terminalReason" = NULL
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
DECLARE
  v_turn public."ConversationTurn"%ROWTYPE;
  v_status text;
BEGIN
  IF p_status NOT IN ('paused', 'completed', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'invalid conversation turn terminal status';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_space_id || ':' || p_conversation_id, 0));

  SELECT * INTO v_turn
  FROM public."ConversationTurn"
  WHERE id = p_turn_id
    AND "spaceId" = p_space_id
    AND "conversationId" = p_conversation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'conversation turn not found';
  END IF;

  IF v_turn.status IN ('completed', 'cancelled') THEN
    RETURN NEXT v_turn;
    RETURN;
  END IF;

  IF v_turn.status <> 'running' THEN
    RAISE EXCEPTION 'conversation turn cannot finish from %', v_turn.status;
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
      "updatedAt" = now()
  WHERE id = p_turn_id
  RETURNING * INTO v_turn;

  RETURN NEXT v_turn;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_conversation_turn_cancel(
  p_turn_id text,
  p_space_id text,
  p_conversation_id text
)
RETURNS SETOF public."ConversationTurn"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_turn public."ConversationTurn"%ROWTYPE;
BEGIN
  UPDATE public."ConversationTurn"
  SET "cancelRequestedAt" = COALESCE("cancelRequestedAt", now()), "updatedAt" = now()
  WHERE id = p_turn_id
    AND "spaceId" = p_space_id
    AND "conversationId" = p_conversation_id
    AND status = 'running'
  RETURNING * INTO v_turn;
  IF NOT FOUND THEN RAISE EXCEPTION 'running conversation turn not found'; END IF;
  RETURN NEXT v_turn;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_queued_conversation_turn(
  p_turn_id text,
  p_space_id text,
  p_conversation_id text
)
RETURNS SETOF public."ConversationTurn"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_turn public."ConversationTurn"%ROWTYPE;
BEGIN
  UPDATE public."ConversationTurn"
  SET status = 'cancelled', "terminalReason" = 'removed_by_user',
      "finishedAt" = now(), "updatedAt" = now()
  WHERE id = p_turn_id
    AND "spaceId" = p_space_id
    AND "conversationId" = p_conversation_id
    AND status IN ('pending', 'failed')
  RETURNING * INTO v_turn;
  IF NOT FOUND THEN RAISE EXCEPTION 'removable conversation turn not found'; END IF;
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_turn public."ConversationTurn"%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_space_id || ':' || p_turn_id, 0));

  UPDATE public."AgentPausedRun"
  SET status = 'resumed', "updatedAt" = now()
  WHERE id = p_paused_run_id
    AND "turnId" = p_turn_id
    AND "spaceId" = p_space_id
    AND "userId" = p_user_id
    AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'paused run is already resolved'; END IF;

  UPDATE public."ConversationTurn"
  SET status = 'running', "updatedAt" = now(), "terminalReason" = NULL
  WHERE id = p_turn_id AND "spaceId" = p_space_id AND status = 'paused'
  RETURNING * INTO v_turn;
  IF NOT FOUND THEN RAISE EXCEPTION 'paused conversation turn not found'; END IF;

  RETURN NEXT v_turn;
END;
$$;

REVOKE ALL ON TABLE public."ConversationTurn" FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_conversation_turn(text,text,text,text,text,text,text,jsonb,jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_conversation_turn(text,text,text,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_conversation_turn(text,text,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_conversation_turn_cancel(text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_queued_conversation_turn(text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resume_paused_conversation_turn(text,text,text,text) FROM PUBLIC;

DO $$
DECLARE v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public."ConversationTurn" FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON FUNCTION public.enqueue_conversation_turn(text,text,text,text,text,text,text,jsonb,jsonb,text) FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON FUNCTION public.claim_conversation_turn(text,text,text,text,text,jsonb) FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON FUNCTION public.finish_conversation_turn(text,text,text,text,text,text) FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON FUNCTION public.request_conversation_turn_cancel(text,text,text) FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON FUNCTION public.cancel_queued_conversation_turn(text,text,text) FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON FUNCTION public.resume_paused_conversation_turn(text,text,text,text) FROM %I', v_role);
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE public."ConversationTurn" TO service_role;
    GRANT USAGE, SELECT ON SEQUENCE public."ConversationTurn_enqueueSeq_seq" TO service_role;
    GRANT EXECUTE ON FUNCTION public.enqueue_conversation_turn(text,text,text,text,text,text,text,jsonb,jsonb,text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.claim_conversation_turn(text,text,text,text,text,jsonb) TO service_role;
    GRANT EXECUTE ON FUNCTION public.finish_conversation_turn(text,text,text,text,text,text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.request_conversation_turn_cancel(text,text,text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.cancel_queued_conversation_turn(text,text,text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.resume_paused_conversation_turn(text,text,text,text) TO service_role;
  END IF;
END;
$$;
