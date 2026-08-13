-- Fence every parent WorkspaceRun callback mutation to the launch token that
-- won the durable launch claim. This replaces the original terminal RPC,
-- whose signature did not carry a token, and makes the first event plus the
-- launching -> running transition one transaction.

REVOKE EXECUTE ON FUNCTION finish_workspace_run_and_session(text,text,text,text,integer,text,jsonb) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE EXECUTE ON FUNCTION finish_workspace_run_and_session(text,text,text,text,integer,text,jsonb) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE EXECUTE ON FUNCTION finish_workspace_run_and_session(text,text,text,text,integer,text,jsonb) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE EXECUTE ON FUNCTION finish_workspace_run_and_session(text,text,text,text,integer,text,jsonb) FROM service_role;
  END IF;
END $$;
DROP FUNCTION finish_workspace_run_and_session(text,text,text,text,integer,text,jsonb);

CREATE OR REPLACE FUNCTION record_workspace_run_event(
  p_run_id text,
  p_space_id text,
  p_launch_token text,
  p_sequence integer,
  p_type text,
  p_message text,
  p_command text DEFAULT NULL,
  p_output text DEFAULT NULL
) RETURNS text LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_run "WorkspaceRun"%ROWTYPE;
  v_inserted_rows bigint := 0;
BEGIN
  SELECT * INTO v_run
  FROM "WorkspaceRun"
  WHERE id=p_run_id AND "spaceId"=p_space_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF v_run."launchToken" IS DISTINCT FROM p_launch_token THEN RETURN 'stale_launch'; END IF;
  IF v_run.status IN ('completed','failed','cancelled') OR v_run."cancellationRequestedAt" IS NOT NULL THEN RETURN 'terminal'; END IF;
  IF p_sequence < 1 OR p_type NOT IN ('workspace_started','command_started','command_finished','file_created') THEN
    RAISE EXCEPTION 'invalid workspace event';
  END IF;

  IF p_type='workspace_started' THEN
    IF v_run.status NOT IN ('launching','running') THEN RETURN 'inactive'; END IF;
    INSERT INTO "WorkspaceRunEvent"("runId",sequence,type,message,command,output)
    VALUES (p_run_id,p_sequence,p_type,p_message,p_command,p_output)
    ON CONFLICT ("runId",sequence) DO NOTHING;
    GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

    -- Also repairs an event committed by the old two-statement callback when
    -- its launching -> running update was lost before this migration.
    UPDATE "WorkspaceRun"
    SET status='running', "updatedAt"=now()
    WHERE id=p_run_id
      AND "spaceId"=p_space_id
      AND "launchToken"=p_launch_token
      AND status='launching';
    RETURN CASE WHEN v_inserted_rows > 0 THEN 'recorded' ELSE 'duplicate_event' END;
  END IF;

  IF v_run.status <> 'running' THEN RETURN 'inactive'; END IF;
  INSERT INTO "WorkspaceRunEvent"("runId",sequence,type,message,command,output)
  VALUES (p_run_id,p_sequence,p_type,p_message,p_command,p_output)
  ON CONFLICT ("runId",sequence) DO NOTHING;
  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;
  RETURN CASE WHEN v_inserted_rows > 0 THEN 'recorded' ELSE 'duplicate_event' END;
END $$;

CREATE OR REPLACE FUNCTION finish_workspace_run_and_session(
  p_run_id text,
  p_space_id text,
  p_launch_token text,
  p_outcome text,
  p_error text DEFAULT NULL,
  p_sequence integer DEFAULT NULL,
  p_message text DEFAULT NULL,
  p_files jsonb DEFAULT '[]'::jsonb
) RETURNS boolean LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_run "WorkspaceRun"%ROWTYPE;
  v_session "WorkSession"%ROWTYPE;
  v_manifest_count integer;
  v_owner_clerk_id text;
