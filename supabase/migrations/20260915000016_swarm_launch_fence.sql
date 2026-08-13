-- Durable, token-fenced launch authority for billable specialist swarms.
--
-- A launch token is minted by the app and committed with the SwarmRun before
-- the Cloudflare Queue send. Queue delivery is at-least-once: the same token
-- may be replayed, but a different token, a different active run in the same
-- space, or a late Modal worker can never publish state, members, or events.

ALTER TABLE public."SwarmRun"
  ADD COLUMN IF NOT EXISTS "launchToken" text,
  ADD COLUMN IF NOT EXISTS "launchLeaseExpiresAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "modalAcceptedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "launchUpdatedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "customAgentIds" text[] NOT NULL DEFAULT '{}'::text[];

CREATE TABLE IF NOT EXISTS public."SwarmRunLaunchReceipt" (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "swarmRunId" text NOT NULL REFERENCES public."SwarmRun"(id) ON DELETE CASCADE,
  "spaceId" text NOT NULL REFERENCES public."Space"(id) ON DELETE CASCADE,
  "launchToken" text NOT NULL,
  state text NOT NULL CHECK (state IN ('claimed','accepted','failed')),
  reason text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("swarmRunId", "launchToken", state)
);

ALTER TABLE public."SwarmRunLaunchReceipt" ENABLE ROW LEVEL SECURITY;

-- Only token-bearing (new-rail) runs participate in the unique constraint.
-- Legacy active rows still fail closed in create_claimed_swarm_run under the
-- same per-space advisory lock.
CREATE UNIQUE INDEX IF NOT EXISTS "SwarmRun_one_billable_active_per_space_idx"
  ON public."SwarmRun" ("spaceId")
  WHERE "launchToken" IS NOT NULL
    AND status IN ('queued','planning','running','auditing');
CREATE INDEX IF NOT EXISTS "SwarmRun_launch_recovery_idx"
  ON public."SwarmRun" ("launchUpdatedAt")
  WHERE "launchToken" IS NOT NULL
    AND status IN ('queued','planning','running','auditing');

CREATE OR REPLACE FUNCTION public.create_claimed_swarm_run(
  p_run_id text,
  p_space_id text,
  p_goal text,
  p_conversation_id text,
  p_custom_agent_ids text[],
  p_launch_token text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_run_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR p_launch_token !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR NULLIF(btrim(p_space_id), '') IS NULL
    OR NULLIF(btrim(p_goal), '') IS NULL
    OR char_length(p_goal) > 2000
    OR p_custom_agent_ids IS NULL
    OR cardinality(p_custom_agent_ids) > 50
  THEN RETURN 'invalid'; END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(p_custom_agent_ids) AS requested(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public."CustomAgent" AS agent
      WHERE agent.id = requested.id
        AND agent."spaceId" = p_space_id
        AND agent."isActive" = true
    )
  ) THEN RETURN 'invalid_custom_agents'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('swarm-launch:' || p_space_id, 0));
  IF EXISTS (
    SELECT 1 FROM public."SwarmRun" AS active_run
    WHERE active_run."spaceId" = p_space_id
      AND active_run.status IN ('queued','planning','running','auditing')
  ) THEN RETURN 'concurrent'; END IF;

  INSERT INTO public."SwarmRun"(
    id,"spaceId",goal,"conversationId",status,"customAgentIds",
    "launchToken","launchLeaseExpiresAt","launchUpdatedAt"
  ) VALUES (
    p_run_id,p_space_id,p_goal,NULLIF(p_conversation_id,''),'queued',p_custom_agent_ids,
    p_launch_token,now()+interval '2 minutes',now()
  );
  INSERT INTO public."SwarmRunLaunchReceipt"(
    "swarmRunId","spaceId","launchToken",state
  ) VALUES (p_run_id,p_space_id,p_launch_token,'claimed');
  RETURN 'claimed';
EXCEPTION
  WHEN unique_violation THEN RETURN 'concurrent';
  WHEN foreign_key_violation THEN RETURN 'invalid';
END;
$$;

