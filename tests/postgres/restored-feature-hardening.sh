#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
pg_bin="$(dirname "$(command -v postgres)")"
pg_tmp="$(mktemp -d "/tmp/chippi-restored-hardening.XXXXXX")"
pg_data="${pg_tmp}/data"
pg_socket="${pg_tmp}/socket"
pg_port="$((59000 + RANDOM % 1000))"

cleanup() {
  "${pg_bin}/pg_ctl" -D "${pg_data}" -m immediate stop >/dev/null 2>&1 || true
  if [[ "${pg_tmp}" == *"/chippi-restored-hardening."* ]]; then
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
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;

CREATE TABLE public."Space" (id text PRIMARY KEY);
CREATE TABLE public."Conversation" (
  id text PRIMARY KEY,
  "spaceId" text NOT NULL REFERENCES public."Space"(id)
);
CREATE TABLE public."Routine" (
  id text PRIMARY KEY,
  "spaceId" text NOT NULL REFERENCES public."Space"(id)
);
CREATE TABLE public."Workflow" (
  id uuid PRIMARY KEY,
  "spaceId" text NOT NULL REFERENCES public."Space"(id),
  version integer NOT NULL DEFAULT 1
);
CREATE TABLE public."AgentTask" (
  id text PRIMARY KEY,
  "spaceId" text NOT NULL REFERENCES public."Space"(id)
);

CREATE TABLE public."BrowserSession" (
  id text PRIMARY KEY,
  "spaceId" text NOT NULL REFERENCES public."Space"(id),
  "userId" text NOT NULL,
  "linkId" text,
  status text NOT NULL,
  "source" text NOT NULL,
  "startedAt" timestamptz NOT NULL DEFAULT now(),
  "endedAt" timestamptz,
  "lastPolledAt" timestamptz,
  "lastFrame" jsonb,
  "lastFrameAt" timestamptz
);
CREATE TABLE public."BrowserAction" (
  id text PRIMARY KEY,
  "sessionId" text NOT NULL REFERENCES public."BrowserSession"(id),
  "spaceId" text NOT NULL REFERENCES public."Space"(id),
  status text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "dispatchedAt" timestamptz,
  "completedAt" timestamptz
);
SQL

for migration in \
  20260908100000_durable_agent_runs.sql \
  20260908200000_durable_schedule_occurrence_steps.sql \
  20260913000000_chippi_research_workspace_leases.sql
do
  "${psql_cmd[@]}" -f "${repo_root}/supabase/migrations/${migration}"
done

# These minimal stubs model the default EXECUTE privilege left by the original
# workspace migrations. The hardening migration must discover every overload,
# remove client execution, and retain only service-role execution.
"${psql_cmd[@]}" <<'SQL'
CREATE FUNCTION public.cancel_workspace_run_and_session(text,text) RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE FUNCTION public.record_workspace_run_event(text,text,text,integer,text,text,text,text) RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE FUNCTION public.finish_workspace_run_and_session(text,text,text,text,text,integer,text,jsonb) RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE FUNCTION public.claim_workspace_launch(text,text,text) RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE FUNCTION public.accept_workspace_launch(text,text,text) RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE FUNCTION public.record_workspace_launch_receipt(text,text,text,text,text) RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE FUNCTION public.list_workspace_run_recovery_candidates(integer,text[]) RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE FUNCTION public.fail_stale_accepted_workspace_launch(text,text,text) RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE FUNCTION public.enqueue_workspace_run_task(text,text,text,text,text,jsonb) RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE FUNCTION public.enqueue_workspace_run_task_with_plan(text,text,text,text,text,jsonb,jsonb) RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE FUNCTION public.claim_workspace_run_task_launch(text,text,text) RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE FUNCTION public.accept_workspace_run_task_launch(text,text,text) RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE FUNCTION public.record_workspace_run_task_event(text,text,text,integer,text,text,text,text) RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE FUNCTION public.finish_workspace_run_task(text,text,text,text,text,integer,text,text,jsonb) RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE FUNCTION public.cancel_workspace_run_task(text,text) RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE FUNCTION public.create_workspace_workbook_artifact(text,text,text,text,text,text,jsonb) RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE FUNCTION public.enqueue_workspace_run_task_with_program(text,text,text,text,text,jsonb,text) RETURNS boolean LANGUAGE sql AS 'SELECT true';

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
SQL

"${psql_cmd[@]}" -f "${repo_root}/supabase/migrations/20260915000010_restored_feature_hardening.sql"

"${psql_cmd[@]}" <<'SQL'
DO $$
DECLARE
  v_workspace_names constant text[] := ARRAY[
    'cancel_workspace_run_and_session',
    'record_workspace_run_event',
    'finish_workspace_run_and_session',
    'claim_workspace_launch',
    'accept_workspace_launch',
    'record_workspace_launch_receipt',
    'list_workspace_run_recovery_candidates',
    'fail_stale_accepted_workspace_launch',
    'enqueue_workspace_run_task',
    'enqueue_workspace_run_task_with_plan',
    'claim_workspace_run_task_launch',
    'accept_workspace_run_task_launch',
    'record_workspace_run_task_event',
    'finish_workspace_run_task',
    'cancel_workspace_run_task',
    'create_workspace_workbook_artifact'
  ];
  v_proc record;
  v_count integer := 0;
BEGIN
  IF to_regprocedure('public.enqueue_workspace_run_task_with_program(text,text,text,text,text,jsonb,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'obsolete execution-program RPC remains callable';
  END IF;
  IF to_regprocedure('public.claim_agent_job(text,integer)') IS NOT NULL
     OR to_regprocedure('public.heartbeat_agent_job(uuid,text,integer)') IS NOT NULL
     OR to_regprocedure('public.finish_agent_job(uuid,text,text,jsonb,text,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'unsafe AgentJobRun overload remains callable';
  END IF;

  FOR v_proc IN
    SELECT p.oid, p.proacl, p.proowner
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY(v_workspace_names)
  LOOP
    v_count := v_count + 1;
    IF has_function_privilege('anon', v_proc.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', v_proc.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'client role retained workspace RPC execute on oid %', v_proc.oid;
    END IF;
    IF NOT has_function_privilege('service_role', v_proc.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'service_role lost workspace RPC execute on oid %', v_proc.oid;
    END IF;
    IF EXISTS (
      SELECT 1
      FROM aclexplode(COALESCE(v_proc.proacl, acldefault('f', v_proc.proowner))) acl
      WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
    ) THEN
      RAISE EXCEPTION 'PUBLIC retained workspace RPC execute on oid %', v_proc.oid;
    END IF;
  END LOOP;
  IF v_count <> 16 THEN
    RAISE EXCEPTION 'workspace privilege test covered %, expected 16 RPCs', v_count;
  END IF;
END;
$$;

INSERT INTO public."Space"(id) VALUES ('space-a'), ('space-b');
INSERT INTO public."Routine"(id,"spaceId") VALUES ('routine-a','space-a');
INSERT INTO public."Workflow"(id,"spaceId",version)
VALUES ('00000000-0000-0000-0000-000000000001','space-a',1);
INSERT INTO public."AgentTask"(id,"spaceId") VALUES ('task-a','space-a');

DO $$
DECLARE
  v_rejected boolean;
BEGIN
  PERFORM 1 FROM public.materialize_schedule_occurrence(
    'space-a','routine','routine-a','2030-01-01T01:00:00Z',3,NULL
  );
  PERFORM 1 FROM public.materialize_schedule_occurrence(
    'space-a','workflow','00000000-0000-0000-0000-000000000001','2030-01-01T02:00:00Z',3,1
  );
  PERFORM 1 FROM public.materialize_schedule_occurrence(
    'space-a','agent_task','task-a','2030-01-01T03:00:00Z',3,NULL
  );
  IF (SELECT count(*) FROM public."ScheduleOccurrence") <> 3 THEN
    RAISE EXCEPTION 'valid tenant-owned schedule sources did not materialize';
  END IF;

  v_rejected := false;
  BEGIN
    PERFORM 1 FROM public.materialize_schedule_occurrence(
      'space-b','routine','routine-a','2030-01-02T01:00:00Z',3,NULL
    );
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'schedule source not found in requested space' THEN v_rejected := true; ELSE RAISE; END IF;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'cross-space routine materialized'; END IF;

  v_rejected := false;
  BEGIN
    PERFORM 1 FROM public.materialize_schedule_occurrence(
      'space-b','workflow','00000000-0000-0000-0000-000000000001','2030-01-02T02:00:00Z',3,1
    );
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'schedule source not found in requested space' THEN v_rejected := true; ELSE RAISE; END IF;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'cross-space workflow materialized'; END IF;

  v_rejected := false;
  BEGIN
    PERFORM 1 FROM public.materialize_schedule_occurrence(
      'space-b','agent_task','task-a','2030-01-02T03:00:00Z',3,NULL
    );
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'schedule source not found in requested space' THEN v_rejected := true; ELSE RAISE; END IF;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'cross-space agent task materialized'; END IF;
END;
$$;

INSERT INTO public."BrowserSession"(id,"spaceId","userId",status,"source")
VALUES ('browser-1','space-a','user-a','active','headless');
INSERT INTO public."BrowserAction"(id,"sessionId","spaceId",status)
VALUES ('browser-action-1','browser-1','space-a','queued');

DO $$
DECLARE
  v_ok boolean;
BEGIN
  SELECT public.claim_headless_browser_worker('browser-1', repeat('a',32), 30) INTO v_ok;
  IF v_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'initial browser lease claim failed'; END IF;
  UPDATE public."BrowserSession" SET "workerLeaseExpiresAt"=now()-interval '1 second' WHERE id='browser-1';
  SELECT public.finish_headless_browser_worker('browser-1', repeat('a',32), NULL) INTO v_ok;
  IF v_ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'expired browser lease completed'; END IF;
  IF (SELECT status FROM public."BrowserSession" WHERE id='browser-1') <> 'active' THEN
    RAISE EXCEPTION 'expired browser lease ended session';
  END IF;

  SELECT public.claim_headless_browser_worker('browser-1', repeat('b',32), 30) INTO v_ok;
  IF v_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'browser lease reclaim failed'; END IF;
  SELECT public.finish_headless_browser_worker('browser-1', repeat('a',32), NULL) INTO v_ok;
  IF v_ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'stale browser token completed successor lease'; END IF;
  SELECT public.finish_headless_browser_worker('browser-1', repeat('b',32), NULL) INTO v_ok;
  IF v_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'current browser lease could not complete'; END IF;
END;
$$;

INSERT INTO public."AgentJobRun"(
  "spaceId","createdBy",kind,mode,title,status,"maxAttempts"
) VALUES ('space-a','user-a','sandbox_job','sandbox','lease test','queued',3);

DO $$
DECLARE
  v_first public."AgentJobRun"%ROWTYPE;
  v_second public."AgentJobRun"%ROWTYPE;
  v_ok boolean;
BEGIN
  SELECT * INTO v_first FROM public.claim_agent_job('worker-a', repeat('c',32), 60);
  IF v_first.id IS NULL OR v_first."leaseGeneration" <> 1 THEN
    RAISE EXCEPTION 'first fenced AgentJobRun claim failed';
  END IF;
  UPDATE public."AgentJobRun" SET "leaseExpiresAt"=now()-interval '1 second' WHERE id=v_first.id;
  SELECT * INTO v_second FROM public.claim_agent_job('worker-a', repeat('d',32), 60);
  IF v_second.id <> v_first.id OR v_second."leaseGeneration" <> 2 THEN
    RAISE EXCEPTION 'expired AgentJobRun claim was not regenerated';
  END IF;

  SELECT public.heartbeat_agent_job(v_first.id,'worker-a',repeat('c',32),1,60) INTO v_ok;
  IF v_ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'stale AgentJobRun heartbeat succeeded'; END IF;
  SELECT public.finish_agent_job(v_first.id,'worker-a',repeat('c',32),1,'completed',NULL,NULL,NULL) INTO v_ok;
  IF v_ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'stale AgentJobRun finish succeeded'; END IF;
  SELECT public.heartbeat_agent_job(v_second.id,'worker-a',repeat('d',32),2,60) INTO v_ok;
  IF v_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'current AgentJobRun heartbeat failed'; END IF;
  SELECT public.finish_agent_job(v_second.id,'worker-a',repeat('d',32),2,'completed','{"ok":true}'::jsonb,NULL,NULL) INTO v_ok;
  IF v_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'current AgentJobRun finish failed'; END IF;
  IF EXISTS (
    SELECT 1 FROM public."AgentJobRun"
    WHERE id=v_second.id AND (status <> 'completed' OR "leaseToken" IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'terminal AgentJobRun retained active lease state';
  END IF;
END;
$$;
SQL

echo "PASS: restored-feature RPC privileges, source ownership, and browser/AgentJobRun lease fences held on PostgreSQL."