BEGIN
  -- Keep the same lock order as cancellation: session first, then run.
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
    OR v_run."launchToken" IS DISTINCT FROM p_launch_token
    OR v_run.status IN ('completed','failed','cancelled')
  THEN RETURN false; END IF;

  IF v_run."cancellationRequestedAt" IS NOT NULL OR p_outcome='cancelled' THEN
    p_outcome := 'cancelled';
  END IF;
  IF p_outcome NOT IN ('completed','failed','cancelled') THEN
    RAISE EXCEPTION 'invalid workspace terminal outcome';
  END IF;

  IF p_outcome='completed' THEN
    IF v_run.status <> 'running' THEN RETURN false; END IF;
    IF jsonb_typeof(p_files) <> 'array' OR jsonb_array_length(p_files) <> 4 THEN
      RAISE EXCEPTION 'workspace manifest incomplete';
    END IF;
    SELECT u."clerkId" INTO v_owner_clerk_id
    FROM "Space" s JOIN "User" u ON u.id=s."ownerId"
    WHERE s.id=p_space_id;
    IF v_owner_clerk_id IS NULL THEN RAISE EXCEPTION 'workspace owner missing'; END IF;

    INSERT INTO "File"(id,"spaceId","userId","storageKey",name,"mimeType",category,"sizeBytes","isPublic")
      SELECT f.id,p_space_id,v_owner_clerk_id,f."storageKey",f.name,f."mimeType",'document',f."sizeBytes",false
      FROM jsonb_to_recordset(p_files) AS f(id text,"storageKey" text,name text,"mimeType" text,"sizeBytes" integer)
      ON CONFLICT (id) DO UPDATE
      SET "storageKey"=EXCLUDED."storageKey",name=EXCLUDED.name,"mimeType"=EXCLUDED."mimeType","sizeBytes"=EXCLUDED."sizeBytes","isPublic"=false
      WHERE "File"."spaceId"=p_space_id;
    INSERT INTO "WorkspaceRunFile"("runId","spaceId","fileId",name,"mimeType","sizeBytes")
      SELECT p_run_id,p_space_id,f.id,f.name,f."mimeType",f."sizeBytes"
      FROM jsonb_to_recordset(p_files) AS f(id text,"storageKey" text,name text,"mimeType" text,"sizeBytes" integer)
      ON CONFLICT ("runId",name) DO UPDATE
      SET "fileId"=EXCLUDED."fileId","mimeType"=EXCLUDED."mimeType","sizeBytes"=EXCLUDED."sizeBytes";
    SELECT count(DISTINCT wrf.name) INTO v_manifest_count
    FROM "WorkspaceRunFile" wrf
    JOIN "File" f ON f.id=wrf."fileId" AND f."spaceId"=p_space_id
    WHERE wrf."runId"=p_run_id
      AND wrf.name IN ('brief.md','launch-checklist.md','comps.csv','handoff.md');
    IF v_manifest_count <> 4 THEN RAISE EXCEPTION 'workspace manifest incomplete'; END IF;
  END IF;

  UPDATE "WorkspaceRun"
  SET status=p_outcome,
      error=CASE WHEN p_outcome='failed' THEN p_error ELSE NULL END,
      "updatedAt"=now()
  WHERE id=p_run_id AND "launchToken"=p_launch_token;
  UPDATE "WorkSession"
  SET status=p_outcome,
      plan=COALESCE((
        SELECT jsonb_agg(jsonb_set(step,'{status}',to_jsonb(CASE WHEN p_outcome='completed' THEN 'done' ELSE 'skipped' END::text)))
        FROM jsonb_array_elements(COALESCE(v_session.plan,'[]'::jsonb)) step
      ),'[]'::jsonb),
      error=CASE WHEN p_outcome='failed' THEN p_error ELSE NULL END,
      "completedAt"=CASE WHEN p_outcome='completed' THEN now() ELSE NULL END,
      "updatedAt"=now()
  WHERE id=v_run."workSessionId" AND "spaceId"=p_space_id;
  IF p_sequence IS NOT NULL THEN
    INSERT INTO "WorkspaceRunEvent"("runId",sequence,type,message)
    VALUES (p_run_id,p_sequence,p_outcome,COALESCE(p_message,p_error,p_outcome));
  END IF;
  RETURN true;
END $$;

REVOKE EXECUTE ON FUNCTION record_workspace_run_event(text,text,text,integer,text,text,text,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION finish_workspace_run_and_session(text,text,text,text,text,integer,text,jsonb) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE EXECUTE ON FUNCTION record_workspace_run_event(text,text,text,integer,text,text,text,text) FROM anon;
    REVOKE EXECUTE ON FUNCTION finish_workspace_run_and_session(text,text,text,text,text,integer,text,jsonb) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE EXECUTE ON FUNCTION record_workspace_run_event(text,text,text,integer,text,text,text,text) FROM authenticated;
    REVOKE EXECUTE ON FUNCTION finish_workspace_run_and_session(text,text,text,text,text,integer,text,jsonb) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION record_workspace_run_event(text,text,text,integer,text,text,text,text) TO service_role;
    GRANT EXECUTE ON FUNCTION finish_workspace_run_and_session(text,text,text,text,text,integer,text,jsonb) TO service_role;
  END IF;
END $$;
