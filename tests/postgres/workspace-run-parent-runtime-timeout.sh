#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
pg_bin="$(dirname "$(command -v postgres)")"
pg_tmp="$(mktemp -d "/tmp/chippi-parent-runtime-timeout.XXXXXX")"
pg_data="${pg_tmp}/data"
pg_socket="${pg_tmp}/socket"
pg_log="${pg_tmp}/postgres.log"
pg_port="$((60000 + RANDOM % 1000))"

cleanup() {
  "${pg_bin}/pg_ctl" -D "${pg_data}" -m immediate stop >/dev/null 2>&1 || true
  if [[ "${pg_tmp}" == *"/chippi-parent-runtime-timeout."* ]]; then
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
CREATE ROLE untrusted;
CREATE TABLE public."Space" (id text PRIMARY KEY);
CREATE TABLE public."WorkSession" (
  id text PRIMARY KEY,
  "spaceId" text NOT NULL REFERENCES public."Space"(id),
  status text NOT NULL,
  plan jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  "completedAt" timestamptz,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public."WorkspaceRun" (
  id text PRIMARY KEY,
  "workSessionId" text NOT NULL REFERENCES public."WorkSession"(id),
  "spaceId" text NOT NULL REFERENCES public."Space"(id),
  status text NOT NULL,
  "launchToken" text,
  "launchedAt" timestamptz,
  "launchLeaseExpiresAt" timestamptz,
  "modalAcceptedAt" timestamptz,
  "cancellationRequestedAt" timestamptz,
  error text,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public."WorkspaceRunEvent" (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "runId" text NOT NULL REFERENCES public."WorkspaceRun"(id),
  sequence integer NOT NULL,
  type text NOT NULL,
  message text NOT NULL,
  command text,
  output text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("runId", sequence)
);
SQL

"${psql_cmd[@]}" -f "${repo_root}/supabase/migrations/20260915000007_workspace_launch_receipts.sql"
"${psql_cmd[@]}" -f "${repo_root}/supabase/migrations/20260915000014_workspace_parent_runtime_timeout.sql"

"${psql_cmd[@]}" <<'SQL'
INSERT INTO public."Space"(id) VALUES ('space-1');
INSERT INTO public."WorkSession"(id,"spaceId",status,plan,"updatedAt") VALUES
  ('session-stale','space-1','running','[{"id":"one","status":"done"},{"id":"two","status":"running"}]',now()-interval '7 minutes'),
  ('session-recent','space-1','running','[]',now()-interval '5 minutes'),
  ('session-terminal','space-1','completed','[]',now()-interval '20 minutes'),
  ('session-cancelled','space-1','cancelled','[]',now()-interval '20 minutes'),
  ('session-cancelling','space-1','running','[]',now()-interval '20 minutes'),
  ('session-stale-token','space-1','running','[]',now()-interval '20 minutes'),
  ('session-plan','space-1','planning','[]',now()-interval '6 minutes'),
  ('session-execute','space-1','running','[]',now()-interval '1 minute'),
  ('session-retry','space-1','running','[]',now()-interval '3 minutes'),
  ('session-silent','space-1','running','[]',now()-interval '5 minutes');
INSERT INTO public."WorkspaceRun"(
  id,"workSessionId","spaceId",status,"launchToken","modalAcceptedAt","cancellationRequestedAt","updatedAt"
) VALUES
  ('run-stale','session-stale','space-1','running','token-stale-run',now()-interval '8 minutes',NULL,now()-interval '7 minutes'),
  ('run-recent','session-recent','space-1','running','token-recent',now()-interval '5 minutes',NULL,now()-interval '5 minutes'),
  ('run-terminal','session-terminal','space-1','completed','token-terminal',now()-interval '20 minutes',NULL,now()-interval '20 minutes'),
  ('run-cancelled','session-cancelled','space-1','cancelled','token-cancelled',now()-interval '20 minutes',now()-interval '10 minutes',now()-interval '10 minutes'),
  ('run-cancelling','session-cancelling','space-1','running','token-cancelling',now()-interval '20 minutes',now()-interval '1 minute',now()-interval '20 minutes'),
  ('run-stale-token','session-stale-token','space-1','running','token-current',now()-interval '20 minutes',NULL,now()-interval '20 minutes'),
  ('run-plan','session-plan','space-1','queued',NULL,NULL,NULL,now()-interval '6 minutes'),
  ('run-execute','session-execute','space-1','queued',NULL,NULL,NULL,now()-interval '1 minute'),
  ('run-retry','session-retry','space-1','launching','token-retry',NULL,NULL,now()-interval '3 minutes'),
  ('run-silent','session-silent','space-1','launching','token-silent',now()-interval '5 minutes',NULL,now()-interval '5 minutes');
UPDATE public."WorkspaceRun"
SET "launchLeaseExpiresAt" = now()-interval '1 minute'
WHERE id='run-retry';
INSERT INTO public."WorkspaceRunLaunchReceipt"(
  "runId","spaceId","launchToken",attempt,state
) VALUES
  ('run-stale','space-1','token-stale-run',1,'claimed'),
  ('run-stale','space-1','token-stale-run',1,'accepted'),
  ('run-recent','space-1','token-recent',1,'claimed'),
  ('run-terminal','space-1','token-terminal',1,'claimed'),
  ('run-cancelled','space-1','token-cancelled',1,'claimed'),
  ('run-cancelling','space-1','token-cancelling',1,'claimed'),
  ('run-stale-token','space-1','token-current',1,'claimed');
INSERT INTO public."WorkspaceRunEvent"("runId",sequence,type,message) VALUES
  ('run-stale',1,'workspace_started','started'),
  ('run-stale',2,'command_started','working');

DO $$
DECLARE
  v_count integer;
  v_action text;
  v_token text;
  v_seconds integer;
  v_legacy_actions jsonb;
BEGIN
  SELECT count(*), min(action), min("launchToken"), min("staleForSeconds")
  INTO v_count, v_action, v_token, v_seconds
  FROM public.list_workspace_run_recovery_candidates(25, ARRAY['space-1'])
  WHERE "runId" IN ('run-stale','run-recent','run-terminal','run-cancelled','run-cancelling');
  IF v_count <> 1
    OR v_action <> 'fail_runtime_timeout'
    OR v_token <> 'token-stale-run'
    OR v_seconds < 360
  THEN
    RAISE EXCEPTION 'stale parent candidate discovery was not conservative';
  END IF;

  SELECT jsonb_object_agg(candidate."runId", candidate.action)
  INTO v_legacy_actions
  FROM public.list_workspace_run_recovery_candidates(25, ARRAY['space-1']) AS candidate
  WHERE candidate."runId" IN ('run-plan','run-execute','run-retry','run-silent');
  IF v_legacy_actions <> '{
    "run-plan":"plan",
    "run-execute":"execute",
    "run-retry":"execute",
    "run-silent":"fail_accepted_silent"
  }'::jsonb THEN
    RAISE EXCEPTION 'existing recovery actions changed: %', v_legacy_actions;
  END IF;

  IF has_function_privilege('untrusted','public.fail_stale_running_workspace_run(text,text,text)','EXECUTE')
    OR has_function_privilege('anon','public.fail_stale_running_workspace_run(text,text,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.fail_stale_running_workspace_run(text,text,text)','EXECUTE')
  THEN
    RAISE EXCEPTION 'untrusted role can execute parent runtime timeout';
  END IF;
  IF NOT has_function_privilege('service_role','public.fail_stale_running_workspace_run(text,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'service role cannot execute parent runtime timeout';
  END IF;
  IF has_function_privilege('untrusted','public.list_workspace_run_recovery_candidates(integer,text[])','EXECUTE')
    OR has_function_privilege('anon','public.list_workspace_run_recovery_candidates(integer,text[])','EXECUTE')
    OR has_function_privilege('authenticated','public.list_workspace_run_recovery_candidates(integer,text[])','EXECUTE')
    OR NOT has_function_privilege('service_role','public.list_workspace_run_recovery_candidates(integer,text[])','EXECUTE')
  THEN
    RAISE EXCEPTION 'candidate discovery privilege boundary changed';
  END IF;
  IF NOT (
    SELECT prosecdef FROM pg_proc
    WHERE oid = 'public.fail_stale_running_workspace_run(text,text,text)'::regprocedure
  ) THEN
    RAISE EXCEPTION 'parent runtime timeout is not security definer';
  END IF;
END;
$$;

SET ROLE service_role;
DO $$
BEGIN
  IF public.fail_stale_running_workspace_run(
    'run-stale','space-1','token-stale-run'
  ) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'current stale parent did not fail';
  END IF;
END;
$$;
RESET ROLE;

DO $$
DECLARE
  v_error CONSTANT text := 'Workspace runtime started but did not finish within its bounded execution window.';
BEGIN
  IF (SELECT status FROM public."WorkspaceRun" WHERE id='run-stale') <> 'failed'
    OR (SELECT error FROM public."WorkspaceRun" WHERE id='run-stale') <> v_error
    OR (SELECT status FROM public."WorkSession" WHERE id='session-stale') <> 'failed'
    OR (SELECT error FROM public."WorkSession" WHERE id='session-stale') <> v_error
    OR (SELECT plan FROM public."WorkSession" WHERE id='session-stale')
      <> '[{"id":"one","status":"skipped"},{"id":"two","status":"skipped"}]'::jsonb
  THEN
    RAISE EXCEPTION 'parent and session did not fail atomically';
  END IF;
  IF (SELECT count(*) FROM public."WorkspaceRunLaunchReceipt"
      WHERE "runId"='run-stale' AND "launchToken"='token-stale-run'
        AND state='failed' AND reason='started runtime exceeded bounded execution window') <> 1
  THEN
    RAISE EXCEPTION 'truthful parent runtime receipt missing';
  END IF;
  IF (SELECT count(*) FROM public."WorkspaceRunEvent"
      WHERE "runId"='run-stale' AND sequence=3 AND type='failed' AND message=v_error) <> 1
  THEN
    RAISE EXCEPTION 'truthful parent runtime terminal event missing';
  END IF;
  IF public.fail_stale_running_workspace_run(
    'run-stale','space-1','token-stale-run'
  ) IS DISTINCT FROM false
    OR (SELECT count(*) FROM public."WorkspaceRunEvent" WHERE "runId"='run-stale') <> 3
  THEN
    RAISE EXCEPTION 'parent timeout replay was not idempotent';
  END IF;

  IF public.fail_stale_running_workspace_run(
    'run-stale-token','space-1','token-old'
  ) IS DISTINCT FROM false
    OR public.fail_stale_running_workspace_run(
      'run-recent','space-1','token-recent'
    ) IS DISTINCT FROM false
    OR public.fail_stale_running_workspace_run(
      'run-terminal','space-1','token-terminal'
    ) IS DISTINCT FROM false
    OR public.fail_stale_running_workspace_run(
      'run-cancelled','space-1','token-cancelled'
    ) IS DISTINCT FROM false
    OR public.fail_stale_running_workspace_run(
      'run-cancelling','space-1','token-cancelling'
    ) IS DISTINCT FROM false
    OR public.fail_stale_running_workspace_run(
      'run-stale-token','space-1',' '
    ) IS DISTINCT FROM false
  THEN
    RAISE EXCEPTION 'negative parent timeout boundary mutated';
  END IF;
  IF (SELECT status FROM public."WorkspaceRun" WHERE id='run-stale-token') <> 'running'
    OR (SELECT status FROM public."WorkspaceRun" WHERE id='run-recent') <> 'running'
    OR (SELECT status FROM public."WorkspaceRun" WHERE id='run-terminal') <> 'completed'
    OR (SELECT status FROM public."WorkspaceRun" WHERE id='run-cancelled') <> 'cancelled'
    OR (SELECT status FROM public."WorkspaceRun" WHERE id='run-cancelling') <> 'running'
  THEN
    RAISE EXCEPTION 'healthy, terminal, stale-token, or cancelled parent changed';
  END IF;
END;
$$;
SQL

echo "PASS: stale running parent recovery is token-fenced, atomic, private, and conservative."
