#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
pg_bin="$(dirname "$(command -v postgres)")"
pg_tmp="$(mktemp -d "${TMPDIR:-/tmp}/chippi-task-token-fence.XXXXXX")"
pg_data="${pg_tmp}/data"
pg_socket="${pg_tmp}/socket"
pg_port="$((58000 + RANDOM % 1000))"

cleanup() {
  "${pg_bin}/pg_ctl" -D "${pg_data}" -m immediate stop >/dev/null 2>&1 || true
  if [[ "${pg_tmp}" == *"/chippi-task-token-fence."* ]]; then
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
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE public."User" (
  id text PRIMARY KEY,
  "clerkId" text NOT NULL
);
CREATE TABLE public."Space" (
  id text PRIMARY KEY,
  "ownerId" text NOT NULL REFERENCES public."User"(id)
);
CREATE TABLE public."WorkspaceRun" (
  id text PRIMARY KEY,
  "spaceId" text NOT NULL REFERENCES public."Space"(id),
  status text NOT NULL
);
CREATE TABLE public."File" (
  id text PRIMARY KEY,
  "spaceId" text NOT NULL REFERENCES public."Space"(id),
  "userId" text NOT NULL,
  "storageKey" text NOT NULL,
  name text NOT NULL,
  "mimeType" text NOT NULL,
  category text NOT NULL,
  "sizeBytes" integer NOT NULL,
  "isPublic" boolean NOT NULL
);
SQL

for migration in \
  20260915000000_workspace_run_follow_up_tasks.sql \
  20260915000001_workspace_run_task_programs_and_cancel.sql \
  20260915000002_workspace_run_task_declarative_plans.sql \
  20260915000003_workspace_run_task_idempotency_conflict.sql \
  20260915000004_workspace_run_typed_artifacts.sql
do
  "${psql_cmd[@]}" -f "${repo_root}/supabase/migrations/${migration}"
done

# Simulate an environment that had already applied the earlier, unfenced
# development signatures. The additive repair must remove the obsolete
# overload and recreate the token-fenced authorities without relying on edited
# historical migrations being replayed.
"${psql_cmd[@]}" <<'SQL'
DROP FUNCTION public.record_workspace_run_task_event(text,text,text,integer,text,text,text,text);
DROP FUNCTION public.finish_workspace_run_task(text,text,text,text,text,integer,text,text,jsonb);

CREATE OR REPLACE FUNCTION public.finish_workspace_run_task(
  p_task_id text, p_space_id text, p_outcome text, p_error text DEFAULT NULL,
  p_sequence integer DEFAULT NULL, p_message text DEFAULT NULL,
  p_output text DEFAULT NULL, p_files jsonb DEFAULT '[]'::jsonb
) RETURNS boolean LANGUAGE sql SET search_path = public AS $$ SELECT true $$;

CREATE OR REPLACE FUNCTION public.claim_workspace_run_task_launch(
  p_task_id text, p_space_id text, p_token text
) RETURNS boolean LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE "WorkspaceRunTask" t SET status='launching', "launchToken"=p_token,
    "launchLeaseExpiresAt"=now()+interval '2 minutes', "modalAcceptedAt"=NULL, "updatedAt"=now()
  FROM "WorkspaceRun" r
  WHERE t.id=p_task_id AND t."spaceId"=p_space_id AND t."runId"=r.id
    AND r.status='completed' AND t."cancellationRequestedAt" IS NULL
    AND (t.status='queued' OR (t.status='launching' AND t."launchLeaseExpiresAt" < now()));
  RETURN FOUND;
END $$;
SQL

"${psql_cmd[@]}" -f "${repo_root}/supabase/migrations/20260915000012_workspace_task_lifecycle_fence_repair.sql"

"${psql_cmd[@]}" <<'SQL'
DO $$
BEGIN
  IF to_regprocedure('public.finish_workspace_run_task(text,text,text,text,integer,text,text,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'obsolete unfenced task finisher survived the additive repair';
  END IF;
  IF to_regprocedure('public.finish_workspace_run_task(text,text,text,text,text,integer,text,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'token-fenced task finisher was not recreated';
  END IF;
  IF to_regprocedure('public.record_workspace_run_task_event(text,text,text,integer,text,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'token-fenced task event recorder was not recreated';
  END IF;
END $$;
SQL

"${psql_cmd[@]}" <<'SQL'
INSERT INTO public."User"(id,"clerkId") VALUES ('owner-1','clerk-owner-1');
INSERT INTO public."Space"(id,"ownerId") VALUES ('space-1','owner-1');
INSERT INTO public."WorkspaceRun"(id,"spaceId",status) VALUES ('run-1','space-1','completed');
INSERT INTO public."WorkspaceRunTask"(
  id,"runId","spaceId",sequence,"idempotencyKey",instruction,"commandPlan","executionPlan"
) VALUES (
  'task-1','run-1','space-1',1,'task-token-fence-0001','Build a grounded report',
  '[{"command":"inspect","description":"Inspect"}]'::jsonb,
  '{"summary":"Grounded","title":"Private review","evidence":[{"file":"brief.md","quote":"Grounded"}],"nextSteps":["Review"]}'::jsonb
);

DO $$
DECLARE v_result text; v_bool boolean; v_count integer;
BEGIN
  SELECT claim_workspace_run_task_launch('task-1','space-1','token-current') INTO v_bool;
  IF v_bool IS DISTINCT FROM true THEN RAISE EXCEPTION 'initial claim failed'; END IF;
  SELECT accept_workspace_run_task_launch('task-1','space-1','token-current') INTO v_bool;
  IF v_bool IS DISTINCT FROM true THEN RAISE EXCEPTION 'accept failed'; END IF;

  UPDATE "WorkspaceRunTask" SET "launchLeaseExpiresAt"=now()-interval '1 second' WHERE id='task-1';
  SELECT claim_workspace_run_task_launch('task-1','space-1','token-stale') INTO v_bool;
  IF v_bool IS DISTINCT FROM false THEN RAISE EXCEPTION 'accepted task was reclaimed'; END IF;
  IF (SELECT "launchToken" FROM "WorkspaceRunTask" WHERE id='task-1') <> 'token-current' THEN RAISE EXCEPTION 'accepted token changed'; END IF;

  SELECT record_workspace_run_task_event('task-1','space-1','token-current',1,'workspace_started','started') INTO v_result;
  IF v_result <> 'recorded' THEN RAISE EXCEPTION 'current start was not recorded: %', v_result; END IF;
  SELECT record_workspace_run_task_event('task-1','space-1','token-current',1,'workspace_started','started') INTO v_result;
  IF v_result <> 'duplicate_event' THEN RAISE EXCEPTION 'current replay was not idempotent: %', v_result; END IF;
  SELECT record_workspace_run_task_event('task-1','space-1','token-stale',2,'file_created','stale file') INTO v_result;
  IF v_result <> 'stale_launch' THEN RAISE EXCEPTION 'stale event was not fenced: %', v_result; END IF;
  SELECT count(*) INTO v_count FROM "WorkspaceRunTaskEvent" WHERE "taskId"='task-1';
  IF v_count <> 1 THEN RAISE EXCEPTION 'stale event changed persistence'; END IF;
  SELECT record_workspace_run_task_event('task-1','space-1','token-current',2,'file_created','current file') INTO v_result;
  IF v_result <> 'recorded' THEN RAISE EXCEPTION 'current file event was not recorded: %', v_result; END IF;

  SELECT finish_workspace_run_task(
    'task-1','space-1','token-stale','completed',NULL,3,'stale completed','stale output',
    '[{"id":"file-stale","storageKey":"private/stale","name":"workspace-follow-up-1.md","mimeType":"text/markdown","sizeBytes":16}]'::jsonb
  ) INTO v_bool;
  IF v_bool IS DISTINCT FROM false THEN RAISE EXCEPTION 'stale token finished task'; END IF;
  IF EXISTS (SELECT 1 FROM "File" WHERE id='file-stale') OR EXISTS (SELECT 1 FROM "WorkspaceRunTaskFile" WHERE "fileId"='file-stale') THEN RAISE EXCEPTION 'stale token persisted a file'; END IF;
  IF (SELECT status FROM "WorkspaceRunTask" WHERE id='task-1') <> 'running' THEN RAISE EXCEPTION 'stale token changed task status'; END IF;

  SELECT finish_workspace_run_task(
    'task-1','space-1','token-current','completed',NULL,3,'completed','current output',
    '[{"id":"file-current","storageKey":"private/current","name":"workspace-follow-up-1.md","mimeType":"text/markdown","sizeBytes":16}]'::jsonb
  ) INTO v_bool;
  IF v_bool IS DISTINCT FROM true THEN RAISE EXCEPTION 'current token did not finish task'; END IF;
  SELECT finish_workspace_run_task(
    'task-1','space-1','token-current','completed',NULL,3,'completed','current output',
    '[{"id":"file-current","storageKey":"private/current","name":"workspace-follow-up-1.md","mimeType":"text/markdown","sizeBytes":16}]'::jsonb
  ) INTO v_bool;
  IF v_bool IS DISTINCT FROM false THEN RAISE EXCEPTION 'terminal replay was not idempotent'; END IF;
  SELECT record_workspace_run_task_event('task-1','space-1','token-current',4,'file_created','late file') INTO v_result;
  IF v_result <> 'terminal' THEN RAISE EXCEPTION 'terminal event replay was not ignored: %', v_result; END IF;
  SELECT count(*) INTO v_count FROM "WorkspaceRunTaskEvent" WHERE "taskId"='task-1';
  IF v_count <> 3 THEN RAISE EXCEPTION 'terminal replay appended evidence'; END IF;
END $$;

INSERT INTO public."WorkspaceRunTask"(
  id,"runId","spaceId",sequence,"idempotencyKey",instruction,"commandPlan","executionPlan"
) VALUES (
  'task-2','run-1','space-1',2,'task-token-fence-0002','Build another grounded report',
  '[{"command":"inspect","description":"Inspect"}]'::jsonb,
  '{"summary":"Grounded","title":"Second review","evidence":[{"file":"brief.md","quote":"Grounded"}],"nextSteps":["Review"]}'::jsonb
);

DO $$
DECLARE v_bool boolean;
BEGIN
  SELECT claim_workspace_run_task_launch('task-2','space-1','token-first') INTO v_bool;
  IF v_bool IS DISTINCT FROM true THEN RAISE EXCEPTION 'second initial claim failed'; END IF;
  UPDATE "WorkspaceRunTask" SET "launchLeaseExpiresAt"=now()-interval '1 second' WHERE id='task-2';
  SELECT claim_workspace_run_task_launch('task-2','space-1','token-recovered') INTO v_bool;
  IF v_bool IS DISTINCT FROM true THEN RAISE EXCEPTION 'unaccepted expired claim did not recover'; END IF;
END $$;
SQL

echo "PASS: accepted task claims stayed fenced; stale tokens could not append events/files or finish; current-token replays stayed idempotent."
