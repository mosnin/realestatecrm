#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
pg_bin="$(dirname "$(command -v postgres)")"
pg_tmp="$(mktemp -d "/tmp/chippi-broker-grants.XXXXXX")"
pg_data="${pg_tmp}/data"
pg_socket="${pg_tmp}/socket"
pg_port="$((59000 + RANDOM % 1000))"

cleanup() {
  "${pg_bin}/pg_ctl" -D "${pg_data}" -m immediate stop >/dev/null 2>&1 || true
  if [[ "${pg_tmp}" == *"/chippi-broker-grants."* ]]; then
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
CREATE TABLE public."User"(id text PRIMARY KEY);
CREATE TABLE public."CollaborationTeam"(id text PRIMARY KEY);
CREATE TABLE public."Brokerage"(id text PRIMARY KEY);
INSERT INTO public."User" VALUES ('owner');
INSERT INTO public."CollaborationTeam" VALUES ('team-a');
INSERT INTO public."Brokerage" VALUES ('brokerage-a'),('brokerage-b');
SQL
for attempt in 1 2; do
  "${psql_cmd[@]}" -f "${repo_root}/supabase/migrations/20260923000000_brokerage_team_record_sharing.sql"
done
"${psql_cmd[@]}" <<'SQL'
INSERT INTO public."BrokerageTeamRecordGrant"("teamId","brokerageId","recordKind","recordId","grantedBy")
VALUES ('team-a','brokerage-a','contact','person-a','owner');
DO $$
DECLARE affected integer;
BEGIN
  IF has_table_privilege('anon','public."BrokerageTeamRecordGrant"','SELECT')
    OR has_table_privilege('authenticated','public."BrokerageTeamRecordGrant"','UPDATE') THEN
    RAISE EXCEPTION 'client privileges leaked';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public."BrokerageTeamRecordGrant"'::regclass) THEN
    RAISE EXCEPTION 'RLS disabled';
  END IF;
  UPDATE public."BrokerageTeamRecordGrant" SET "revokedAt"=now()
    WHERE "brokerageId"='brokerage-b' AND "teamId"='team-a';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'cross-brokerage update'; END IF;
  BEGIN
    INSERT INTO public."BrokerageTeamRecordGrant"("teamId","brokerageId","recordKind","recordId","grantedBy")
    VALUES ('team-a','brokerage-a','contact','person-a','owner');
    RAISE EXCEPTION 'duplicate grant accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    UPDATE public."BrokerageTeamRecordGrant" SET "recordKind"='all';
    RAISE EXCEPTION 'invalid record kind accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
SELECT 'brokerage sharing migration and scope checks passed';
SQL
