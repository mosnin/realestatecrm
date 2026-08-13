-- Append-only evidence around the existing WorkspaceRun launch lease. The
-- lease remains the sole dispatch authority; receipts only explain recovery.
CREATE TABLE IF NOT EXISTS "WorkspaceRunLaunchReceipt" (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "runId" text NOT NULL REFERENCES "WorkspaceRun"(id) ON DELETE CASCADE,
  "spaceId" text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "launchToken" text NOT NULL,
  attempt integer NOT NULL CHECK (attempt > 0),
  state text NOT NULL CHECK (state IN ('claimed','accepted','recovering','failed')),
  reason text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("runId", "launchToken", state)
);
ALTER TABLE "WorkspaceRunLaunchReceipt" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "WorkspaceRun_recovery_scan_idx"
  ON "WorkspaceRun" (status, "updatedAt")
  WHERE status IN ('queued','launching') AND "cancellationRequestedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "WorkspaceRunLaunchReceipt_space_idx"
  ON "WorkspaceRunLaunchReceipt" ("spaceId");

CREATE OR REPLACE FUNCTION claim_workspace_launch(p_run_id text, p_space_id text, p_token text)
RETURNS boolean LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_run "WorkspaceRun"%ROWTYPE; v_attempt integer;
BEGIN
  SELECT * INTO v_run FROM "WorkspaceRun" WHERE id=p_run_id AND "spaceId"=p_space_id FOR UPDATE;
  IF NOT FOUND OR v_run."cancellationRequestedAt" IS NOT NULL OR v_run.status IN ('running','completed','failed','cancelled') THEN RETURN false; END IF;
  IF v_run.status='launching' AND (
    v_run."modalAcceptedAt" IS NOT NULL
    OR v_run."launchLeaseExpiresAt" IS NULL
    OR v_run."launchLeaseExpiresAt" >= now()
  ) THEN RETURN false; END IF;
  IF v_run.status NOT IN ('queued','launching') THEN RETURN false; END IF;
  SELECT COALESCE(max(attempt), 0) + 1 INTO v_attempt FROM "WorkspaceRunLaunchReceipt" WHERE "runId"=p_run_id;
  UPDATE "WorkspaceRun" SET status='launching', "launchToken"=p_token, "launchedAt"=now(), "launchLeaseExpiresAt"=now()+interval '2 minutes', "modalAcceptedAt"=NULL, "updatedAt"=now() WHERE id=p_run_id;
  INSERT INTO "WorkspaceRunLaunchReceipt"("runId","spaceId","launchToken",attempt,state) VALUES (p_run_id,p_space_id,p_token,v_attempt,'claimed');
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION record_workspace_launch_receipt(p_run_id text, p_space_id text, p_token text, p_state text, p_reason text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_run "WorkspaceRun"%ROWTYPE; v_attempt integer;
BEGIN
  SELECT * INTO v_run FROM "WorkspaceRun" WHERE id=p_run_id AND "spaceId"=p_space_id FOR UPDATE;
  IF NOT FOUND OR v_run.status IN ('completed','failed','cancelled') OR v_run."cancellationRequestedAt" IS NOT NULL OR v_run."launchToken" <> p_token THEN RETURN false; END IF;
  IF p_state NOT IN ('accepted','recovering','failed') THEN RAISE EXCEPTION 'invalid workspace launch receipt'; END IF;
  SELECT attempt INTO v_attempt FROM "WorkspaceRunLaunchReceipt" WHERE "runId"=p_run_id AND "launchToken"=p_token AND state='claimed';
  IF v_attempt IS NULL THEN RETURN false; END IF;
  -- Provider acceptance is authoritative only when the fenced Modal claim
  -- wrote it atomically. The web caller may verify but never fabricate it.
  IF p_state = 'accepted' THEN
    RETURN EXISTS (
      SELECT 1 FROM "WorkspaceRunLaunchReceipt"
      WHERE "runId"=p_run_id AND "launchToken"=p_token AND state='accepted'
    );
  END IF;
  INSERT INTO "WorkspaceRunLaunchReceipt"("runId","spaceId","launchToken",attempt,state,reason) VALUES (p_run_id,p_space_id,p_token,v_attempt,p_state,left(COALESCE(p_reason,''),500)) ON CONFLICT ("runId","launchToken",state) DO NOTHING;
  RETURN true;
END $$;

-- Modal may spawn only after this transaction commits. Provider acceptance and
-- its immutable receipt therefore share one fenced write.
CREATE OR REPLACE FUNCTION accept_workspace_launch(p_run_id text, p_space_id text, p_token text)
RETURNS boolean LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_attempt integer;
BEGIN
  UPDATE "WorkspaceRun"
  SET "modalAcceptedAt"=now(), "updatedAt"=now()
  WHERE id=p_run_id
    AND "spaceId"=p_space_id
    AND status='launching'
    AND "launchToken"=p_token
    AND "modalAcceptedAt" IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT attempt INTO v_attempt
  FROM "WorkspaceRunLaunchReceipt"
  WHERE "runId"=p_run_id AND "launchToken"=p_token AND state='claimed';
  IF v_attempt IS NULL THEN RAISE EXCEPTION 'workspace launch claim receipt missing'; END IF;
  INSERT INTO "WorkspaceRunLaunchReceipt"("runId","spaceId","launchToken",attempt,state)
  VALUES (p_run_id,p_space_id,p_token,v_attempt,'accepted')
  ON CONFLICT ("runId","launchToken",state) DO NOTHING;
  RETURN true;
END $$;

-- The scheduler and a user reload may both ask for repair. They only enqueue
-- the existing idempotent WorkSession phases; claim_workspace_launch remains
-- the authority that prevents two Modal workers from starting.
DROP FUNCTION IF EXISTS list_workspace_run_recovery_candidates(integer);
CREATE OR REPLACE FUNCTION list_workspace_run_recovery_candidates(
  p_limit integer DEFAULT 25,
  p_space_ids text[] DEFAULT ARRAY[]::text[]
)
RETURNS TABLE(
  "runId" text,
  "workSessionId" text,
  "spaceId" text,
  "sessionStatus" text,
  "runStatus" text,
  "launchToken" text,
  action text,
  "recoveryKey" text,
  "staleForSeconds" integer
) LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT
    wr.id,
    wr."workSessionId",
    wr."spaceId",
    ws.status,
    wr.status,
    wr."launchToken",
    CASE
      WHEN wr.status='launching' AND wr."modalAcceptedAt" IS NOT NULL
        THEN 'fail_accepted_silent'
      WHEN ws.status='planning' THEN 'plan'
      ELSE 'execute'
    END,
    concat_ws(
      ':',
      wr.status,
      COALESCE(wr."launchToken", 'unclaimed'),
      floor(extract(epoch FROM wr."updatedAt"))::bigint::text
    ),
    GREATEST(0, floor(extract(epoch FROM now() - wr."updatedAt")))::integer
  FROM "WorkspaceRun" wr
  JOIN "WorkSession" ws
    ON ws.id = wr."workSessionId"
   AND ws."spaceId" = wr."spaceId"
  WHERE
    wr."spaceId" = ANY(COALESCE(p_space_ids, ARRAY[]::text[]))
    AND wr."cancellationRequestedAt" IS NULL
    AND (
      (
        ws.status = 'planning'
        AND wr.status = 'queued'
        AND wr."updatedAt" < now() - interval '5 minutes'
      )
      OR (
        ws.status = 'running'
        AND wr.status = 'queued'
        AND wr."updatedAt" < now() - interval '30 seconds'
      )
      OR (
        ws.status = 'running'
        AND wr.status = 'launching'
        AND wr."launchLeaseExpiresAt" < now()
        AND wr."modalAcceptedAt" IS NULL
      )
      OR (
        ws.status = 'running'
        AND wr.status = 'launching'
        AND wr."modalAcceptedAt" < now() - interval '4 minutes'
      )
    )
  ORDER BY wr."updatedAt" ASC, wr.id ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 25), 1), 50)
