ALTER TABLE public."TeamRecordGrant" ADD COLUMN IF NOT EXISTS "canEdit" boolean NOT NULL DEFAULT false;
ALTER TABLE public."BrokerageTeamRecordGrant" ADD COLUMN IF NOT EXISTS "canEdit" boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public."TeamRecordEdit" (
  id uuid PRIMARY KEY,
  "teamId" text NOT NULL REFERENCES public."CollaborationTeam"(id) ON DELETE CASCADE,
  "actorId" text NOT NULL REFERENCES public."User"(id),
  "grantId" uuid NOT NULL,
  source text NOT NULL CHECK (source IN ('personal','brokerage')),
  "recordKind" text NOT NULL,
  "recordId" text NOT NULL,
  "expectedUpdatedAt" timestamptz NOT NULL,
  changes jsonb NOT NULL,
  result jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public."TeamRecordEdit" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."TeamRecordEdit" FROM PUBLIC,anon,authenticated;
GRANT ALL ON public."TeamRecordEdit" TO service_role;

-- Permission rows stay locked through the record update. Revocation, member
-- removal and source transfer cannot race a successful delegated mutation.
CREATE OR REPLACE FUNCTION public.edit_team_shared_record(
  p_team_id text, p_actor_id text, p_grant_id uuid, p_source text,
  p_request_id uuid, p_expected_updated_at timestamptz, p_changes jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_team public."CollaborationTeam"%ROWTYPE;
  v_grant jsonb;
  v_user_id text;
  v_role text;
  v_owner text;
  v_brokerage text;
  v_table text;
  v_kind text;
  v_allowed text[];
  v_keys text[];
  v_columns text;
  v_record jsonb;
  v_receipt public."TeamRecordEdit"%ROWTYPE;
  v_result jsonb;
  v_updated timestamptz;
BEGIN
  IF p_source IS NULL OR p_source NOT IN ('personal','brokerage') OR p_request_id IS NULL
    OR p_expected_updated_at IS NULL OR jsonb_typeof(p_changes) IS DISTINCT FROM 'object'
    OR p_changes='{}'::jsonb THEN RAISE EXCEPTION 'Invalid edit' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_team FROM public."CollaborationTeam" WHERE id=p_team_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Team unavailable' USING ERRCODE='42501'; END IF;
  IF p_source='personal' THEN
    SELECT to_jsonb(g) INTO v_grant FROM public."TeamRecordGrant" g
      WHERE id=p_grant_id AND "teamId"=p_team_id AND "revokedAt" IS NULL AND "canEdit" FOR SHARE;
  ELSE
    SELECT to_jsonb(g) INTO v_grant FROM public."BrokerageTeamRecordGrant" g
      WHERE id=p_grant_id AND "teamId"=p_team_id AND "revokedAt" IS NULL AND "canEdit" FOR SHARE;
  END IF;
  IF v_grant IS NULL THEN RAISE EXCEPTION 'Write grant unavailable' USING ERRCODE='42501'; END IF;

  FOREACH v_user_id IN ARRAY ARRAY[p_actor_id,v_grant->>'grantedBy',v_team."ownerId"] LOOP
    PERFORM 1 FROM public."User" WHERE id=v_user_id
      AND status::text IS DISTINCT FROM 'offboarded' AND "platformRole"::text IS DISTINCT FROM 'banned' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Account unavailable' USING ERRCODE='42501'; END IF;
    IF v_user_id<>v_team."ownerId" THEN
      PERFORM 1 FROM public."CollaborationTeamMember" WHERE "teamId"=p_team_id AND "userId"=v_user_id
        AND "revokedAt" IS NULL AND role IN ('admin','member') FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Team membership unavailable' USING ERRCODE='42501'; END IF;
    END IF;
  END LOOP;
  IF v_team."parentKind"='brokerage' THEN
    PERFORM 1 FROM public."Brokerage" WHERE id=v_team."parentRouteId" AND status::text='active' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sponsor unavailable' USING ERRCODE='42501'; END IF;
    PERFORM 1 FROM public."BrokerageMembership" WHERE "brokerageId"=v_team."parentRouteId"
      AND "userId"=v_team."ownerId" AND role::text IN ('broker_owner','broker_admin') FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sponsor unavailable' USING ERRCODE='42501'; END IF;
  ELSE
    PERFORM 1 FROM public."Space" WHERE slug=v_team."parentRouteId" AND "ownerId"=v_team."ownerId" FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sponsor unavailable' USING ERRCODE='42501'; END IF;
  END IF;
  IF p_source='personal' THEN
    SELECT "ownerId" INTO v_owner FROM public."Space" WHERE id=v_grant->>'spaceId' FOR SHARE;
    IF v_owner IS DISTINCT FROM v_grant->>'grantedBy' THEN RAISE EXCEPTION 'Source owner changed' USING ERRCODE='42501'; END IF;
  ELSE
    IF v_team."parentKind"<>'brokerage' OR v_team."parentRouteId" IS DISTINCT FROM v_grant->>'brokerageId'
      THEN RAISE EXCEPTION 'Brokerage scope mismatch' USING ERRCODE='42501'; END IF;
    PERFORM 1 FROM public."BrokerageMembership" WHERE "brokerageId"=v_grant->>'brokerageId'
      AND "userId"=v_grant->>'grantedBy' AND role::text IN ('broker_owner','broker_admin') FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Brokerage management unavailable' USING ERRCODE='42501'; END IF;
  END IF;

  v_kind:=v_grant->>'recordKind';
  CASE v_kind
    WHEN 'contact' THEN v_table:='Contact';v_allowed:=ARRAY['name','email','phone','leadType'];
    WHEN 'deal' THEN v_table:='Deal';v_allowed:=ARRAY['title','value','closeDate'];
    WHEN 'property' THEN v_table:='Property';v_allowed:=ARRAY['address','city','listPrice','beds','baths'];
    ELSE RAISE EXCEPTION 'Unsupported record' USING ERRCODE='22023';
  END CASE;
  SELECT array_agg(key ORDER BY key) INTO v_keys FROM jsonb_object_keys(p_changes) key;
  IF NOT v_keys<@v_allowed THEN RAISE EXCEPTION 'Field is not delegated' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_each(p_changes) e WHERE jsonb_typeof(e.value) NOT IN ('string','number','null'))
    THEN RAISE EXCEPTION 'Invalid field value' USING ERRCODE='22023'; END IF;
  FOREACH v_user_id IN ARRAY ARRAY['name','title','address'] LOOP
    IF p_changes?v_user_id AND (NULLIF(btrim(p_changes->>v_user_id),'') IS NULL OR length(p_changes->>v_user_id)>500)
      THEN RAISE EXCEPTION 'Required text is invalid' USING ERRCODE='22023'; END IF;
  END LOOP;
  FOREACH v_user_id IN ARRAY ARRAY['value','listPrice','beds','baths'] LOOP
    IF p_changes?v_user_id AND p_changes->v_user_id<>'null'::jsonb
      AND ((p_changes->>v_user_id)::numeric<0 OR (p_changes->>v_user_id)::numeric>1000000000)
      THEN RAISE EXCEPTION 'Invalid amount' USING ERRCODE='22023'; END IF;
  END LOOP;
  IF p_changes?'leadType' AND COALESCE(p_changes->>'leadType','') NOT IN ('buyer','seller','rental')
    THEN RAISE EXCEPTION 'Invalid relationship' USING ERRCODE='22023'; END IF;
  IF length(COALESCE(p_changes->>'email',''))>254 OR length(COALESCE(p_changes->>'phone',''))>40
    OR length(COALESCE(p_changes->>'city',''))>200 THEN RAISE EXCEPTION 'Field too long' USING ERRCODE='22023'; END IF;

  EXECUTE format('SELECT to_jsonb(r) FROM public.%I r WHERE id=$1 FOR UPDATE',v_table)
    INTO v_record USING v_grant->>'recordId';
  IF v_record IS NULL THEN RAISE EXCEPTION 'Record unavailable' USING ERRCODE='42501'; END IF;
  IF p_source='personal' THEN
    IF v_record->>'spaceId' IS DISTINCT FROM v_grant->>'spaceId'
      OR (v_kind<>'deal' AND v_record->>'brokerageId' IS NOT NULL)
      THEN RAISE EXCEPTION 'Record ownership changed' USING ERRCODE='42501'; END IF;
  ELSIF v_kind='deal' THEN
    SELECT "brokerageId" INTO v_brokerage FROM public."Space" WHERE id=v_record->>'spaceId' FOR SHARE;
    IF v_brokerage IS DISTINCT FROM v_grant->>'brokerageId' THEN RAISE EXCEPTION 'Record ownership changed' USING ERRCODE='42501'; END IF;
  ELSIF v_record->>'brokerageId' IS DISTINCT FROM v_grant->>'brokerageId' THEN
    RAISE EXCEPTION 'Record ownership changed' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_receipt FROM public."TeamRecordEdit" WHERE id=p_request_id;
  IF FOUND THEN
    IF v_receipt."teamId"<>p_team_id OR v_receipt."actorId"<>p_actor_id OR v_receipt."grantId"<>p_grant_id
      OR v_receipt.source<>p_source OR v_receipt.changes<>p_changes OR v_receipt."expectedUpdatedAt"<>p_expected_updated_at
      THEN RAISE EXCEPTION 'Request identity conflict' USING ERRCODE='40001'; END IF;
    RETURN v_receipt.result;
  END IF;
  IF (v_record->>'updatedAt')::timestamptz IS DISTINCT FROM p_expected_updated_at
    THEN RAISE EXCEPTION 'Record changed; refresh before editing' USING ERRCODE='40001'; END IF;
  SELECT string_agg(format('%I',key),',') INTO v_columns FROM unnest(v_keys) key;
  v_updated:=clock_timestamp();
  EXECUTE format('UPDATE public.%I SET (%s)=(SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1)), "updatedAt"=$2 WHERE id=$3',v_table,v_columns,v_columns,v_table)
    USING p_changes,v_updated,v_grant->>'recordId';
  v_result:=jsonb_build_object('id',p_request_id,'recordKind',v_kind,'recordId',v_grant->>'recordId','spaceId',v_record->>'spaceId','updatedAt',v_updated);
  INSERT INTO public."TeamRecordEdit"(id,"teamId","actorId","grantId",source,"recordKind","recordId","expectedUpdatedAt",changes,result)
    VALUES(p_request_id,p_team_id,p_actor_id,p_grant_id,p_source,v_kind,v_grant->>'recordId',p_expected_updated_at,p_changes,v_result);
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.edit_team_shared_record(text,text,uuid,text,uuid,timestamptz,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.edit_team_shared_record(text,text,uuid,text,uuid,timestamptz,jsonb) TO service_role;
