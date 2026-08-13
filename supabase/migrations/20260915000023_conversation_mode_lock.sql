-- Chat versus Work is a conversation invariant, chosen with the first user
-- message. Keep the selector out of established threads and make stale tabs,
-- retries, and other devices obey the same server-authoritative choice.

ALTER TABLE public."Conversation"
  ADD COLUMN IF NOT EXISTS mode text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public."Conversation"'::regclass
      AND conname = 'Conversation_mode_check'
  ) THEN
    ALTER TABLE public."Conversation"
      ADD CONSTRAINT "Conversation_mode_check"
      CHECK (mode IS NULL OR mode IN ('chat', 'work'));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_conversation_mode(
  p_conversation_id text,
  p_space_id text,
  p_mode text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mode text;
BEGIN
  IF NULLIF(btrim(p_conversation_id), '') IS NULL
    OR NULLIF(btrim(p_space_id), '') IS NULL
    OR p_mode NOT IN ('chat', 'work')
  THEN
    RAISE EXCEPTION 'invalid conversation mode claim';
  END IF;

  SELECT mode INTO v_mode
  FROM public."Conversation"
  WHERE id = p_conversation_id AND "spaceId" = p_space_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'conversation not found';
  END IF;

  IF v_mode IS NULL THEN
    -- A legacy populated conversation predates this column. It was ordinary
    -- Chat, so a later stale client may not retroactively turn it into Work.
    v_mode := CASE WHEN EXISTS (
      SELECT 1
      FROM public."Message"
      WHERE "conversationId" = p_conversation_id
        AND "spaceId" = p_space_id
        AND role = 'user'
    ) THEN 'chat' ELSE p_mode END;

    UPDATE public."Conversation"
    SET mode = v_mode, "updatedAt" = "updatedAt"
    WHERE id = p_conversation_id AND "spaceId" = p_space_id;
  END IF;

  RETURN v_mode;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_conversation_mode(text,text,text) FROM PUBLIC;
DO $$
DECLARE v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format(
        'REVOKE ALL ON FUNCTION public.claim_conversation_mode(text,text,text) FROM %I',
        v_role
      );
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.claim_conversation_mode(text,text,text) TO service_role;
  END IF;
END;
$$;
