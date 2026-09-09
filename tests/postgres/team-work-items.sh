#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
pg_bin="$(dirname "$(command -v postgres)")"
pg_tmp="$(mktemp -d "/tmp/chippi-team-work.XXXXXX")"
pg_data="${pg_tmp}/data"
pg_socket="${pg_tmp}/socket"
pg_port="$((59000 + RANDOM % 1000))"

cleanup() {
  "${pg_bin}/pg_ctl" -D "${pg_data}" -m immediate stop >/dev/null 2>&1 || true
  if [[ "${pg_tmp}" == *"/chippi-team-work."* ]]; then
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
INSERT INTO public."User" VALUES ('agent-a'),('agent-b');
INSERT INTO public."CollaborationTeam" VALUES ('team-a'),('team-b');
SQL
for attempt in 1 2; do
  "${psql_cmd[@]}" -f "${repo_root}/supabase/migrations/20260922000000_team_work_items.sql"
done
"${psql_cmd[@]}" <<'SQL'
INSERT INTO public."TeamWorkItem"(id,"teamId","createdBy","assignedTo",title,"dueAt")
VALUES ('ad02509c-e623-4265-80ab-078b65ac80fd','team-a','agent-a','agent-a','Inspection',now());
DO $$
DECLARE affected integer;
BEGIN
  IF has_table_privilege('anon','public."TeamWorkItem"','SELECT')
    OR has_table_privilege('authenticated','public."TeamWorkItem"','UPDATE') THEN
    RAISE EXCEPTION 'client privileges leaked';
  END IF;
  IF NOT has_table_privilege('service_role','public."TeamWorkItem"','SELECT,INSERT,UPDATE') THEN
    RAISE EXCEPTION 'service privilege missing';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public."TeamWorkItem"'::regclass) THEN
    RAISE EXCEPTION 'RLS disabled';
  END IF;
  UPDATE public."TeamWorkItem" SET status='accepted',version=2
    WHERE "teamId"='team-b' AND id='ad02509c-e623-4265-80ab-078b65ac80fd' AND version=1;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'cross-team update'; END IF;
  UPDATE public."TeamWorkItem" SET status='accepted',version=2,"acknowledgedAt"=now()
    WHERE "teamId"='team-a' AND id='ad02509c-e623-4265-80ab-078b65ac80fd' AND version=1;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'acknowledgment lost'; END IF;
  UPDATE public."TeamWorkItem" SET status='cancelled',version=2
    WHERE "teamId"='team-a' AND id='ad02509c-e623-4265-80ab-078b65ac80fd' AND version=1;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'stale update accepted'; END IF;
  BEGIN
    UPDATE public."TeamWorkItem" SET status='imaginary';
    RAISE EXCEPTION 'invalid status accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
SELECT 'team work migration, scope and version checks passed';
SQL
