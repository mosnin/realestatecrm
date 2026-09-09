#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
pg_bin="$(dirname "$(command -v postgres)")"
pg_tmp="$(mktemp -d "/tmp/chippi-team-edits.XXXXXX")"
pg_data="${pg_tmp}/data"
pg_socket="${pg_tmp}/socket"
pg_port="$((59000 + RANDOM % 1000))"

cleanup() {
  "${pg_bin}/pg_ctl" -D "${pg_data}" -m immediate stop >/dev/null 2>&1 || true
  if [[ "${pg_tmp}" == *"/chippi-team-edits."* ]]; then
    /bin/rm -rf "${pg_tmp}"
  fi
}
trap cleanup EXIT

mkdir -p "${pg_socket}"
"${pg_bin}/initdb" -D "${pg_data}" -A trust -U postgres >/dev/null
"${pg_bin}/pg_ctl" -D "${pg_data}" \
  -o "-k '${pg_socket}' -p ${pg_port} -c listen_addresses=''" \
  -w start >/dev/null

psql_cmd=("${pg_bin}/psql" -X -qAt -v ON_ERROR_STOP=1 -h "${pg_socket}" -p "${pg_port}" -U postgres -d postgres)



"${psql_cmd[@]}" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE TABLE public."User"(id text PRIMARY KEY,status text DEFAULT 'active',"platformRole" text DEFAULT 'user');
CREATE TABLE public."Brokerage"(id text PRIMARY KEY,status text DEFAULT 'active');
CREATE TABLE public."Space"(id text PRIMARY KEY,slug text,"ownerId" text,"brokerageId" text);
CREATE TABLE public."CollaborationTeam"(id text PRIMARY KEY,"ownerId" text,"parentKind" text,"parentRouteId" text);
CREATE TABLE public."CollaborationTeamMember"("teamId" text,"userId" text,role text,"revokedAt" timestamptz);
CREATE TABLE public."BrokerageMembership"("brokerageId" text,"userId" text,role text);
CREATE TABLE public."Contact"(id text PRIMARY KEY,"spaceId" text,"brokerageId" text,name text,email text,phone text,"leadType" text,notes text,"updatedAt" timestamptz NOT NULL DEFAULT now());
CREATE TABLE public."Deal"(id text PRIMARY KEY,"spaceId" text,title text,value numeric,"closeDate" timestamptz,notes text,"updatedAt" timestamptz NOT NULL DEFAULT now());
CREATE TABLE public."Property"(id text PRIMARY KEY,"spaceId" text,"brokerageId" text,address text,city text,"listPrice" numeric,beds numeric,baths numeric,notes text,"updatedAt" timestamptz NOT NULL DEFAULT now());
INSERT INTO public."User"(id) VALUES ('owner'),('agent'),('broker-owner');
INSERT INTO public."Brokerage"(id) VALUES ('brokerage-a'),('brokerage-b');
INSERT INTO public."Space" VALUES ('space-a','owner-space','owner',NULL);
INSERT INTO public."CollaborationTeam" VALUES ('team-a','owner','personal','owner-space'),('team-b','broker-owner','brokerage','brokerage-a');
INSERT INTO public."CollaborationTeamMember" VALUES ('team-a','agent','member',NULL),('team-b','agent','member',NULL);
INSERT INTO public."BrokerageMembership" VALUES ('brokerage-a','broker-owner','broker_owner');
INSERT INTO public."Contact"(id,"spaceId",name,notes,"updatedAt") VALUES ('person-a','space-a','Original','PRIVATE','2026-09-08T12:00:00Z');
INSERT INTO public."Contact"(id,"brokerageId",name,notes,"updatedAt") VALUES ('broker-person','brokerage-a','Broker original','PRIVATE','2026-09-08T12:00:00Z');
SQL
for migration in 20260921000000_team_record_sharing.sql 20260923000000_brokerage_team_record_sharing.sql 20260924000000_team_record_edits.sql 20260924000000_team_record_edits.sql; do
  "${psql_cmd[@]}" -f "${repo_root}/supabase/migrations/${migration}"
