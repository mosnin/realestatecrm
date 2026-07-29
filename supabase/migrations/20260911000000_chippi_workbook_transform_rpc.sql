-- A transform is a compare-and-swap over an immutable workbook version.
-- The agent may have spent time awaiting human approval, so the read-time
-- hash check is intentionally repeated inside the same row lock that appends
-- the result. A stale approval can never advance currentVersionId.
CREATE OR REPLACE FUNCTION public.append_transformed_workbook_artifact_version(
  p_artifact_id text,
  p_space_id text,
  p_source_version_id text,
  p_source_version_number int,
  p_expected_content_hash text,
  p_content text,
  p_content_hash text,
  p_metadata jsonb
) RETURNS TABLE(version_id text, version_number int, created_at timestamptz)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_num int; v_id text; v_created timestamptz; v_current text; v_hash text;
BEGIN
  SELECT "currentVersionId" INTO v_current
  FROM public."Artifact"
  WHERE id = p_artifact_id AND "spaceId" = p_space_id AND "artifactType" = 'workbook'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'workbook artifact not found'; END IF;
  IF v_current IS DISTINCT FROM p_source_version_id THEN RAISE EXCEPTION 'workbook version is stale'; END IF;

  SELECT "contentHash" INTO v_hash
  FROM public."ArtifactVersion"
  WHERE id = p_source_version_id
    AND "artifactId" = p_artifact_id
    AND "spaceId" = p_space_id
    AND "versionNumber" = p_source_version_number;
  IF NOT FOUND OR v_hash IS DISTINCT FROM p_expected_content_hash THEN RAISE EXCEPTION 'workbook content is stale'; END IF;

  SELECT COALESCE(MAX("versionNumber"), 0) + 1 INTO v_num
  FROM public."ArtifactVersion"
  WHERE "artifactId" = p_artifact_id AND "spaceId" = p_space_id;
  INSERT INTO public."ArtifactVersion" ("artifactId", "spaceId", "versionNumber", content, "contentHash", metadata, "createdByAgent")
  -- This marker is deliberately unique to this RPC. The read API only
  -- surfaces transform receipts from versions carrying this provenance.
  VALUES (p_artifact_id, p_space_id, v_num, p_content, p_content_hash, p_metadata, 'chippi_transform')
  RETURNING id, "createdAt" INTO v_id, v_created;
  UPDATE public."Artifact" SET "currentVersionId" = v_id, "updatedAt" = now()
  WHERE id = p_artifact_id AND "spaceId" = p_space_id;
  RETURN QUERY SELECT v_id, v_num, v_created;
END; $$;

REVOKE ALL ON FUNCTION public.append_transformed_workbook_artifact_version(text,text,text,int,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_transformed_workbook_artifact_version(text,text,text,int,text,text,text,jsonb) TO service_role;
