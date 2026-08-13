-- Make owner-initiated specialist cancellation one database decision. A run
-- may never become cancelled without its immutable cancellation event.

ALTER TABLE public."SwarmRun"
  ADD COLUMN IF NOT EXISTS "cancellationRequestedAt" timestamptz;

CREATE OR REPLACE FUNCTION public.cancel_swarm_run(
  p_run_id text,
  p_space_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_run public."SwarmRun"%ROWTYPE;
BEGIN
  IF NULLIF(btrim(p_run_id), '') IS NULL
    OR NULLIF(btrim(p_space_id), '') IS NULL
  THEN
    RAISE EXCEPTION 'invalid swarm cancellation request';
  END IF;

  SELECT * INTO v_run
  FROM public."SwarmRun"
  WHERE id = p_run_id AND "spaceId" = p_space_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;
  IF v_run.status IN ('completed', 'failed', 'cancelled') THEN
    RETURN jsonb_build_object(
      'outcome', 'already_terminal',
      'status', v_run.status
    );
  END IF;
  IF v_run.status NOT IN ('queued', 'planning', 'running', 'auditing') THEN
    RETURN jsonb_build_object('outcome', 'inactive', 'status', v_run.status);
  END IF;

  UPDATE public."SwarmRun"
  SET status = 'cancelled',
      "cancellationRequestedAt" = COALESCE("cancellationRequestedAt", now()),
      "completedAt" = now(),
      "launchUpdatedAt" = now()
  WHERE id = p_run_id;

  INSERT INTO public."SwarmEvent"("swarmRunId", type, data)
  VALUES (p_run_id, 'swarm_cancelled', '{"reason":"user_cancelled"}'::jsonb);

  RETURN jsonb_build_object('outcome', 'cancelled', 'status', 'cancelled');
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_swarm_run(text,text) FROM PUBLIC;
DO $$
DECLARE v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format(
        'REVOKE ALL ON FUNCTION public.cancel_swarm_run(text,text) FROM %I',
        v_role
      );
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.cancel_swarm_run(text,text) TO service_role;
  END IF;
END;
$$;
