#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
pg_bin="$(dirname "$(command -v postgres)")"
pg_tmp="$(mktemp -d "/tmp/chippi-parent-lifecycle-fence.XXXXXX")"
pg_data="${pg_tmp}/data"
pg_socket="${pg_tmp}/socket"
pg_log="${pg_tmp}/postgres.log"
pg_port="$((59000 + RANDOM % 1000))"

cleanup() {
  "${pg_bin}/pg_ctl" -D "${pg_data}" -m immediate stop >/dev/null 2>&1 || true
  if [[ "${pg_tmp}" == *"/chippi-parent-lifecycle-fence."* ]]; then
    /bin/rm -rf "${pg_tmp}"
  fi
}
trap cleanup EXIT

mkdir -p "${pg_socket}"
"${pg_bin}/initdb" -D "${pg_data}" -A trust -U postgres >/dev/null
if ! "${pg_bin}/pg_ctl" -D "${pg_data}" -l "${pg_log}" -o "-k '${pg_socket}' -p ${pg_port} -c listen_addresses=''" -w start >/dev/null; then
  /bin/cat "${pg_log}"
  exit 1
fi
psql_cmd=("${pg_bin}/psql" -X -qAt -v ON_ERROR_STOP=1 -h "${pg_socket}" -p "${pg_port}" -U postgres -d postgres)

"${psql_cmd[@]}" <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE TABLE public."User" (id text PRIMARY KEY, "clerkId" text NOT NULL);
CREATE TABLE public."Space" (id text PRIMARY KEY, "ownerId" text NOT NULL REFERENCES public."User"(id));
CREATE TABLE public."WorkSession" (
  id text PRIMARY KEY, "spaceId" text NOT NULL REFERENCES public."Space"(id), status text NOT NULL,
  plan jsonb NOT NULL DEFAULT '[]'::jsonb, error text, "completedAt" timestamptz, "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public."WorkspaceRun" (
  id text PRIMARY KEY, "workSessionId" text NOT NULL REFERENCES public."WorkSession"(id),
  "spaceId" text NOT NULL REFERENCES public."Space"(id), "launchToken" text, status text NOT NULL,
  "cancellationRequestedAt" timestamptz, error text, "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public."WorkspaceRunEvent" (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text, "runId" text NOT NULL REFERENCES public."WorkspaceRun"(id),
  sequence integer NOT NULL, type text NOT NULL, message text NOT NULL, command text, output text,
  "createdAt" timestamptz NOT NULL DEFAULT now(), UNIQUE ("runId",sequence)
);
CREATE TABLE public."File" (
  id text PRIMARY KEY, "spaceId" text NOT NULL REFERENCES public."Space"(id), "userId" text NOT NULL,
  "storageKey" text NOT NULL UNIQUE, name text NOT NULL, "mimeType" text NOT NULL, category text NOT NULL,
  "sizeBytes" bigint NOT NULL, "isPublic" boolean NOT NULL
);
CREATE TABLE public."WorkspaceRunFile" (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text, "runId" text NOT NULL REFERENCES public."WorkspaceRun"(id),
  "spaceId" text NOT NULL REFERENCES public."Space"(id), "fileId" text REFERENCES public."File"(id),
  name text NOT NULL, "mimeType" text NOT NULL, "sizeBytes" integer NOT NULL, UNIQUE ("runId",name)
);
CREATE FUNCTION finish_workspace_run_and_session(text,text,text,text,integer,text,jsonb)
RETURNS boolean LANGUAGE sql AS 'SELECT false';
GRANT EXECUTE ON FUNCTION finish_workspace_run_and_session(text,text,text,text,integer,text,jsonb) TO anon, authenticated, service_role;
SQL

"${psql_cmd[@]}" -f "${repo_root}/supabase/migrations/20260915000009_workspace_lifecycle_fence_repair.sql"

"${psql_cmd[@]}" <<'SQL'
INSERT INTO public."User"(id,"clerkId") VALUES ('owner-1','clerk-owner-1');
INSERT INTO public."Space"(id,"ownerId") VALUES ('space-1','owner-1');
INSERT INTO public."WorkSession"(id,"spaceId",status,plan) VALUES
  ('session-1','space-1','running','[{"id":"one","status":"running"}]'),
  ('session-2','space-1','running','[]'),
  ('session-3','space-1','running','[]');
INSERT INTO public."WorkspaceRun"(id,"workSessionId","spaceId","launchToken",status) VALUES
  ('run-1','session-1','space-1','token-current','launching'),
  ('run-2','session-2','space-1','token-current','launching'),
  ('run-3','session-3','space-1','token-current','running');
INSERT INTO public."WorkspaceRunEvent"("runId",sequence,type,message)
VALUES ('run-2',1,'workspace_started','legacy committed start');

