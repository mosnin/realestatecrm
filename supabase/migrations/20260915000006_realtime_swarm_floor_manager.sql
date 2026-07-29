-- Feature-off Realtime floor-manager linkage and idempotent cancellation.
ALTER TABLE public."SwarmRun"
  ADD COLUMN IF NOT EXISTS "conversationId" text
  REFERENCES public."Conversation"(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS swarm_run_space_conversation_created_idx
  ON public."SwarmRun" ("spaceId", "conversationId", "createdAt" DESC)
  WHERE "conversationId" IS NOT NULL;

CREATE TABLE IF NOT EXISTS public."RealtimeSwarmControlReceipt" (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId" text NOT NULL REFERENCES public."Space"(id) ON DELETE CASCADE,
  "conversationId" text NOT NULL REFERENCES public."Conversation"(id) ON DELETE CASCADE,
  "callId" text NOT NULL CHECK (char_length("callId") BETWEEN 1 AND 200),
  action text NOT NULL CHECK (action = 'cancel_specialist_task'),
  "runId" text REFERENCES public."SwarmRun"(id) ON DELETE SET NULL,
  outcome text NOT NULL CHECK (outcome IN ('cancelled','already_terminal','no_run')),
  status text CHECK (status IN ('queued','planning','running','auditing','completed','failed','cancelled')),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("spaceId", "conversationId", "callId", action)
);
ALTER TABLE public."RealtimeSwarmControlReceipt" ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.cancel_conversation_swarm_run(
  p_space_id text,
  p_conversation_id text,
  p_call_id text
) RETURNS TABLE(run_id text, outcome text, status text, reused boolean)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_receipt public."RealtimeSwarmControlReceipt"%ROWTYPE;
  v_run public."SwarmRun"%ROWTYPE;
  -- Capture the database call time before any wait. Runs created later cannot
  -- affect this decision or the receipt that provider retries will reuse.
  v_call_cutoff timestamptz := statement_timestamp();
BEGIN
  IF char_length(COALESCE(p_call_id, '')) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'invalid realtime control call';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public."Conversation"
    WHERE id = p_conversation_id AND "spaceId" = p_space_id
  ) THEN RAISE EXCEPTION 'conversation not found'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_space_id || ':' || p_conversation_id || ':' || p_call_id || ':cancel_specialist_task',
    0
  ));
  SELECT * INTO v_receipt
  FROM public."RealtimeSwarmControlReceipt"
  WHERE "spaceId" = p_space_id
    AND "conversationId" = p_conversation_id
    AND "callId" = p_call_id
    AND action = 'cancel_specialist_task'
  FOR UPDATE;
  IF FOUND THEN
    RETURN QUERY SELECT v_receipt."runId", v_receipt.outcome, v_receipt.status, true;
    RETURN;
  END IF;

  SELECT * INTO v_run
  FROM public."SwarmRun" AS r
  WHERE r."spaceId" = p_space_id
    AND r."conversationId" = p_conversation_id
    AND r."createdAt" <= v_call_cutoff
    AND r.status IN ('queued','planning','running','auditing')
  ORDER BY r."createdAt" DESC
  LIMIT 1
  FOR UPDATE;
  IF FOUND THEN
    UPDATE public."SwarmRun" AS r
      SET status = 'cancelled', "completedAt" = now()
      WHERE r.id = v_run.id
        AND r."spaceId" = p_space_id
        AND r.status IN ('queued','planning','running','auditing');
    IF FOUND THEN
      INSERT INTO public."SwarmEvent" ("swarmRunId", type, data)
      VALUES (v_run.id, 'swarm_cancelled', '{"reason":"voice_user_cancelled"}'::jsonb);
      INSERT INTO public."RealtimeSwarmControlReceipt"
        ("spaceId","conversationId","callId",action,"runId",outcome,status)
      VALUES
        (p_space_id,p_conversation_id,p_call_id,'cancel_specialist_task',v_run.id,'cancelled','cancelled');
      RETURN QUERY SELECT v_run.id, 'cancelled'::text, 'cancelled'::text, false;
      RETURN;
    END IF;
    -- The row was locked, so this is defensive against future trigger-based
    -- transitions. Re-read a truthful terminal outcome in this transaction.
    SELECT * INTO v_run FROM public."SwarmRun" AS r
      WHERE r.id = v_run.id
        AND r."spaceId" = p_space_id
        AND r."createdAt" <= v_call_cutoff
        AND r.status IN ('completed','failed','cancelled')
      FOR UPDATE;
  ELSE
    SELECT * INTO v_run
    FROM public."SwarmRun" AS r
    WHERE r."spaceId" = p_space_id
      AND r."conversationId" = p_conversation_id
      AND r."createdAt" <= v_call_cutoff
      AND r.status IN ('completed','failed','cancelled')
    ORDER BY r."createdAt" DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF v_run.id IS NULL THEN
    INSERT INTO public."RealtimeSwarmControlReceipt"
      ("spaceId","conversationId","callId",action,"runId",outcome,status)
    VALUES
      (p_space_id,p_conversation_id,p_call_id,'cancel_specialist_task',NULL,'no_run',NULL);
    RETURN QUERY SELECT NULL::text, 'no_run'::text, NULL::text, false;
  ELSE
    INSERT INTO public."RealtimeSwarmControlReceipt"
      ("spaceId","conversationId","callId",action,"runId",outcome,status)
    VALUES
      (p_space_id,p_conversation_id,p_call_id,'cancel_specialist_task',v_run.id,'already_terminal',v_run.status);
    RETURN QUERY SELECT v_run.id, 'already_terminal'::text, v_run.status, false;
  END IF;
END; $$;

REVOKE ALL ON FUNCTION public.cancel_conversation_swarm_run(text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_conversation_swarm_run(text,text,text)
  TO service_role;