$$;

-- Once Modal accepted a launch, automatic retry would duplicate provider
-- compute. If that accepted worker never emits a first callback within the
-- bounded worker window, fail the same run truthfully and let a user choose a
-- later explicit retry.
CREATE OR REPLACE FUNCTION fail_stale_accepted_workspace_launch(
  p_run_id text,
  p_space_id text,
  p_token text
) RETURNS boolean LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_run "WorkspaceRun"%ROWTYPE; v_session "WorkSession"%ROWTYPE; v_attempt integer;
BEGIN
  SELECT ws.* INTO v_session
  FROM "WorkSession" ws
  JOIN "WorkspaceRun" wr ON wr."workSessionId"=ws.id
  WHERE wr.id=p_run_id AND wr."spaceId"=p_space_id AND ws."spaceId"=p_space_id
  FOR UPDATE OF ws;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO v_run
  FROM "WorkspaceRun"
  WHERE id=p_run_id AND "spaceId"=p_space_id
  FOR UPDATE;
  IF NOT FOUND
    OR v_run.status <> 'launching'
    OR v_run."launchToken" <> p_token
    OR v_run."modalAcceptedAt" IS NULL
    OR v_run."modalAcceptedAt" >= now() - interval '4 minutes'
    OR v_run."cancellationRequestedAt" IS NOT NULL
  THEN RETURN false; END IF;
  SELECT attempt INTO v_attempt
  FROM "WorkspaceRunLaunchReceipt"
  WHERE "runId"=p_run_id AND "launchToken"=p_token AND state='claimed';
  IF v_attempt IS NULL THEN RAISE EXCEPTION 'workspace launch claim receipt missing'; END IF;
  INSERT INTO "WorkspaceRunLaunchReceipt"("runId","spaceId","launchToken",attempt,state,reason)
  VALUES (p_run_id,p_space_id,p_token,v_attempt,'failed','accepted runtime did not start')
  ON CONFLICT ("runId","launchToken",state) DO NOTHING;
  UPDATE "WorkspaceRun"
  SET status='failed', error='Workspace runtime accepted the launch but did not start.',
      "updatedAt"=now()
  WHERE id=p_run_id;
  UPDATE "WorkSession"
  SET status='failed', error='Workspace runtime accepted the launch but did not start.',
      plan=COALESCE((
        SELECT jsonb_agg(jsonb_set(step,'{status}',to_jsonb('skipped'::text)))
        FROM jsonb_array_elements(COALESCE(v_session.plan,'[]'::jsonb)) step
      ),'[]'::jsonb),
      "updatedAt"=now()
  WHERE id=v_run."workSessionId" AND "spaceId"=p_space_id;
  RETURN true;