-- Queue redelivery revalidates the immutable claim. It never refreshes the
-- recovery clock, otherwise repeated delivery could keep a dead claim alive.
CREATE OR REPLACE FUNCTION public.claim_swarm_launch(
  p_run_id text,
  p_space_id text,
  p_launch_token text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_run public."SwarmRun"%ROWTYPE;
BEGIN
  IF NULLIF(btrim(p_run_id),'') IS NULL
    OR NULLIF(btrim(p_space_id),'') IS NULL
    OR p_launch_token !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN RETURN 'invalid'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('swarm-launch:' || p_space_id, 0));
  SELECT * INTO v_run FROM public."SwarmRun"
  WHERE id=p_run_id AND "spaceId"=p_space_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF v_run.status IN ('completed','failed','cancelled') THEN RETURN 'terminal'; END IF;
  IF v_run."launchToken" IS DISTINCT FROM p_launch_token THEN RETURN 'stale'; END IF;
  IF v_run.status NOT IN ('queued','planning','running','auditing') THEN RETURN 'inactive'; END IF;
  RETURN 'claimed';
END;
$$;

-- This is the single billable-work gate. Only its first invocation returns
-- accepted; a network-unknown retry gets duplicate and must not spawn again.
CREATE OR REPLACE FUNCTION public.accept_swarm_launch(
  p_run_id text,
  p_space_id text,
  p_launch_token text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_run public."SwarmRun"%ROWTYPE;
BEGIN
  SELECT * INTO v_run FROM public."SwarmRun"
  WHERE id=p_run_id AND "spaceId"=p_space_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF v_run."launchToken" IS DISTINCT FROM p_launch_token THEN RETURN 'stale'; END IF;
  IF v_run.status IN ('completed','failed','cancelled') THEN RETURN 'terminal'; END IF;
  IF v_run."modalAcceptedAt" IS NOT NULL THEN RETURN 'duplicate'; END IF;
  IF v_run.status <> 'queued' THEN RETURN 'inactive'; END IF;

  UPDATE public."SwarmRun"
  SET "modalAcceptedAt"=now(),
      "launchLeaseExpiresAt"=now()+interval '11 minutes',
      "launchUpdatedAt"=now()
  WHERE id=p_run_id;
  INSERT INTO public."SwarmRunLaunchReceipt"(
    "swarmRunId","spaceId","launchToken",state
  ) VALUES (p_run_id,p_space_id,p_launch_token,'accepted')
  ON CONFLICT ("swarmRunId","launchToken",state) DO NOTHING;
  RETURN 'accepted';
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_fenced_swarm_run(
  p_run_id text,
  p_space_id text,
  p_launch_token text,
  p_allowed_statuses text[],
  p_status text,
  p_plan jsonb DEFAULT NULL,
  p_result text DEFAULT NULL,
  p_error text DEFAULT NULL,
  p_completed_at timestamptz DEFAULT NULL,
  p_event_type text DEFAULT NULL,
  p_event_data jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_run public."SwarmRun"%ROWTYPE;
BEGIN
  IF p_status NOT IN ('planning','running','auditing','completed','failed','cancelled')
    OR p_allowed_statuses IS NULL OR cardinality(p_allowed_statuses)<1
    OR EXISTS (SELECT 1 FROM unnest(p_allowed_statuses) s
      WHERE s NOT IN ('queued','planning','running','auditing'))
    OR p_event_data IS NULL OR jsonb_typeof(p_event_data)<>'object'
    OR (p_event_type IS NOT NULL AND (NULLIF(btrim(p_event_type),'') IS NULL OR char_length(p_event_type)>100))
  THEN RAISE EXCEPTION 'invalid fenced swarm transition'; END IF;

  SELECT * INTO v_run FROM public."SwarmRun"
  WHERE id=p_run_id AND "spaceId"=p_space_id FOR UPDATE;
  IF NOT FOUND
    OR v_run."launchToken" IS DISTINCT FROM p_launch_token
    OR v_run."modalAcceptedAt" IS NULL
    OR NOT (v_run.status=ANY(p_allowed_statuses))
  THEN RETURN false; END IF;

  UPDATE public."SwarmRun"
  SET status=p_status,
      plan=CASE WHEN p_plan IS NULL THEN plan ELSE p_plan END,
      result=CASE WHEN p_result IS NULL THEN result ELSE p_result END,
      "errorMessage"=CASE WHEN p_error IS NULL THEN "errorMessage" ELSE left(p_error,1000) END,
      "completedAt"=CASE WHEN p_status IN ('completed','failed','cancelled')
        THEN COALESCE(p_completed_at,now()) ELSE "completedAt" END,
      "launchUpdatedAt"=now()
  WHERE id=p_run_id;
  IF p_event_type IS NOT NULL THEN
    INSERT INTO public."SwarmEvent"("swarmRunId",type,data)
    VALUES (p_run_id,p_event_type,p_event_data);
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.insert_fenced_swarm_event(
  p_run_id text,
  p_space_id text,
  p_launch_token text,
  p_allowed_statuses text[],
  p_event_type text,
  p_event_data jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_run public."SwarmRun"%ROWTYPE;
BEGIN
  IF p_allowed_statuses IS NULL OR cardinality(p_allowed_statuses)<1
    OR EXISTS (SELECT 1 FROM unnest(p_allowed_statuses) s
      WHERE s NOT IN ('queued','planning','running','auditing'))
    OR NULLIF(btrim(p_event_type),'') IS NULL OR char_length(p_event_type)>100
    OR p_event_data IS NULL OR jsonb_typeof(p_event_data)<>'object'
  THEN RAISE EXCEPTION 'invalid fenced swarm event'; END IF;
  SELECT * INTO v_run FROM public."SwarmRun"
  WHERE id=p_run_id AND "spaceId"=p_space_id FOR UPDATE;
  IF NOT FOUND OR v_run."launchToken" IS DISTINCT FROM p_launch_token
    OR v_run."modalAcceptedAt" IS NULL OR NOT (v_run.status=ANY(p_allowed_statuses))
  THEN RETURN false; END IF;
  INSERT INTO public."SwarmEvent"("swarmRunId",type,data)
  VALUES (p_run_id,p_event_type,p_event_data);
  UPDATE public."SwarmRun" SET "launchUpdatedAt"=now() WHERE id=p_run_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.insert_fenced_swarm_member(
  p_run_id text,
  p_space_id text,
  p_launch_token text,
  p_name text,
  p_role text,
  p_system_prompt text,
  p_task text,
  p_wave integer,
  p_custom_agent_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_run public."SwarmRun"%ROWTYPE; v_member public."SwarmMember"%ROWTYPE;
BEGIN
  SELECT * INTO v_run FROM public."SwarmRun"
  WHERE id=p_run_id AND "spaceId"=p_space_id FOR UPDATE;
  IF NOT FOUND OR v_run."launchToken" IS DISTINCT FROM p_launch_token
    OR v_run."modalAcceptedAt" IS NULL OR v_run.status<>'running'
  THEN RETURN NULL; END IF;
  IF NULLIF(btrim(p_name),'') IS NULL OR NULLIF(btrim(p_task),'') IS NULL
    OR char_length(p_name)>200 OR char_length(p_task)>5000 OR p_wave NOT IN (1,2)
    OR (p_custom_agent_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public."CustomAgent" a
      WHERE a.id=p_custom_agent_id AND a."spaceId"=p_space_id AND a."isActive"=true
    ))
  THEN RAISE EXCEPTION 'invalid fenced swarm member'; END IF;
  INSERT INTO public."SwarmMember"(
    "swarmRunId","customAgentId",name,role,"systemPrompt",task,wave,status
  ) VALUES (
    p_run_id,p_custom_agent_id,p_name,left(COALESCE(p_role,''),500),
    left(COALESCE(p_system_prompt,''),10000),p_task,p_wave,'queued'
  ) RETURNING * INTO v_member;
  UPDATE public."SwarmRun" SET "launchUpdatedAt"=now() WHERE id=p_run_id;
  RETURN to_jsonb(v_member);
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_fenced_swarm_member(
  p_run_id text,
  p_space_id text,
  p_launch_token text,
  p_member_id text,
  p_allowed_statuses text[],
  p_status text,
  p_event_type text,
  p_event_data jsonb,
  p_started_at timestamptz DEFAULT NULL,
  p_completed_at timestamptz DEFAULT NULL,
  p_output text DEFAULT NULL,
  p_set_output boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_run public."SwarmRun"%ROWTYPE;
BEGIN
  IF p_status NOT IN ('running','completed','failed')
    OR p_allowed_statuses IS NULL OR cardinality(p_allowed_statuses)<1
    OR EXISTS (SELECT 1 FROM unnest(p_allowed_statuses) s
      WHERE s NOT IN ('queued','running'))
    OR NULLIF(btrim(p_event_type),'') IS NULL OR char_length(p_event_type)>100
    OR p_event_data IS NULL OR jsonb_typeof(p_event_data)<>'object'
  THEN RAISE EXCEPTION 'invalid fenced swarm member transition'; END IF;
  SELECT * INTO v_run FROM public."SwarmRun"
  WHERE id=p_run_id AND "spaceId"=p_space_id FOR UPDATE;
  IF NOT FOUND OR v_run."launchToken" IS DISTINCT FROM p_launch_token
    OR v_run."modalAcceptedAt" IS NULL OR v_run.status<>'running'
  THEN RETURN false; END IF;
  UPDATE public."SwarmMember"
  SET status=p_status,
      "startedAt"=COALESCE(p_started_at,"startedAt"),
      "completedAt"=COALESCE(p_completed_at,"completedAt"),
      output=CASE WHEN p_set_output THEN p_output ELSE output END
  WHERE id=p_member_id AND "swarmRunId"=p_run_id AND status=ANY(p_allowed_statuses);
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public."SwarmEvent"("swarmRunId","memberId",type,data)
  VALUES (p_run_id,p_member_id,p_event_type,p_event_data);
  UPDATE public."SwarmRun" SET "launchUpdatedAt"=now() WHERE id=p_run_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_stale_swarm_launch(
  p_run_id text,
  p_space_id text,
  p_launch_token text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_run public."SwarmRun"%ROWTYPE;
  v_error CONSTANT text := 'Specialist runtime did not finish within its bounded execution window.';
BEGIN
  SELECT * INTO v_run FROM public."SwarmRun"
  WHERE id=p_run_id AND "spaceId"=p_space_id FOR UPDATE;
  IF NOT FOUND OR v_run."launchToken" IS DISTINCT FROM p_launch_token
    OR v_run.status NOT IN ('queued','planning','running','auditing')
    OR COALESCE(v_run."modalAcceptedAt",v_run."launchUpdatedAt") IS NULL
    OR COALESCE(v_run."modalAcceptedAt",v_run."launchUpdatedAt") >= now()-interval '11 minutes'
  THEN RETURN false; END IF;
  UPDATE public."SwarmRun" SET status='failed',"errorMessage"=v_error,
    "completedAt"=now(),"launchUpdatedAt"=now() WHERE id=p_run_id;
  INSERT INTO public."SwarmEvent"("swarmRunId",type,data)
  VALUES (p_run_id,'swarm_failed',jsonb_build_object('error',v_error,'phase','runtime_timeout'));
  INSERT INTO public."SwarmRunLaunchReceipt"(
    "swarmRunId","spaceId","launchToken",state,reason
  ) VALUES (p_run_id,p_space_id,p_launch_token,'failed','bounded runtime timeout')
  ON CONFLICT ("swarmRunId","launchToken",state) DO NOTHING;
  RETURN true;
END;
$$;

-- Used only when the producer cannot prove that the delayed timeout message
-- was armed. No billable launch has been enqueued at that point, so it is safe
-- to close the claim immediately. A timeout message whose HTTP acknowledgement
-- was lost can arrive later and will observe the terminal row as a no-op.
CREATE OR REPLACE FUNCTION public.fail_unaccepted_swarm_launch(
  p_run_id text,
  p_space_id text,
  p_launch_token text,
  p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_run public."SwarmRun"%ROWTYPE;
  v_error text := left(COALESCE(NULLIF(btrim(p_reason),''),'Specialist launch recovery could not be armed.'),1000);
BEGIN
  SELECT * INTO v_run FROM public."SwarmRun"
  WHERE id=p_run_id AND "spaceId"=p_space_id FOR UPDATE;
  IF NOT FOUND OR v_run."launchToken" IS DISTINCT FROM p_launch_token
    OR v_run.status<>'queued' OR v_run."modalAcceptedAt" IS NOT NULL
  THEN RETURN false; END IF;
  UPDATE public."SwarmRun" SET status='failed',"errorMessage"=v_error,
    "completedAt"=now(),"launchUpdatedAt"=now() WHERE id=p_run_id;
  INSERT INTO public."SwarmEvent"("swarmRunId",type,data)
  VALUES (p_run_id,'swarm_failed',jsonb_build_object('error',v_error,'phase','launch_recovery'));
  INSERT INTO public."SwarmRunLaunchReceipt"(
    "swarmRunId","spaceId","launchToken",state,reason
  ) VALUES (p_run_id,p_space_id,p_launch_token,'failed','timeout recovery not armed')
  ON CONFLICT ("swarmRunId","launchToken",state) DO NOTHING;
  RETURN true;
END;
$$;

REVOKE ALL ON TABLE public."SwarmRunLaunchReceipt" FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_claimed_swarm_run(text,text,text,text,text[],text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_swarm_launch(text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_swarm_launch(text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transition_fenced_swarm_run(text,text,text,text[],text,jsonb,text,text,timestamptz,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.insert_fenced_swarm_event(text,text,text,text[],text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.insert_fenced_swarm_member(text,text,text,text,text,text,text,integer,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transition_fenced_swarm_member(text,text,text,text,text[],text,text,jsonb,timestamptz,timestamptz,text,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_stale_swarm_launch(text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_unaccepted_swarm_launch(text,text,text,text) FROM PUBLIC;

DO $$
DECLARE v_role text; v_signature text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=v_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public."SwarmRunLaunchReceipt" FROM %I',v_role);
      FOREACH v_signature IN ARRAY ARRAY[
        'public.create_claimed_swarm_run(text,text,text,text,text[],text)',
        'public.claim_swarm_launch(text,text,text)',
        'public.accept_swarm_launch(text,text,text)',
        'public.transition_fenced_swarm_run(text,text,text,text[],text,jsonb,text,text,timestamptz,text,jsonb)',
        'public.insert_fenced_swarm_event(text,text,text,text[],text,jsonb)',
        'public.insert_fenced_swarm_member(text,text,text,text,text,text,text,integer,text)',
        'public.transition_fenced_swarm_member(text,text,text,text,text[],text,text,jsonb,timestamptz,timestamptz,text,boolean)',
        'public.fail_stale_swarm_launch(text,text,text)',
        'public.fail_unaccepted_swarm_launch(text,text,text,text)'
      ] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',v_signature,v_role);
      END LOOP;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    GRANT SELECT,INSERT ON TABLE public."SwarmRunLaunchReceipt" TO service_role;
    GRANT EXECUTE ON FUNCTION public.create_claimed_swarm_run(text,text,text,text,text[],text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.claim_swarm_launch(text,text,text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.accept_swarm_launch(text,text,text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.transition_fenced_swarm_run(text,text,text,text[],text,jsonb,text,text,timestamptz,text,jsonb) TO service_role;
    GRANT EXECUTE ON FUNCTION public.insert_fenced_swarm_event(text,text,text,text[],text,jsonb) TO service_role;
    GRANT EXECUTE ON FUNCTION public.insert_fenced_swarm_member(text,text,text,text,text,text,text,integer,text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.transition_fenced_swarm_member(text,text,text,text,text[],text,text,jsonb,timestamptz,timestamptz,text,boolean) TO service_role;
    GRANT EXECUTE ON FUNCTION public.fail_stale_swarm_launch(text,text,text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.fail_unaccepted_swarm_launch(text,text,text,text) TO service_role;
  END IF;
END;
$$;
