#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
pg_bin="$(dirname "$(command -v postgres)")"
pg_tmp="$(mktemp -d "/tmp/chippi-swarm-cancel.XXXXXX")"
pg_data="${pg_tmp}/data"
pg_socket="${pg_tmp}/socket"
pg_log="${pg_tmp}/postgres.log"
pg_port="$((63000 + RANDOM % 1000))"

cleanup() {
  "${pg_bin}/pg_ctl" -D "${pg_data}" -m immediate stop >/dev/null 2>&1 || true
  if [[ "${pg_tmp}" == *"/chippi-swarm-cancel."* ]]; then
    /bin/rm -rf "${pg_tmp}"
  fi
}
trap cleanup EXIT

mkdir -p "${pg_socket}"
"${pg_bin}/initdb" -D "${pg_data}" -A trust -U postgres >/dev/null
"${pg_bin}/pg_ctl" -D "${pg_data}" -l "${pg_log}" \
  -o "-k '${pg_socket}' -p ${pg_port} -c listen_addresses=''" -w start >/dev/null
psql_cmd=("${pg_bin}/psql" -X -qAt -v ON_ERROR_STOP=1 -h "${pg_socket}" -p "${pg_port}" -U postgres -d postgres)

"${psql_cmd[@]}" <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE TABLE public."Space" (id text PRIMARY KEY);
CREATE TABLE public."SwarmRun" (
  id text PRIMARY KEY,
  "spaceId" text NOT NULL REFERENCES public."Space"(id),
  status text NOT NULL,
  "completedAt" timestamptz,
  "launchUpdatedAt" timestamptz
);
CREATE TABLE public."SwarmEvent" (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "swarmRunId" text NOT NULL REFERENCES public."SwarmRun"(id),
  type text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);
SQL

"${psql_cmd[@]}" -f "${repo_root}/supabase/migrations/20260915000022_swarm_cancel_atomicity.sql"

"${psql_cmd[@]}" <<'SQL'
INSERT INTO public."Space"(id) VALUES ('space-a'),('space-b');
INSERT INTO public."SwarmRun"(id,"spaceId",status) VALUES
  ('run-active','space-a','running'),
  ('run-terminal','space-a','completed');

DO $$
DECLARE v_result jsonb;
BEGIN
  SELECT public.cancel_swarm_run('run-active','space-b') INTO v_result;
  IF v_result->>'outcome' <> 'not_found' THEN RAISE EXCEPTION 'cross-space cancel leaked run'; END IF;

  SELECT public.cancel_swarm_run('run-active','space-a') INTO v_result;
  IF v_result->>'outcome' <> 'cancelled'
    OR (SELECT status FROM public."SwarmRun" WHERE id='run-active') <> 'cancelled'
    OR (SELECT "cancellationRequestedAt" FROM public."SwarmRun" WHERE id='run-active') IS NULL
    OR (SELECT count(*) FROM public."SwarmEvent" WHERE "swarmRunId"='run-active' AND type='swarm_cancelled') <> 1
  THEN RAISE EXCEPTION 'atomic cancellation did not publish state and event together'; END IF;

  SELECT public.cancel_swarm_run('run-active','space-a') INTO v_result;
  IF v_result->>'outcome' <> 'already_terminal'
    OR (SELECT count(*) FROM public."SwarmEvent" WHERE "swarmRunId"='run-active' AND type='swarm_cancelled') <> 1
  THEN RAISE EXCEPTION 'cancellation replay duplicated event'; END IF;

  SELECT public.cancel_swarm_run('run-terminal','space-a') INTO v_result;
  IF v_result->>'outcome' <> 'already_terminal' OR v_result->>'status' <> 'completed' THEN
    RAISE EXCEPTION 'terminal cancellation outcome was not truthful';
  END IF;

  IF has_function_privilege('anon','public.cancel_swarm_run(text,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.cancel_swarm_run(text,text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.cancel_swarm_run(text,text)','EXECUTE')
  THEN RAISE EXCEPTION 'cancel RPC ACL is unsafe'; END IF;
END;
$$;
SQL

echo "PASS: SwarmRun cancellation state and event are atomic and tenant scoped."