END $$;

-- Launch authority is server-to-server. RLS alone does not protect functions,
-- so remove the default PUBLIC execute grant and restore it only to the
-- service role when that Supabase role exists.
REVOKE ALL ON TABLE "WorkspaceRunLaunchReceipt" FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION claim_workspace_launch(text,text,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION accept_workspace_launch(text,text,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION record_workspace_launch_receipt(text,text,text,text,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION list_workspace_run_recovery_candidates(integer,text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fail_stale_accepted_workspace_launch(text,text,text) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "WorkspaceRunLaunchReceipt" FROM anon;
    REVOKE EXECUTE ON FUNCTION claim_workspace_launch(text,text,text) FROM anon;
    REVOKE EXECUTE ON FUNCTION accept_workspace_launch(text,text,text) FROM anon;
    REVOKE EXECUTE ON FUNCTION record_workspace_launch_receipt(text,text,text,text,text) FROM anon;
    REVOKE EXECUTE ON FUNCTION list_workspace_run_recovery_candidates(integer,text[]) FROM anon;
    REVOKE EXECUTE ON FUNCTION fail_stale_accepted_workspace_launch(text,text,text) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "WorkspaceRunLaunchReceipt" FROM authenticated;
    REVOKE EXECUTE ON FUNCTION claim_workspace_launch(text,text,text) FROM authenticated;
    REVOKE EXECUTE ON FUNCTION accept_workspace_launch(text,text,text) FROM authenticated;
    REVOKE EXECUTE ON FUNCTION record_workspace_launch_receipt(text,text,text,text,text) FROM authenticated;
    REVOKE EXECUTE ON FUNCTION list_workspace_run_recovery_candidates(integer,text[]) FROM authenticated;
    REVOKE EXECUTE ON FUNCTION fail_stale_accepted_workspace_launch(text,text,text) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT ON TABLE "WorkspaceRunLaunchReceipt" TO service_role;
    GRANT EXECUTE ON FUNCTION claim_workspace_launch(text,text,text) TO service_role;
    GRANT EXECUTE ON FUNCTION accept_workspace_launch(text,text,text) TO service_role;
    GRANT EXECUTE ON FUNCTION record_workspace_launch_receipt(text,text,text,text,text) TO service_role;
    GRANT EXECUTE ON FUNCTION list_workspace_run_recovery_candidates(integer,text[]) TO service_role;
    GRANT EXECUTE ON FUNCTION fail_stale_accepted_workspace_launch(text,text,text) TO service_role;
  END IF;
END $$;
