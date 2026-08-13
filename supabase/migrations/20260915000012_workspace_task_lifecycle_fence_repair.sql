-- Additive upgrade repair for WorkspaceRunTask lifecycle fencing.
--
-- Earlier development versions of the follow-up migrations exposed an
-- eight-argument finish_workspace_run_task overload with no launch token.
-- PostgreSQL keeps overloads when a later CREATE OR REPLACE adds an argument,
-- so an already-migrated database could retain that bypass even though a clean
-- install only sees the token-fenced signature. Recreate every task lifecycle
-- authority here and explicitly retire the obsolete overload.

DO $$
DECLARE
  v_obsolete regprocedure;
BEGIN
  v_obsolete := to_regprocedure(
    'public.finish_workspace_run_task(text,text,text,text,integer,text,text,jsonb)'
  );
  IF v_obsolete IS NOT NULL THEN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_obsolete);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_obsolete);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', v_obsolete);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM service_role', v_obsolete);
    END IF;
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.finish_workspace_run_task(
  text, text, text, text, integer, text, text, jsonb
);

CREATE OR REPLACE FUNCTION public.claim_workspace_run_task_launch(
  p_task_id text,
  p_space_id text,
  p_token text
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE "WorkspaceRunTask" t
  SET status = 'launching',
      "launchToken" = p_token,
      "launchLeaseExpiresAt" = now() + interval '2 minutes',
      "modalAcceptedAt" = NULL,
      "updatedAt" = now()
  FROM "WorkspaceRun" r
  WHERE t.id = p_task_id
    AND t."spaceId" = p_space_id
    AND t."runId" = r.id
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

CREATE OR REPLACE FUNCTION public.record_workspace_run_task_event(
  p_task_id text,
  p_space_id text,
  p_launch_token text,
  p_sequence integer,
  p_type text,
  p_message text,
  p_command text DEFAULT NULL,
  p_output text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_task "WorkspaceRunTask"%ROWTYPE;
BEGIN
  SELECT * INTO v_task
  FROM "WorkspaceRunTask"
  WHERE id = p_task_id AND "spaceId" = p_space_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF v_task."launchToken" IS DISTINCT FROM p_launch_token
    OR v_task."modalAcceptedAt" IS NULL
  THEN
    RETURN 'stale_launch';
  END IF;
  IF v_task.status IN ('completed', 'failed', 'cancelled') THEN
    RETURN 'terminal';
  END IF;
  IF p_sequence < 1
    OR p_type NOT IN ('workspace_started', 'command_started', 'command_finished', 'file_created')
  THEN
    RAISE EXCEPTION 'invalid workspace task event';
  END IF;
  IF (p_type = 'workspace_started' AND v_task.status NOT IN ('launching', 'running'))
    OR (p_type <> 'workspace_started' AND v_task.status <> 'running')
  THEN
    RETURN 'inactive_launch';
  END IF;

  INSERT INTO "WorkspaceRunTaskEvent"("taskId", sequence, type, message, command, output)
  VALUES (
    p_task_id,
    p_sequence,
    p_type,
    left(COALESCE(p_message, ''), 500),
    CASE WHEN p_command IS NULL THEN NULL ELSE left(p_command, 240) END,
    CASE WHEN p_output IS NULL THEN NULL ELSE left(p_output, 6000) END
  )
  ON CONFLICT ("taskId", sequence) DO NOTHING;
  IF NOT FOUND THEN RETURN 'duplicate_event'; END IF;

  IF p_type = 'workspace_started' AND v_task.status = 'launching' THEN
    UPDATE "WorkspaceRunTask"
    SET status = 'running', "updatedAt" = now()
    WHERE id = p_task_id;
  END IF;
  RETURN 'recorded';
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_workspace_run_task(
  p_task_id text,
  p_space_id text,
  p_launch_token text,
  p_outcome text,
  p_error text DEFAULT NULL,
  p_sequence integer DEFAULT NULL,
  p_message text DEFAULT NULL,
  p_output text DEFAULT NULL,
  p_files jsonb DEFAULT '[]'::jsonb
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_task "WorkspaceRunTask"%ROWTYPE;
  v_owner_clerk_id text;
  v_file_count integer;
  v_typed boolean;
  v_expected_count integer;
BEGIN
  SELECT * INTO v_task
  FROM "WorkspaceRunTask"
  WHERE id = p_task_id AND "spaceId" = p_space_id
  FOR UPDATE;

  IF NOT FOUND
    OR NULLIF(btrim(p_launch_token), '') IS NULL
    OR v_task."launchToken" IS DISTINCT FROM p_launch_token
    OR v_task.status IN ('completed', 'failed', 'cancelled')
  THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "WorkspaceRun"
    WHERE id = v_task."runId" AND "spaceId" = p_space_id AND status = 'completed'
  ) THEN
    RETURN false;
  END IF;
  IF v_task."cancellationRequestedAt" IS NOT NULL OR p_outcome = 'cancelled' THEN
    p_outcome := 'cancelled';
  END IF;
  IF p_outcome NOT IN ('completed', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'invalid workspace task terminal outcome';
  END IF;

  IF p_outcome = 'completed' THEN
    v_typed := COALESCE(jsonb_typeof(v_task."executionPlan"->'operations') = 'array', false);
    v_expected_count := CASE
      WHEN v_typed THEN jsonb_array_length(v_task."executionPlan"->'operations')
      ELSE 1
    END;
    IF jsonb_typeof(p_files) <> 'array'
      OR jsonb_array_length(p_files) <> v_expected_count
      OR (v_typed AND v_expected_count NOT BETWEEN 2 AND 3)
    THEN
      RAISE EXCEPTION 'workspace task manifest incomplete';
    END IF;

    IF v_typed THEN
      IF EXISTS (
        WITH expected AS (
          SELECT
            CASE op->>'type'
              WHEN 'grounded_markdown_report' THEN 'workspace-report-' || v_task.sequence || '.md'
              WHEN 'comps_csv_projection' THEN 'workspace-comps-' || v_task.sequence || '.csv'
              WHEN 'json_action_register' THEN 'workspace-actions-' || v_task.sequence || '.json'
            END AS name,
            CASE op->>'type'
              WHEN 'grounded_markdown_report' THEN 'text/markdown'
              WHEN 'comps_csv_projection' THEN 'text/csv'
              WHEN 'json_action_register' THEN 'application/json'
            END AS "mimeType"
          FROM jsonb_array_elements(v_task."executionPlan"->'operations') op
        ), supplied AS (
          SELECT f.name, f."mimeType", f."sizeBytes"
          FROM jsonb_to_recordset(p_files)
            AS f(id text, "storageKey" text, name text, "mimeType" text, "sizeBytes" integer)
        )
        SELECT 1
        FROM expected
        FULL OUTER JOIN supplied USING (name, "mimeType")
        WHERE expected.name IS NULL
          OR supplied.name IS NULL
          OR supplied."sizeBytes" NOT BETWEEN 1 AND 32000
      ) THEN
        RAISE EXCEPTION 'workspace task manifest invalid';
      END IF;
    ELSIF NOT EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(p_files)
        AS f(name text, "mimeType" text, "sizeBytes" integer)
      WHERE f.name = ('workspace-follow-up-' || v_task.sequence || '.md')
        AND f."mimeType" = 'text/markdown'
        AND f."sizeBytes" BETWEEN 1 AND 32000
    ) THEN
      RAISE EXCEPTION 'workspace task manifest invalid';
    END IF;

    SELECT u."clerkId" INTO v_owner_clerk_id
    FROM "Space" s
    JOIN "User" u ON u.id = s."ownerId"
    WHERE s.id = p_space_id;
    IF v_owner_clerk_id IS NULL THEN
      RAISE EXCEPTION 'workspace owner missing';
    END IF;

    INSERT INTO "File"(
      id, "spaceId", "userId", "storageKey", name, "mimeType",
      category, "sizeBytes", "isPublic"
    )
    SELECT
      f.id, p_space_id, v_owner_clerk_id, f."storageKey", f.name,
      f."mimeType", 'document', f."sizeBytes", false
    FROM jsonb_to_recordset(p_files)
      AS f(id text, "storageKey" text, name text, "mimeType" text, "sizeBytes" integer)
    ON CONFLICT (id) DO UPDATE
    SET "storageKey" = EXCLUDED."storageKey",
        name = EXCLUDED.name,
        "mimeType" = EXCLUDED."mimeType",
        "sizeBytes" = EXCLUDED."sizeBytes",
        "isPublic" = false
    WHERE "File"."spaceId" = p_space_id;

    INSERT INTO "WorkspaceRunTaskFile"(
      "taskId", "spaceId", "fileId", name, "mimeType", "sizeBytes"
    )
    SELECT p_task_id, p_space_id, f.id, f.name, f."mimeType", f."sizeBytes"
    FROM jsonb_to_recordset(p_files)
      AS f(id text, "storageKey" text, name text, "mimeType" text, "sizeBytes" integer)
    ON CONFLICT ("taskId", name) DO UPDATE
    SET "fileId" = EXCLUDED."fileId",
        "mimeType" = EXCLUDED."mimeType",
        "sizeBytes" = EXCLUDED."sizeBytes";

    SELECT count(*) INTO v_file_count
    FROM "WorkspaceRunTaskFile"
    WHERE "taskId" = p_task_id;
    IF v_file_count <> v_expected_count THEN
      RAISE EXCEPTION 'workspace task manifest incomplete';
    END IF;
  END IF;

  UPDATE "WorkspaceRunTask"
  SET status = p_outcome,
      output = CASE WHEN p_outcome = 'completed' THEN left(COALESCE(p_output, ''), 6000) ELSE NULL END,
      error = CASE WHEN p_outcome = 'failed' THEN left(COALESCE(p_error, ''), 1000) ELSE NULL END,
      "updatedAt" = now()
  WHERE id = p_task_id;

  IF p_sequence IS NOT NULL THEN
    INSERT INTO "WorkspaceRunTaskEvent"("taskId", sequence, type, message, output)
    VALUES (
      p_task_id,
      p_sequence,
      p_outcome,
      COALESCE(p_message, p_error, p_outcome),
      CASE WHEN p_outcome = 'completed' THEN left(COALESCE(p_output, ''), 6000) ELSE NULL END
    );
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_workspace_run_task_launch(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_workspace_run_task_event(text, text, text, integer, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_workspace_run_task(text, text, text, text, text, integer, text, text, jsonb) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.claim_workspace_run_task_launch(text, text, text) FROM anon;
    REVOKE ALL ON FUNCTION public.record_workspace_run_task_event(text, text, text, integer, text, text, text, text) FROM anon;
    REVOKE ALL ON FUNCTION public.finish_workspace_run_task(text, text, text, text, text, integer, text, text, jsonb) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.claim_workspace_run_task_launch(text, text, text) FROM authenticated;
    REVOKE ALL ON FUNCTION public.record_workspace_run_task_event(text, text, text, integer, text, text, text, text) FROM authenticated;
    REVOKE ALL ON FUNCTION public.finish_workspace_run_task(text, text, text, text, text, integer, text, text, jsonb) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.claim_workspace_run_task_launch(text, text, text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.record_workspace_run_task_event(text, text, text, integer, text, text, text, text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.finish_workspace_run_task(text, text, text, text, text, integer, text, text, jsonb) TO service_role;
  END IF;
END;
$$;
