#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
pg_bin="$(dirname "$(command -v postgres)")"
pg_tmp="$(mktemp -d "${TMPDIR:-/tmp}/chippi-floor-manager.XXXXXX")"
pg_data="${pg_tmp}/data"
pg_socket="${pg_tmp}/socket"
pg_port="$((56000 + RANDOM % 2000))"

cleanup() {
  "${pg_bin}/pg_ctl" -D "${pg_data}" -m immediate stop >/dev/null 2>&1 || true
  if [[ "${pg_tmp}" == *"/chippi-floor-manager."* ]]; then
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
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE TABLE public."Space" (id text PRIMARY KEY);
CREATE TABLE public."Conversation" (
  id text PRIMARY KEY,
  "spaceId" text NOT NULL REFERENCES public."Space"(id) ON DELETE CASCADE
);
CREATE TABLE public."SwarmRun" (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId" text NOT NULL REFERENCES public."Space"(id) ON DELETE CASCADE,
  goal text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued','planning','running','auditing','completed','failed','cancelled')),
  plan jsonb,
  result text,
  "errorMessage" text,
  "totalCostCents" integer NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "completedAt" timestamptz
);
CREATE TABLE public."SwarmEvent" (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "swarmRunId" text NOT NULL REFERENCES public."SwarmRun"(id) ON DELETE CASCADE,
  type text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}',
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
SQL
"${psql_cmd[@]}" -f "${repo_root}/supabase/migrations/20260915000006_realtime_swarm_floor_manager.sql"
"${psql_cmd[@]}" <<'SQL'
INSERT INTO public."Space"(id) VALUES ('space-race');
INSERT INTO public."Conversation"(id,"spaceId") VALUES ('conversation-race','space-race');
INSERT INTO public."SwarmRun"(id,"spaceId","conversationId",goal,status,"createdAt","completedAt")
VALUES (
  'old-terminal',
  'space-race',
  'conversation-race',
  'content that must never leave the database',
  'completed',
  clock_timestamp() - interval '1 minute',
  clock_timestamp() - interval '1 minute'
);
SQL

# Hold the exact call-id lock. The cancel function captures its cutoff and then
# waits here; the concurrently-created active run is therefore newer than the
# call even though it is visible to later statements in that function.
"${psql_cmd[@]}" >"${pg_tmp}/creator.out" 2>"${pg_tmp}/creator.err" <<'SQL' &
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended(
  'space-race:conversation-race:call-race:cancel_specialist_task',
  0
));
SELECT pg_sleep(4);
INSERT INTO public."SwarmRun"(id,"spaceId","conversationId",goal,status,"createdAt")
VALUES (
  'new-active',
  'space-race',
  'conversation-race',
  'new content that appeared after the call cutoff',
  'running',
  clock_timestamp()
);
COMMIT;
SQL
creator_pid=$!

for _ in {1..100}; do
  granted="$("${psql_cmd[@]}" -c "SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND granted")"
  [[ "${granted}" -gt 0 ]] && break
  sleep 0.05
done
[[ "${granted:-0}" -gt 0 ]]

"${psql_cmd[@]}" >"${pg_tmp}/cancel.out" 2>"${pg_tmp}/cancel.err" <<'SQL' &
SELECT concat_ws(
  '|',
  COALESCE(run_id,'NULL'),
  outcome,
  COALESCE(status,'NULL'),
  reused
)
FROM public.cancel_conversation_swarm_run(
  'space-race',
  'conversation-race',
  'call-race'
);
SQL
cancel_pid=$!

for _ in {1..100}; do
  waiting="$("${psql_cmd[@]}" -c "SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND NOT granted")"
  [[ "${waiting}" -gt 0 ]] && break
  sleep 0.05
done
[[ "${waiting:-0}" -gt 0 ]]

if ! wait "${creator_pid}"; then
  cat "${pg_tmp}/creator.err" >&2
  exit 1
fi
if ! wait "${cancel_pid}"; then
  cat "${pg_tmp}/cancel.err" >&2
  exit 1
fi
first_result="$(tr -d '[:space:]' <"${pg_tmp}/cancel.out")"
[[ "${first_result}" == "old-terminal|already_terminal|completed|f" ]]

retry_result="$("${psql_cmd[@]}" -c "
  SELECT concat_ws('|',COALESCE(run_id,'NULL'),outcome,COALESCE(status,'NULL'),reused)
  FROM public.cancel_conversation_swarm_run('space-race','conversation-race','call-race')
")"
[[ "${retry_result}" == "old-terminal|already_terminal|completed|t" ]]

active_status="$("${psql_cmd[@]}" -c "SELECT status FROM public.\"SwarmRun\" WHERE id='new-active'")"
[[ "${active_status}" == "running" ]]

new_call_result="$("${psql_cmd[@]}" -c "
  SELECT concat_ws('|',COALESCE(run_id,'NULL'),outcome,COALESCE(status,'NULL'),reused)
  FROM public.cancel_conversation_swarm_run('space-race','conversation-race','call-after-race')
")"
[[ "${new_call_result}" == "new-active|cancelled|cancelled|f" ]]

event_count="$("${psql_cmd[@]}" -c "
  SELECT count(*) FROM public.\"SwarmEvent\"
  WHERE \"swarmRunId\"='new-active' AND type='swarm_cancelled'
")"
[[ "${event_count}" == "1" ]]

echo "PASS: cutoff-bound cancellation ignored the later run, receipt retry stayed bound, and a new call cancelled it atomically."
