#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
pg_bin="$(dirname "$(command -v postgres)")"
pg_tmp="$(mktemp -d "/tmp/chippi-conversation-mode.XXXXXX")"
pg_data="${pg_tmp}/data"
pg_socket="${pg_tmp}/socket"
pg_log="${pg_tmp}/postgres.log"
pg_port="$((63000 + RANDOM % 1000))"

cleanup() {
  "${pg_bin}/pg_ctl" -D "${pg_data}" -m immediate stop >/dev/null 2>&1 || true
  if [[ "${pg_tmp}" == *"/chippi-conversation-mode."* ]]; then
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
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public."Message" (
  id text PRIMARY KEY,
  "spaceId" text NOT NULL,
  "conversationId" text REFERENCES public."Conversation"(id),
  role text NOT NULL,
  content text NOT NULL DEFAULT '',
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
SQL

"${psql_cmd[@]}" -f "${repo_root}/supabase/migrations/20260915000023_conversation_mode_lock.sql"

"${psql_cmd[@]}" <<'SQL'
INSERT INTO public."Conversation"(id,"spaceId") VALUES
  ('blank','space-a'),
  ('legacy','space-a'),
  ('other','space-b');
INSERT INTO public."Message"(id,"spaceId","conversationId",role,content)
VALUES ('legacy-user','space-a','legacy','user','old chat turn');

DO $$
DECLARE v_mode text;
BEGIN
  SELECT public.claim_conversation_mode('blank','space-a','work') INTO v_mode;
  IF v_mode <> 'work' OR (SELECT mode FROM public."Conversation" WHERE id='blank') <> 'work' THEN
    RAISE EXCEPTION 'first Work claim did not persist';
  END IF;

  SELECT public.claim_conversation_mode('blank','space-a','chat') INTO v_mode;
  IF v_mode <> 'work' THEN RAISE EXCEPTION 'later request changed established Work mode'; END IF;

  SELECT public.claim_conversation_mode('legacy','space-a','work') INTO v_mode;
  IF v_mode <> 'chat' THEN RAISE EXCEPTION 'populated legacy chat was retyped as Work'; END IF;

  BEGIN
    PERFORM public.claim_conversation_mode('other','space-a','chat');
    RAISE EXCEPTION 'cross-space claim unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'conversation not found' THEN RAISE; END IF;
  END;

  IF has_function_privilege('anon','public.claim_conversation_mode(text,text,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.claim_conversation_mode(text,text,text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.claim_conversation_mode(text,text,text)','EXECUTE')
  THEN RAISE EXCEPTION 'conversation mode RPC ACL is unsafe'; END IF;
END;
$$;
SQL

echo "PASS: conversation mode is first-turn, immutable, tenant-scoped, and service-only."