DO $$
DECLARE v_result text; v_bool boolean; v_count integer;
BEGIN
  IF to_regprocedure('finish_workspace_run_and_session(text,text,text,text,integer,text,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'unfenced terminal function still exists';
  END IF;
  IF to_regprocedure('finish_workspace_run_and_session(text,text,text,text,text,integer,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'fenced terminal function missing';
  END IF;
  IF has_function_privilege('anon','record_workspace_run_event(text,text,text,integer,text,text,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute parent event RPC';
  END IF;
  IF NOT has_function_privilege('service_role','record_workspace_run_event(text,text,text,integer,text,text,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'service role cannot execute parent event RPC';
  END IF;

  SELECT record_workspace_run_event('run-1','space-1','token-stale',1,'workspace_started','stale',NULL,NULL) INTO v_result;
  IF v_result <> 'stale_launch' OR (SELECT status FROM "WorkspaceRun" WHERE id='run-1') <> 'launching' THEN
    RAISE EXCEPTION 'stale start crossed the fence';
  END IF;
  SELECT record_workspace_run_event('run-1','space-1','token-current',1,'workspace_started','current',NULL,NULL) INTO v_result;
  IF v_result <> 'recorded' OR (SELECT status FROM "WorkspaceRun" WHERE id='run-1') <> 'running' THEN
    RAISE EXCEPTION 'current start was not atomic';
  END IF;
  SELECT record_workspace_run_event('run-1','space-1','token-current',1,'workspace_started','current',NULL,NULL) INTO v_result;
  IF v_result <> 'duplicate_event' THEN RAISE EXCEPTION 'current start replay was not idempotent'; END IF;
  SELECT count(*) INTO v_count FROM "WorkspaceRunEvent" WHERE "runId"='run-1';
  IF v_count <> 1 THEN RAISE EXCEPTION 'start replay duplicated evidence'; END IF;

  SELECT record_workspace_run_event('run-2','space-1','token-current',1,'workspace_started','legacy replay',NULL,NULL) INTO v_result;
  IF v_result <> 'duplicate_event' OR (SELECT status FROM "WorkspaceRun" WHERE id='run-2') <> 'running' THEN
    RAISE EXCEPTION 'legacy split-write gap was not repaired';
  END IF;

  SELECT finish_workspace_run_and_session(
    'run-3','space-1','token-stale','completed',NULL,1,'stale complete',
    '[{"id":"stale-1","storageKey":"private/stale-1","name":"brief.md","mimeType":"text/markdown","sizeBytes":10},{"id":"stale-2","storageKey":"private/stale-2","name":"launch-checklist.md","mimeType":"text/markdown","sizeBytes":10},{"id":"stale-3","storageKey":"private/stale-3","name":"comps.csv","mimeType":"text/csv","sizeBytes":10},{"id":"stale-4","storageKey":"private/stale-4","name":"handoff.md","mimeType":"text/markdown","sizeBytes":10}]'
  ) INTO v_bool;
  IF v_bool IS DISTINCT FROM false OR EXISTS (SELECT 1 FROM "File" WHERE id LIKE 'stale-%') OR (SELECT status FROM "WorkspaceRun" WHERE id='run-3') <> 'running' THEN
    RAISE EXCEPTION 'stale terminal callback persisted state';
  END IF;

  SELECT finish_workspace_run_and_session(
    'run-3','space-1','token-current','completed',NULL,1,'current complete',
    '[{"id":"current-1","storageKey":"private/current-1","name":"brief.md","mimeType":"text/markdown","sizeBytes":10},{"id":"current-2","storageKey":"private/current-2","name":"launch-checklist.md","mimeType":"text/markdown","sizeBytes":10},{"id":"current-3","storageKey":"private/current-3","name":"comps.csv","mimeType":"text/csv","sizeBytes":10},{"id":"current-4","storageKey":"private/current-4","name":"handoff.md","mimeType":"text/markdown","sizeBytes":10}]'
  ) INTO v_bool;
  IF v_bool IS DISTINCT FROM true OR (SELECT status FROM "WorkspaceRun" WHERE id='run-3') <> 'completed' OR (SELECT count(*) FROM "File" WHERE id LIKE 'current-%') <> 4 THEN
    RAISE EXCEPTION 'current terminal callback did not commit atomically';
  END IF;
  SELECT finish_workspace_run_and_session('run-3','space-1','token-current','failed','late',2,'late','[]') INTO v_bool;
  IF v_bool IS DISTINCT FROM false OR (SELECT count(*) FROM "WorkspaceRunEvent" WHERE "runId"='run-3') <> 1 THEN
    RAISE EXCEPTION 'terminal replay was not idempotent';
  END IF;
END $$;
SQL

echo "PASS: parent start/event/file/terminal mutations are token-fenced; duplicate current callbacks repair or no-op atomically."
