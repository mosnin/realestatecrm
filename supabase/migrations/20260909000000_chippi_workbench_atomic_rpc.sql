-- Atomic workbook writes. SECURITY INVOKER plus execute grants limited to the
-- server service role keeps browser clients from calling these write helpers.
CREATE OR REPLACE FUNCTION public.create_workbook_artifact(
  p_space_id text, p_title text, p_content text, p_content_hash text, p_metadata jsonb
) RETURNS TABLE(artifact_id text, version_id text, version_number int)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE a_id text; v_id text;
BEGIN
  INSERT INTO public."Artifact" ("spaceId", "artifactType", title, "contentType")
  VALUES (p_space_id, 'workbook', p_title, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  RETURNING id INTO a_id;
  INSERT INTO public."ArtifactVersion" ("artifactId", "spaceId", "versionNumber", content, "contentHash", metadata, "createdByAgent")
  VALUES (a_id, p_space_id, 1, p_content, p_content_hash, COALESCE(p_metadata, '{}'::jsonb), 'chippi')
  RETURNING id INTO v_id;
  UPDATE public."Artifact" SET "currentVersionId" = v_id WHERE id = a_id AND "spaceId" = p_space_id;
  RETURN QUERY SELECT a_id, v_id, 1;
END; $$;

CREATE OR REPLACE FUNCTION public.append_workbook_artifact_version(
  p_artifact_id text, p_space_id text, p_content text, p_content_hash text, p_metadata jsonb
) RETURNS TABLE(version_id text, version_number int, created_at timestamptz)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_num int; v_id text; v_created timestamptz;
BEGIN
  PERFORM 1 FROM public."Artifact" WHERE id = p_artifact_id AND "spaceId" = p_space_id AND "artifactType" = 'workbook' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'workbook artifact not found'; END IF;
  SELECT COALESCE(MAX("versionNumber"), 0) + 1 INTO v_num FROM public."ArtifactVersion" WHERE "artifactId" = p_artifact_id AND "spaceId" = p_space_id;
  INSERT INTO public."ArtifactVersion" ("artifactId", "spaceId", "versionNumber", content, "contentHash", metadata, "createdByAgent")
  VALUES (p_artifact_id, p_space_id, v_num, p_content, p_content_hash, COALESCE(p_metadata, '{}'::jsonb), 'user') RETURNING id, "createdAt" INTO v_id, v_created;
  UPDATE public."Artifact" SET "currentVersionId" = v_id, "updatedAt" = now() WHERE id = p_artifact_id AND "spaceId" = p_space_id;
  RETURN QUERY SELECT v_id, v_num, v_created;
END; $$;

REVOKE ALL ON FUNCTION public.create_workbook_artifact(text,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.append_workbook_artifact_version(text,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_workbook_artifact(text,text,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.append_workbook_artifact_version(text,text,text,text,jsonb) TO service_role;
