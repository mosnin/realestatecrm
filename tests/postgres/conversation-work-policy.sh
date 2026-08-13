#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
pg_bin="$(dirname "$(command -v postgres)")"
pg_tmp="$(mktemp -d "/tmp/chippi-work-policy.XXXXXX")"
pg_data="${pg_tmp}/data"
pg_socket="${pg_tmp}/socket"
pg_log="${pg_tmp}/postgres.log"
pg_port="$((64000 + RANDOM % 1000))"

cleanup() {
  "${pg_bin}/pg_ctl" -D "${pg_data}" -m immediate stop >/dev/null 2>&1 || true
  if [[ "${pg_tmp}" == *"/chippi-work-policy."* ]]; then
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
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE TABLE public."Conversation" (
  id text PRIMARY KEY,
  "spaceId" text NOT NULL,
  title text NOT NULL DEFAULT 'New conversation',
  mode text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
SQL

"${psql_cmd[@]}" -f "${repo_root}/supabase/migrations/20260915000025_conversation_execution_mode.sql"

"${psql_cmd[@]}" <<'SQL'
INSERT INTO public."Conversation"(id,"spaceId",mode) VALUES
  ('work-a','space-a','work'),
  ('chat-a','space-a','chat'),
  ('work-b','space-b','work');

DO $$
DECLARE
  v_goal text;
  v_version bigint;
  v_status text;
BEGIN
  SELECT goal, version, status
  INTO v_goal, v_version, v_status
  FROM public.set_conversation_work_goal('work-a','space-a','Close every overdue follow-up');
  IF v_goal <> 'Close every overdue follow-up' OR v_version <> 1 OR v_status <> 'active' THEN
    RAISE EXCEPTION 'first goal write failed';
  END IF;

  SELECT goal, version, status
  INTO v_goal, v_version, v_status
  FROM public.set_conversation_work_goal('work-a','space-a','Prepare the weekly pipeline review');
  IF v_version <> 2 THEN RAISE EXCEPTION 'goal version did not advance'; END IF;

  BEGIN
    PERFORM public.set_conversation_work_goal('work-b','space-a','Cross tenant');
    RAISE EXCEPTION 'cross-space goal write unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'work conversation not found' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.set_conversation_work_goal('chat-a','space-a','Retype Chat');
    RAISE EXCEPTION 'Chat conversation accepted a Work goal';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'work conversation not found' THEN RAISE; END IF;
  END;

  IF has_function_privilege('anon','public.set_conversation_work_goal(text,text,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.set_conversation_work_goal(text,text,text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.set_conversation_work_goal(text,text,text)','EXECUTE')
  THEN RAISE EXCEPTION 'goal RPC ACL is unsafe'; END IF;
END;
$$;
SQL

echo "PASS: Work policy and goal persistence are tenant-scoped, versioned, and service-only."

