-- Feature-off bridge from a completed managed-workspace CSV to the existing
-- versioned Workbench. The mapping preserves the immutable workspace source
-- separately from chat Attachment provenance and makes repeated opens return
-- the same artifact.
CREATE TABLE IF NOT EXISTS public."WorkspaceWorkbookSource" (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId" text NOT NULL REFERENCES public."Space"(id) ON DELETE CASCADE,
  "runId" text NOT NULL REFERENCES public."WorkspaceRun"(id) ON DELETE CASCADE,
  "workspaceRunFileId" text REFERENCES public."WorkspaceRunFile"(id) ON DELETE CASCADE,
  "workspaceRunTaskFileId" text REFERENCES public."WorkspaceRunTaskFile"(id) ON DELETE CASCADE,
  "sourceFileId" text NOT NULL REFERENCES public."File"(id) ON DELETE CASCADE,
  "artifactId" text NOT NULL UNIQUE REFERENCES public."Artifact"(id) ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_workbook_source_exact_membership_check CHECK (
    ("workspaceRunFileId" IS NOT NULL AND "workspaceRunTaskFileId" IS NULL)
    OR ("workspaceRunFileId" IS NULL AND "workspaceRunTaskFileId" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS workspace_workbook_source_root_key
  ON public."WorkspaceWorkbookSource" ("spaceId", "workspaceRunFileId")
  WHERE "workspaceRunFileId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS workspace_workbook_source_task_key
  ON public."WorkspaceWorkbookSource" ("spaceId", "workspaceRunTaskFileId")
  WHERE "workspaceRunTaskFileId" IS NOT NULL;
ALTER TABLE public."WorkspaceWorkbookSource" ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.create_workspace_workbook_artifact(
  p_space_id text,
  p_run_id text,
  p_workspace_run_file_id text,
  p_workspace_run_task_file_id text,
  p_content text,
  p_content_hash text,
  p_metadata jsonb
) RETURNS TABLE(artifact_id text, version_id text, version_number int, created boolean)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_file_id text;
  v_name text;
  v_artifact_id text;
  v_version_id text;
  v_version_number int;
BEGIN
  IF (p_workspace_run_file_id IS NULL) = (p_workspace_run_task_file_id IS NULL) THEN
    RAISE EXCEPTION 'exactly one workspace file membership is required';
  END IF;

  -- There may be no mapping row to lock yet. This transaction-scoped lock
  -- serializes only repeated opens of this exact tenant/source membership.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_space_id || ':' || COALESCE(p_workspace_run_file_id, p_workspace_run_task_file_id),
    0
  ));

  IF p_workspace_run_file_id IS NOT NULL THEN
    SELECT wrf."fileId", wrf.name
      INTO v_file_id, v_name
    FROM public."WorkspaceRunFile" wrf
    JOIN public."WorkspaceRun" wr
      ON wr.id = wrf."runId"
      AND wr."spaceId" = wrf."spaceId"
      AND wr.status = 'completed'
    JOIN public."File" f
      ON f.id = wrf."fileId"
      AND f."spaceId" = wrf."spaceId"
      AND f.name = wrf.name
      AND f."mimeType" = wrf."mimeType"
      AND f."sizeBytes" = wrf."sizeBytes"
    WHERE wrf.id = p_workspace_run_file_id
      AND wrf."runId" = p_run_id
      AND wrf."spaceId" = p_space_id
      AND wrf."mimeType" = 'text/csv'
      AND lower(wrf.name) LIKE '%.csv';
  ELSE
    SELECT wrtf."fileId", wrtf.name
      INTO v_file_id, v_name
    FROM public."WorkspaceRunTaskFile" wrtf
    JOIN public."WorkspaceRunTask" wrt
      ON wrt.id = wrtf."taskId"
      AND wrt."spaceId" = wrtf."spaceId"
      AND wrt.status = 'completed'
    JOIN public."WorkspaceRun" wr
      ON wr.id = wrt."runId"
      AND wr."spaceId" = wrt."spaceId"
      AND wr.status = 'completed'
    JOIN public."File" f
      ON f.id = wrtf."fileId"
      AND f."spaceId" = wrtf."spaceId"
      AND f.name = wrtf.name
      AND f."mimeType" = wrtf."mimeType"
      AND f."sizeBytes" = wrtf."sizeBytes"
    WHERE wrtf.id = p_workspace_run_task_file_id
      AND wrt."runId" = p_run_id
      AND wrtf."spaceId" = p_space_id
      AND wrtf."mimeType" = 'text/csv'
      AND lower(wrtf.name) LIKE '%.csv';
  END IF;
  IF v_file_id IS NULL THEN RAISE EXCEPTION 'completed workspace CSV source not found'; END IF;

  SELECT wws."artifactId", a."currentVersionId", av."versionNumber"
    INTO v_artifact_id, v_version_id, v_version_number
  FROM public."WorkspaceWorkbookSource" wws
  JOIN public."Artifact" a
    ON a.id = wws."artifactId"
    AND a."spaceId" = p_space_id
    AND a."artifactType" = 'workbook'
  JOIN public."ArtifactVersion" av
    ON av.id = a."currentVersionId"
    AND av."artifactId" = a.id
    AND av."spaceId" = p_space_id
  WHERE wws."spaceId" = p_space_id
    AND (
      (p_workspace_run_file_id IS NOT NULL AND wws."workspaceRunFileId" = p_workspace_run_file_id)
      OR (p_workspace_run_task_file_id IS NOT NULL AND wws."workspaceRunTaskFileId" = p_workspace_run_task_file_id)
    );
  IF v_artifact_id IS NOT NULL THEN
    RETURN QUERY SELECT v_artifact_id, v_version_id, v_version_number, false;
    RETURN;
  END IF;

  INSERT INTO public."Artifact" ("spaceId", "artifactType", title, "contentType")
  VALUES (p_space_id, 'workbook', v_name, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  RETURNING id INTO v_artifact_id;
  INSERT INTO public."ArtifactVersion" (
    "artifactId", "spaceId", "versionNumber", content, "contentHash", metadata, "createdByAgent"
  ) VALUES (
    v_artifact_id, p_space_id, 1, p_content, p_content_hash, COALESCE(p_metadata, '{}'::jsonb), 'chippi'
  ) RETURNING id INTO v_version_id;
  UPDATE public."Artifact"
    SET "currentVersionId" = v_version_id
    WHERE id = v_artifact_id AND "spaceId" = p_space_id;
  INSERT INTO public."WorkspaceWorkbookSource" (
    "spaceId", "runId", "workspaceRunFileId", "workspaceRunTaskFileId", "sourceFileId", "artifactId"
  ) VALUES (
    p_space_id, p_run_id, p_workspace_run_file_id, p_workspace_run_task_file_id, v_file_id, v_artifact_id
  );
  RETURN QUERY SELECT v_artifact_id, v_version_id, 1, true;
END; $$;

REVOKE ALL ON FUNCTION public.create_workspace_workbook_artifact(text,text,text,text,text,text,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_workspace_workbook_artifact(text,text,text,text,text,text,jsonb)
  TO service_role;