done
"${psql_cmd[@]}" <<'SQL'
INSERT INTO public."TeamRecordGrant"(id,"teamId","spaceId","recordKind","recordId","grantedBy","canEdit")
VALUES ('10000000-0000-4000-8000-000000000001','team-a','space-a','contact','person-a','owner',true);
INSERT INTO public."BrokerageTeamRecordGrant"(id,"teamId","brokerageId","recordKind","recordId","grantedBy","canEdit")
VALUES ('10000000-0000-4000-8000-000000000002','team-b','brokerage-a','contact','broker-person','broker-owner',true);
DO $$
DECLARE first_result jsonb; replay jsonb;
BEGIN
  IF has_function_privilege('authenticated','public.edit_team_shared_record(text,text,uuid,text,uuid,timestamptz,jsonb)','EXECUTE')
    OR has_function_privilege('anon','public.edit_team_shared_record(text,text,uuid,text,uuid,timestamptz,jsonb)','EXECUTE')
    THEN RAISE EXCEPTION 'client execution leaked'; END IF;
  first_result:=public.edit_team_shared_record('team-a','agent','10000000-0000-4000-8000-000000000001','personal','20000000-0000-4000-8000-000000000001','2026-09-08T12:00:00Z','{"name":"Updated"}');
  replay:=public.edit_team_shared_record('team-a','agent','10000000-0000-4000-8000-000000000001','personal','20000000-0000-4000-8000-000000000001','2026-09-08T12:00:00Z','{"name":"Updated"}');
  IF first_result<>replay OR (SELECT count(*) FROM public."TeamRecordEdit")<>1 THEN RAISE EXCEPTION 'retry was not idempotent'; END IF;
  IF (SELECT name FROM public."Contact" WHERE id='person-a')<>'Updated' OR (SELECT notes FROM public."Contact" WHERE id='person-a')<>'PRIVATE' THEN RAISE EXCEPTION 'edit scope wrong'; END IF;
  BEGIN
    PERFORM public.edit_team_shared_record('team-a','agent','10000000-0000-4000-8000-000000000001','personal','20000000-0000-4000-8000-000000000003','2026-09-08T12:00:00Z','{"name":"Stale"}');
    RAISE EXCEPTION 'stale edit accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
    PERFORM public.edit_team_shared_record('team-a','agent','10000000-0000-4000-8000-000000000001','personal','20000000-0000-4000-8000-000000000004',(first_result->>'updatedAt')::timestamptz,'{"notes":"Private write"}');
    RAISE EXCEPTION 'private field accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
SQL

