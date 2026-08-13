-- Forward-only compatibility repair for the historical Chippi migration
-- lineage and the current main lineage.
--
-- Both branches used migration versions 20260905000000, 20260906000000, and
-- 20260908000000 for different files. Supabase records only the version, so a
-- database that ever applied the historical branch can skip the current-main
-- locale, WorkSessionAction, and ChatUsage idempotency migrations. Reassert
-- those current-main deltas here under a unique version. Everything is
-- intentionally idempotent so current-main databases are unchanged.

ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS region text;
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en';

ALTER TABLE public."User" DROP CONSTRAINT IF EXISTS "User_language_check";
ALTER TABLE public."User" ADD CONSTRAINT "User_language_check"
  CHECK (language IN ('en', 'es', 'ru'));

ALTER TABLE public."WorkSession" DROP CONSTRAINT IF EXISTS "WorkSession_status_check";
ALTER TABLE public."WorkSession" ADD CONSTRAINT "WorkSession_status_check" CHECK (status IN (
  'planning', 'awaiting_approval', 'awaiting_input', 'running',
  'awaiting_actions', 'completed', 'failed', 'cancelled'
));

CREATE TABLE IF NOT EXISTS public."WorkSessionAction" (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "sessionId" text NOT NULL REFERENCES public."WorkSession"(id) ON DELETE CASCADE,
  "spaceId" text NOT NULL REFERENCES public."Space"(id) ON DELETE CASCADE,
  tool text NOT NULL,
  args jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary text NOT NULL,
  rationale text,
  status text NOT NULL DEFAULT 'proposed' CHECK (
    status IN ('proposed', 'approved', 'denied', 'executed', 'failed')
  ),
  result jsonb,
  error text,
  "decidedByUserId" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "decidedAt" timestamptz,
  "executedAt" timestamptz
);

CREATE INDEX IF NOT EXISTS idx_wsaction_session
  ON public."WorkSessionAction"("sessionId", "createdAt");
CREATE INDEX IF NOT EXISTS idx_wsaction_space
  ON public."WorkSessionAction"("spaceId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_wsaction_pending
  ON public."WorkSessionAction"("sessionId") WHERE status = 'proposed';

ALTER TABLE public."WorkSessionAction" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'WorkSessionAction'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public."WorkSessionAction";
  END IF;
EXCEPTION WHEN undefined_object THEN
  NULL;
END;
$$;

DROP POLICY IF EXISTS wsaction_owner_select ON public."WorkSessionAction";
CREATE POLICY wsaction_owner_select ON public."WorkSessionAction"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public."Space" s
      WHERE s.id = "WorkSessionAction"."spaceId"
        AND s."ownerId" = public.current_user_internal_id()
    )
  );

ALTER TABLE public."ChatUsage" ADD COLUMN IF NOT EXISTS "idempotencyKey" text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_chatusage_idempotency
  ON public."ChatUsage"("spaceId", "idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;

-- The recovery RPC requires UUID-shaped launch tokens. Make the claim authority
-- enforce the same contract so a service caller cannot create an accepted task
-- that the timeout path can never fence or recover.
CREATE OR REPLACE FUNCTION public.claim_workspace_run_task_launch(
  p_task_id text,
  p_space_id text,
  p_token text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NULLIF(btrim(p_task_id), '') IS NULL
    OR NULLIF(btrim(p_space_id), '') IS NULL
    OR NULLIF(btrim(p_token), '') IS NULL
    OR p_token !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    RETURN false;
  END IF;

  UPDATE public."WorkspaceRunTask" t
  SET status = 'launching',
      "launchToken" = p_token,
      "launchLeaseExpiresAt" = now() + interval '2 minutes',
      "modalAcceptedAt" = NULL,
      "updatedAt" = now()
  FROM public."WorkspaceRun" r
  WHERE t.id = p_task_id
    AND t."spaceId" = p_space_id
    AND t."runId" = r.id
    AND r."spaceId" = p_space_id
    AND r.status = 'completed'
    AND t."cancellationRequestedAt" IS NULL
    AND (
      t.status = 'queued'
      OR (
        t.status = 'launching'
        AND t."modalAcceptedAt" IS NULL
        AND t."launchLeaseExpiresAt" IS NOT NULL
        AND t."launchLeaseExpiresAt" < now()
      )
    );
  RETURN FOUND;
END;
$$;

-- A conversation link is optional, but when present it is a tenant-scoped
-- relationship. The single-column foreign key alone cannot enforce that the
-- conversation and swarm belong to the same Space.
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
  IF NULLIF(btrim(p_run_id), '') IS NULL
    OR p_run_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR NULLIF(btrim(p_launch_token), '') IS NULL
    OR p_launch_token !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR NULLIF(btrim(p_space_id), '') IS NULL
    OR NULLIF(btrim(p_goal), '') IS NULL
    OR char_length(p_goal) > 2000
    OR p_custom_agent_ids IS NULL
    OR cardinality(p_custom_agent_ids) > 50
  THEN RETURN 'invalid'; END IF;

  IF NULLIF(p_conversation_id, '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public."Conversation" AS conversation
    WHERE conversation.id = p_conversation_id
      AND conversation."spaceId" = p_space_id
  ) THEN
    RETURN 'invalid_conversation';
  END IF;

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

REVOKE ALL ON FUNCTION public.claim_workspace_run_task_launch(text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_claimed_swarm_run(text,text,text,text,text[],text) FROM PUBLIC;

DO $$
DECLARE v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format(
        'REVOKE ALL ON FUNCTION public.claim_workspace_run_task_launch(text,text,text) FROM %I',
        v_role
      );
      EXECUTE format(
        'REVOKE ALL ON FUNCTION public.create_claimed_swarm_run(text,text,text,text,text[],text) FROM %I',
        v_role
      );
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.claim_workspace_run_task_launch(text,text,text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.create_claimed_swarm_run(text,text,text,text,text[],text) TO service_role;
  END IF;
END;
$$;
