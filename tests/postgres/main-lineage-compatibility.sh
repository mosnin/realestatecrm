#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
pg_bin="$(dirname "$(command -v postgres)")"
pg_tmp="$(mktemp -d "/tmp/chippi-main-lineage.XXXXXX")"
pg_data="${pg_tmp}/data"
pg_socket="${pg_tmp}/socket"
pg_log="${pg_tmp}/postgres.log"
pg_port="$((62000 + RANDOM % 1000))"

cleanup() {
  "${pg_bin}/pg_ctl" -D "${pg_data}" -m immediate stop >/dev/null 2>&1 || true
  if [[ "${pg_tmp}" == *"/chippi-main-lineage."* ]]; then
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

-- Simulate a database whose migration ledger recorded the historical branch's
-- colliding versions, while the three different current-main deltas are absent.
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY);
INSERT INTO supabase_migrations.schema_migrations(version) VALUES
  ('20260905000000'), ('20260906000000'), ('20260908000000');

CREATE TABLE public."Space" (
  id text PRIMARY KEY,
  "ownerId" text NOT NULL
);
CREATE TABLE public."User" (id text PRIMARY KEY);
CREATE OR REPLACE FUNCTION public.current_user_internal_id()
RETURNS text LANGUAGE sql STABLE AS 'SELECT NULL::text';
CREATE TABLE public."WorkSession" (
  id text PRIMARY KEY,
  status text NOT NULL,
  CONSTRAINT "WorkSession_status_check" CHECK (
    status IN ('planning','awaiting_approval','awaiting_input','running','completed','failed','cancelled')
  )
);
CREATE TABLE public."ChatUsage" (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId" text NOT NULL REFERENCES public."Space"(id)
);
CREATE TABLE public."Conversation" (
  id text PRIMARY KEY,
  "spaceId" text NOT NULL REFERENCES public."Space"(id)
);
CREATE TABLE public."WorkspaceRun" (
  id text PRIMARY KEY,
  "spaceId" text NOT NULL REFERENCES public."Space"(id),
  status text NOT NULL
);
CREATE TABLE public."WorkspaceRunTask" (
  id text PRIMARY KEY,
  "runId" text NOT NULL REFERENCES public."WorkspaceRun"(id),
  "spaceId" text NOT NULL REFERENCES public."Space"(id),
  status text NOT NULL,
  "launchToken" text,
  "launchLeaseExpiresAt" timestamptz,
  "modalAcceptedAt" timestamptz,
  "cancellationRequestedAt" timestamptz,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public."CustomAgent" (
  id text PRIMARY KEY,
  "spaceId" text NOT NULL REFERENCES public."Space"(id),
  "isActive" boolean NOT NULL DEFAULT true
);
CREATE TABLE public."SwarmRun" (
  id text PRIMARY KEY,
  "spaceId" text NOT NULL REFERENCES public."Space"(id),
  "conversationId" text REFERENCES public."Conversation"(id),
  goal text NOT NULL,
  status text NOT NULL,
  "customAgentIds" text[] NOT NULL DEFAULT '{}'::text[],
  "launchToken" text,
  "launchLeaseExpiresAt" timestamptz,
  "launchUpdatedAt" timestamptz
);
CREATE TABLE public."SwarmRunLaunchReceipt" (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "swarmRunId" text NOT NULL REFERENCES public."SwarmRun"(id),
  "spaceId" text NOT NULL REFERENCES public."Space"(id),
  "launchToken" text NOT NULL,
  state text NOT NULL,
  UNIQUE ("swarmRunId", "launchToken", state)
);
SQL

for pass in 1 2; do
  "${psql_cmd[@]}" -f "${repo_root}/supabase/migrations/20260915000020_main_lineage_and_claim_invariants.sql"
done

"${psql_cmd[@]}" <<'SQL'
INSERT INTO public."Space"(id,"ownerId") VALUES ('space-a','owner-a'),('space-b','owner-b');

DO $$
DECLARE
  v_ok boolean;
  v_state text;
  v_rejected boolean := false;
  run_id constant text := '12060da9-b26e-47f0-8056-803441ab721b';
  token constant text := '95945bee-15a4-47ee-86ae-ccf23ac224b9';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='User' AND column_name='language'
  ) OR to_regclass('public."WorkSessionAction"') IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='ChatUsage' AND column_name='idempotencyKey'
    )
  THEN RAISE EXCEPTION 'colliding current-main schema was not repaired'; END IF;

  INSERT INTO public."User"(id,language) VALUES ('user-a','es');
  BEGIN
    INSERT INTO public."User"(id,language) VALUES ('user-b','xx');
  EXCEPTION WHEN check_violation THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'locale constraint did not reject invalid language'; END IF;

  INSERT INTO public."WorkSession"(id,status) VALUES ('session-a','awaiting_actions');
  INSERT INTO public."WorkSessionAction"("sessionId","spaceId",tool,summary)
  VALUES ('session-a','space-a','send_email','Send an email');

  INSERT INTO public."ChatUsage"("spaceId","idempotencyKey") VALUES ('space-a','turn-1');
  v_rejected := false;
  BEGIN
    INSERT INTO public."ChatUsage"("spaceId","idempotencyKey") VALUES ('space-a','turn-1');
  EXCEPTION WHEN unique_violation THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'usage idempotency did not reject duplicate billing key'; END IF;

  INSERT INTO public."WorkspaceRun"(id,"spaceId",status) VALUES ('workspace-a','space-a','completed');
  INSERT INTO public."WorkspaceRunTask"(id,"runId","spaceId",status)
  VALUES ('task-a','workspace-a','space-a','queued');
  SELECT public.claim_workspace_run_task_launch('task-a','space-a',NULL) INTO v_ok;
  IF v_ok OR (SELECT status FROM public."WorkspaceRunTask" WHERE id='task-a') <> 'queued' THEN
    RAISE EXCEPTION 'null task token was accepted';
  END IF;
  SELECT public.claim_workspace_run_task_launch('task-a','space-a','   ') INTO v_ok;
  IF v_ok OR (SELECT status FROM public."WorkspaceRunTask" WHERE id='task-a') <> 'queued' THEN
    RAISE EXCEPTION 'blank task token was accepted';
  END IF;
  SELECT public.claim_workspace_run_task_launch('task-a','space-a','token-not-a-uuid') INTO v_ok;
  IF v_ok OR (SELECT status FROM public."WorkspaceRunTask" WHERE id='task-a') <> 'queued' THEN
    RAISE EXCEPTION 'malformed task token was accepted';
  END IF;
  SELECT public.claim_workspace_run_task_launch('task-a','space-a',token) INTO v_ok;
  IF NOT v_ok THEN RAISE EXCEPTION 'valid task token was rejected'; END IF;

  INSERT INTO public."Conversation"(id,"spaceId") VALUES ('conversation-b','space-b'),('conversation-a','space-a');
  SELECT public.create_claimed_swarm_run(
    run_id,'space-a','Cross-tenant goal','conversation-b',ARRAY[]::text[],token
  ) INTO v_state;
  IF v_state <> 'invalid_conversation' THEN
    RAISE EXCEPTION 'cross-space conversation was accepted: %', v_state;
  END IF;
  SELECT public.create_claimed_swarm_run(
    NULL,'space-a','Missing run id','conversation-a',ARRAY[]::text[],token
  ) INTO v_state;
  IF v_state <> 'invalid' THEN RAISE EXCEPTION 'null swarm run id was accepted: %', v_state; END IF;
  SELECT public.create_claimed_swarm_run(
    '   ','space-a','Blank run id','conversation-a',ARRAY[]::text[],token
  ) INTO v_state;
  IF v_state <> 'invalid' THEN RAISE EXCEPTION 'blank swarm run id was accepted: %', v_state; END IF;
  SELECT public.create_claimed_swarm_run(
    run_id,'space-a','Missing launch token','conversation-a',ARRAY[]::text[],NULL
  ) INTO v_state;
  IF v_state <> 'invalid' THEN RAISE EXCEPTION 'null swarm launch token was accepted: %', v_state; END IF;
  SELECT public.create_claimed_swarm_run(
    run_id,'space-a','Blank launch token','conversation-a',ARRAY[]::text[],'   '
  ) INTO v_state;
  IF v_state <> 'invalid' THEN RAISE EXCEPTION 'blank swarm launch token was accepted: %', v_state; END IF;
  SELECT public.create_claimed_swarm_run(
    run_id,'space-a','Tenant-correct goal','conversation-a',ARRAY[]::text[],token
  ) INTO v_state;
  IF v_state <> 'claimed' THEN RAISE EXCEPTION 'same-space conversation was rejected: %', v_state; END IF;

  IF has_function_privilege('anon','public.claim_workspace_run_task_launch(text,text,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.create_claimed_swarm_run(text,text,text,text,text[],text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.claim_workspace_run_task_launch(text,text,text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.create_claimed_swarm_run(text,text,text,text,text[],text)','EXECUTE')
  THEN RAISE EXCEPTION 'repaired claim RPC ACL is unsafe'; END IF;
END;
$$;
SQL

echo "PASS: historical migration-version collision repair and claim invariants."