"${psql_cmd[@]}" <<'SQL'
CREATE FUNCTION pg_temp.denied(team text, source text, grant_id uuid, record_id text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN
  PERFORM public.edit_team_shared_record(team,'agent',grant_id,source,gen_random_uuid(),(SELECT "updatedAt" FROM public."Contact" WHERE id=record_id),'{"name":"Forbidden"}');
  RAISE EXCEPTION 'unauthorized edit accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
DO $$
DECLARE receipt jsonb;
BEGIN
 receipt:=public.edit_team_shared_record('team-b','agent','10000000-0000-4000-8000-000000000002','brokerage',gen_random_uuid(),'2026-09-08T12:00:00Z','{"name":"Broker updated","phone":"555-0100"}');
 IF (SELECT name FROM public."Contact" WHERE id='broker-person')<>'Broker updated' THEN RAISE EXCEPTION 'broker edit failed'; END IF;
 PERFORM pg_temp.denied('team-a','brokerage','10000000-0000-4000-8000-000000000002','broker-person');
 UPDATE public."TeamRecordGrant" SET "canEdit"=false;
 PERFORM pg_temp.denied('team-a','personal','10000000-0000-4000-8000-000000000001','person-a');
 UPDATE public."TeamRecordGrant" SET "canEdit"=true,"revokedAt"=now();
 PERFORM pg_temp.denied('team-a','personal','10000000-0000-4000-8000-000000000001','person-a');
 UPDATE public."TeamRecordGrant" SET "revokedAt"=NULL;
 UPDATE public."CollaborationTeamMember" SET "revokedAt"=now() WHERE "userId"='agent';
 PERFORM pg_temp.denied('team-a','personal','10000000-0000-4000-8000-000000000001','person-a');
 UPDATE public."CollaborationTeamMember" SET "revokedAt"=NULL;
 UPDATE public."User" SET status='offboarded' WHERE id='agent';
 PERFORM pg_temp.denied('team-b','brokerage','10000000-0000-4000-8000-000000000002','broker-person');
 UPDATE public."User" SET status='active';
 UPDATE public."BrokerageMembership" SET role='agent';
 PERFORM pg_temp.denied('team-b','brokerage','10000000-0000-4000-8000-000000000002','broker-person');
 UPDATE public."BrokerageMembership" SET role='broker_owner';
 UPDATE public."Contact" SET "brokerageId"='brokerage-b' WHERE id='broker-person';
 PERFORM pg_temp.denied('team-b','brokerage','10000000-0000-4000-8000-000000000002','broker-person');
 UPDATE public."Contact" SET "brokerageId"='brokerage-a' WHERE id='broker-person';
 UPDATE public."Space" SET "ownerId"='agent' WHERE id='space-a';
 PERFORM pg_temp.denied('team-a','personal','10000000-0000-4000-8000-000000000001','person-a');
 UPDATE public."Space" SET "ownerId"='owner' WHERE id='space-a';
 IF (SELECT count(*) FROM public."TeamRecordEdit")<>2 THEN RAISE EXCEPTION 'denied edits left receipts'; END IF;
END $$;
CREATE FUNCTION public.fail_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'receipt unavailable'; END $$;
CREATE TRIGGER reject_receipt BEFORE INSERT ON public."TeamRecordEdit" FOR EACH ROW EXECUTE FUNCTION public.fail_receipt();
DO $$
DECLARE before_row jsonb;
BEGIN
 SELECT to_jsonb(c) INTO before_row FROM public."Contact" c WHERE id='person-a';
 BEGIN
  PERFORM public.edit_team_shared_record('team-a','agent','10000000-0000-4000-8000-000000000001','personal',gen_random_uuid(),(before_row->>'updatedAt')::timestamptz,'{"name":"Must roll back"}');
  RAISE EXCEPTION 'expected receipt failure';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM<>'receipt unavailable' THEN RAISE; END IF;
 END;
 IF before_row<>(SELECT to_jsonb(c) FROM public."Contact" c WHERE id='person-a') THEN RAISE EXCEPTION 'record committed without receipt'; END IF;
END $$;
SQL

# A revocation already in progress must win over a newly arriving edit.
"${psql_cmd[@]}" <<'SQL' >"${pg_tmp}/revoke.log" 2>&1 &
BEGIN;
UPDATE public."TeamRecordGrant" SET "canEdit"=false;
SELECT pg_sleep(1);
COMMIT;
SQL
revoke_pid=$!
for attempt in {1..50}; do
  locked="$("${psql_cmd[@]}" -c "SELECT count(*) FROM pg_locks WHERE relation='public.\"TeamRecordGrant\"'::regclass AND mode='RowExclusiveLock' AND granted")"
  if [[ "${locked}" != '0' ]]; then break; fi
  sleep 0.02
done
if [[ "${locked}" == '0' ]]; then echo 'Revocation lock was not observed' >&2; exit 1; fi
"${psql_cmd[@]}" <<'SQL'
SET statement_timeout='5s';
DO $$ BEGIN
 BEGIN
  PERFORM public.edit_team_shared_record('team-a','agent','10000000-0000-4000-8000-000000000001','personal',gen_random_uuid(),(SELECT "updatedAt" FROM public."Contact" WHERE id='person-a'),'{"name":"Racing write"}');
  RAISE EXCEPTION 'concurrent revocation bypassed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT name FROM public."Contact" WHERE id='person-a')<>'Updated' THEN RAISE EXCEPTION 'racing edit committed'; END IF;
END $$;
SQL
wait "${revoke_pid}"
