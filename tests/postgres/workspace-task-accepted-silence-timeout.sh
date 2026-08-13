#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
pg_bin="$(dirname "$(command -v postgres)")"
pg_tmp="$(mktemp -d "${TMPDIR:-/tmp}/chippi-task-timeout.XXXXXX")"
pg_data="${pg_tmp}/data"
pg_socket="${pg_tmp}/socket"
pg_port="$((59000 + RANDOM % 500))"

cleanup() {
  "${pg_bin}/pg_ctl" -D "${pg_data}" -m immediate stop >/dev/null 2>&1 || true
  if [[ "${pg_tmp}" == *"/chippi-task-timeout."* ]]; then
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
CREATE ROLE outsider NOLOGIN;

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
  20260915000004_workspace_run_typed_artifacts.sql \
  20260915000012_workspace_task_lifecycle_fence_repair.sql \
  20260915000013_workspace_task_accepted_silence_repair.sql \
  20260915000019_workspace_task_runtime_clock_repair.sql
do
  "${psql_cmd[@]}" -f "${repo_root}/supabase/migrations/${migration}"
done

"${psql_cmd[@]}" <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'fail_silent_accepted_workspace_run_task'
      AND p.prosecdef
      AND 'search_path=public, pg_temp' = ANY(p.proconfig)
  ) THEN
    RAISE EXCEPTION 'accepted-silence RPC is not a search-path-pinned SECURITY DEFINER';
  END IF;
  IF has_function_privilege('outsider', 'public.fail_silent_accepted_workspace_run_task(text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PUBLIC retained accepted-silence RPC execute';
  END IF;
  IF has_function_privilege('anon', 'public.fail_silent_accepted_workspace_run_task(text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon retained accepted-silence RPC execute';
  END IF;
  IF has_function_privilege('authenticated', 'public.fail_silent_accepted_workspace_run_task(text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated retained accepted-silence RPC execute';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.fail_silent_accepted_workspace_run_task(text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role lacks accepted-silence RPC execute';
  END IF;
END $$;

DO $$
BEGIN
  BEGIN
    SET LOCAL ROLE outsider;
    PERFORM public.fail_silent_accepted_workspace_run_task(
      'missing', 'missing', '123e4567-e89b-42d3-a456-426614174000'
    );
    RAISE EXCEPTION 'outsider executed accepted-silence RPC';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $$;

INSERT INTO public."User"(id,"clerkId") VALUES ('owner-1','clerk-owner-1');
INSERT INTO public."Space"(id,"ownerId") VALUES ('space-1','owner-1');
INSERT INTO public."WorkspaceRun"(id,"spaceId",status) VALUES ('run-1','space-1','completed');

INSERT INTO public."WorkspaceRunTask"(
  id,"runId","spaceId",sequence,"idempotencyKey",instruction,"commandPlan",
  "executionPlan",status,"launchToken","modalAcceptedAt","cancellationRequestedAt"
) VALUES
  ('launching-old','run-1','space-1',1,'accepted-timeout-0001','Build grounded report','[{"command":"inspect","description":"Inspect"}]','{}','launching','00000000-0000-4000-8000-000000000001',now()-interval '6 minutes',NULL),
  ('running-old','run-1','space-1',2,'accepted-timeout-0002','Build grounded report','[{"command":"inspect","description":"Inspect"}]','{}','running','00000000-0000-4000-8000-000000000002',now()-interval '6 minutes',NULL),
  ('running-young','run-1','space-1',3,'accepted-timeout-0003','Build grounded report','[{"command":"inspect","description":"Inspect"}]','{}','running','00000000-0000-4000-8000-000000000003',now()-interval '6 minutes',NULL),
  ('launching-young','run-1','space-1',4,'accepted-timeout-0004','Build grounded report','[{"command":"inspect","description":"Inspect"}]','{}','launching','00000000-0000-4000-8000-000000000004',now()-interval '4 minutes',NULL),
  ('replaced-token','run-1','space-1',5,'accepted-timeout-0005','Build grounded report','[{"command":"inspect","description":"Inspect"}]','{}','launching','00000000-0000-4000-8000-000000000005',now()-interval '6 minutes',NULL),
  ('cancel-pending','run-1','space-1',6,'accepted-timeout-0006','Build grounded report','[{"command":"inspect","description":"Inspect"}]','{}','launching','00000000-0000-4000-8000-000000000006',now()-interval '6 minutes',now()-interval '1 minute'),
  ('unaccepted-old','run-1','space-1',7,'accepted-timeout-0007','Build grounded report','[{"command":"inspect","description":"Inspect"}]','{}','launching','00000000-0000-4000-8000-000000000007',NULL,NULL),
  ('completed-old','run-1','space-1',8,'accepted-timeout-0008','Build grounded report','[{"command":"inspect","description":"Inspect"}]','{}','completed','00000000-0000-4000-8000-000000000008',now()-interval '6 minutes',NULL),
  ('failed-old','run-1','space-1',9,'accepted-timeout-0009','Build grounded report','[{"command":"inspect","description":"Inspect"}]','{}','failed','00000000-0000-4000-8000-000000000009',now()-interval '6 minutes',NULL),
  ('cancelled-old','run-1','space-1',10,'accepted-timeout-0010','Build grounded report','[{"command":"inspect","description":"Inspect"}]','{}','cancelled','00000000-0000-4000-8000-000000000010',now()-interval '6 minutes',now()-interval '6 minutes'),
  ('legacy-started','run-1','space-1',11,'accepted-timeout-0011','Build grounded report','[{"command":"inspect","description":"Inspect"}]','{}','launching','00000000-0000-4000-8000-000000000011',now()-interval '6 minutes',NULL),
  ('concurrent-old','run-1','space-1',12,'accepted-timeout-0012','Build grounded report','[{"command":"inspect","description":"Inspect"}]','{}','running','00000000-0000-4000-8000-000000000012',now()-interval '6 minutes',NULL);

INSERT INTO public."WorkspaceRunTaskEvent"("taskId",sequence,type,message) VALUES
  ('running-old',1,'workspace_started','started'),
  ('running-young',1,'workspace_started','started'),
  ('legacy-started',1,'workspace_started','started'),
  ('concurrent-old',1,'workspace_started','started');

-- A running task is timed from its fenced start/activity update, not from an
-- earlier Modal acceptance. Age only the truly stalled rows.
UPDATE public."WorkspaceRunTask"
SET "updatedAt" = now() - interval '6 minutes'
WHERE id IN ('running-old', 'concurrent-old');

DO $$
DECLARE v_result boolean;
BEGIN
  SELECT public.fail_silent_accepted_workspace_run_task('launching-old','space-1','00000000-0000-4000-8000-000000000099') INTO v_result;
  IF v_result IS DISTINCT FROM false OR (SELECT status FROM public."WorkspaceRunTask" WHERE id='launching-old') <> 'launching' THEN
    RAISE EXCEPTION 'stale token changed an accepted-silent launch';
  END IF;
  SELECT public.fail_silent_accepted_workspace_run_task('launching-old','space-1','00000000-0000-4000-8000-000000000001') INTO v_result;
  IF v_result IS DISTINCT FROM true
    OR (SELECT status FROM public."WorkspaceRunTask" WHERE id='launching-old') <> 'failed'
    OR (SELECT error FROM public."WorkspaceRunTask" WHERE id='launching-old') <> 'Workspace continuation runtime accepted the launch but did not start.'
  THEN
    RAISE EXCEPTION 'current accepted-silent launch was not failed truthfully';
  END IF;
  SELECT public.fail_silent_accepted_workspace_run_task('launching-old','space-1','00000000-0000-4000-8000-000000000001') INTO v_result;
  IF v_result IS DISTINCT FROM false THEN RAISE EXCEPTION 'terminal timeout replay was not idempotent'; END IF;

  SELECT public.fail_silent_accepted_workspace_run_task('running-old','space-1','00000000-0000-4000-8000-000000000002') INTO v_result;
  IF v_result IS DISTINCT FROM true
    OR (SELECT status FROM public."WorkspaceRunTask" WHERE id='running-old') <> 'failed'
    OR (SELECT error FROM public."WorkspaceRunTask" WHERE id='running-old') <> 'Workspace continuation runtime started but did not finish.'
  THEN
    RAISE EXCEPTION 'bounded running task was not failed truthfully';
  END IF;

  SELECT public.fail_silent_accepted_workspace_run_task('running-young','space-1','00000000-0000-4000-8000-000000000003') INTO v_result;
  IF v_result IS DISTINCT FROM false OR (SELECT status FROM public."WorkspaceRunTask" WHERE id='running-young') <> 'running' THEN
    RAISE EXCEPTION 'recently started task was failed from its older acceptance clock';
  END IF;
  SELECT public.fail_silent_accepted_workspace_run_task('launching-young','space-1','00000000-0000-4000-8000-000000000004') INTO v_result;
  IF v_result IS DISTINCT FROM false OR (SELECT status FROM public."WorkspaceRunTask" WHERE id='launching-young') <> 'launching' THEN
    RAISE EXCEPTION 'young accepted launch was failed';
  END IF;
  SELECT public.fail_silent_accepted_workspace_run_task('replaced-token','space-1','00000000-0000-4000-8000-000000000098') INTO v_result;
  IF v_result IS DISTINCT FROM false OR (SELECT status FROM public."WorkspaceRunTask" WHERE id='replaced-token') <> 'launching' THEN
    RAISE EXCEPTION 'replaced launch token changed the current attempt';
  END IF;
  SELECT public.fail_silent_accepted_workspace_run_task('cancel-pending','space-1','00000000-0000-4000-8000-000000000006') INTO v_result;
  IF v_result IS DISTINCT FROM false OR (SELECT status FROM public."WorkspaceRunTask" WHERE id='cancel-pending') <> 'launching' THEN
    RAISE EXCEPTION 'cancellation-pending task was failed by timeout';
  END IF;
  SELECT public.fail_silent_accepted_workspace_run_task('unaccepted-old','space-1','00000000-0000-4000-8000-000000000007') INTO v_result;
  IF v_result IS DISTINCT FROM false OR (SELECT status FROM public."WorkspaceRunTask" WHERE id='unaccepted-old') <> 'launching' THEN
    RAISE EXCEPTION 'unaccepted task was failed by accepted-silence timeout';
  END IF;
  SELECT public.fail_silent_accepted_workspace_run_task('completed-old','space-1','00000000-0000-4000-8000-000000000008') INTO v_result;
  IF v_result IS DISTINCT FROM false OR (SELECT status FROM public."WorkspaceRunTask" WHERE id='completed-old') <> 'completed' THEN
    RAISE EXCEPTION 'completed task changed';
  END IF;
  SELECT public.fail_silent_accepted_workspace_run_task('failed-old','space-1','00000000-0000-4000-8000-000000000009') INTO v_result;
  IF v_result IS DISTINCT FROM false OR (SELECT status FROM public."WorkspaceRunTask" WHERE id='failed-old') <> 'failed' THEN
    RAISE EXCEPTION 'failed task changed';
  END IF;
  SELECT public.fail_silent_accepted_workspace_run_task('cancelled-old','space-1','00000000-0000-4000-8000-000000000010') INTO v_result;
  IF v_result IS DISTINCT FROM false OR (SELECT status FROM public."WorkspaceRunTask" WHERE id='cancelled-old') <> 'cancelled' THEN
    RAISE EXCEPTION 'cancelled task changed';
  END IF;
  SELECT public.fail_silent_accepted_workspace_run_task('legacy-started','space-1','00000000-0000-4000-8000-000000000011') INTO v_result;
  IF v_result IS DISTINCT FROM false OR (SELECT status FROM public."WorkspaceRunTask" WHERE id='legacy-started') <> 'launching' THEN
    RAISE EXCEPTION 'launching row with durable workspace_started evidence was failed';
  END IF;
END $$;
SQL

result_one="${pg_tmp}/timeout-one"
result_two="${pg_tmp}/timeout-two"
"${psql_cmd[@]}" -c "SET ROLE service_role; SELECT public.fail_silent_accepted_workspace_run_task('concurrent-old','space-1','00000000-0000-4000-8000-000000000012');" >"${result_one}" &
pid_one=$!
"${psql_cmd[@]}" -c "SET ROLE service_role; SELECT public.fail_silent_accepted_workspace_run_task('concurrent-old','space-1','00000000-0000-4000-8000-000000000012');" >"${result_two}" &
pid_two=$!
wait "${pid_one}"
wait "${pid_two}"

concurrent_results="$(sort "${result_one}" "${result_two}" | tr -d '[:space:]')"
if [[ "${concurrent_results}" != "ft" ]]; then
  echo "FAIL: concurrent timeout results were ${concurrent_results}, expected one false and one true" >&2
  exit 1
fi

"${psql_cmd[@]}" <<'SQL'
DO $$
BEGIN
  IF (SELECT status FROM public."WorkspaceRunTask" WHERE id='concurrent-old') <> 'failed' THEN
    RAISE EXCEPTION 'concurrent accepted-silence timeout did not terminal-fail once';
  END IF;
END $$;
SQL

echo "PASS: accepted-silence timeout was token-fenced, five-minute bounded, idempotent under concurrency, and service-role-only."
