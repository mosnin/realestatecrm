#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
pg_bin="$(dirname "$(command -v postgres)")"
pg_tmp="$(mktemp -d "${TMPDIR:-/tmp}/chippi-plan-claim.XXXXXX")"
pg_data="${pg_tmp}/data"
pg_socket="${pg_tmp}/socket"
pg_port="$((60000 + RANDOM % 1000))"

cleanup() {
  "${pg_bin}/pg_ctl" -D "${pg_data}" -m immediate stop >/dev/null 2>&1 || true
  if [[ "${pg_tmp}" == *"/chippi-plan-claim."* ]]; then
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
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE TABLE public."User" (id text PRIMARY KEY, "clerkId" text NOT NULL);
CREATE TABLE public."Space" (id text PRIMARY KEY, "ownerId" text NOT NULL REFERENCES public."User"(id));
CREATE TABLE public."WorkspaceRun" (
  id text PRIMARY KEY,
  "spaceId" text NOT NULL REFERENCES public."Space"(id),
  status text NOT NULL
);
CREATE TABLE public."File" (
  id text PRIMARY KEY, "spaceId" text NOT NULL REFERENCES public."Space"(id),
  "userId" text NOT NULL, "storageKey" text NOT NULL, name text NOT NULL,
  "mimeType" text NOT NULL, category text NOT NULL, "sizeBytes" integer NOT NULL,
  "isPublic" boolean NOT NULL
);
SQL

for migration in \
  20260915000000_workspace_run_follow_up_tasks.sql \
  20260915000001_workspace_run_task_programs_and_cancel.sql \
  20260915000002_workspace_run_task_declarative_plans.sql \
  20260915000003_workspace_run_task_idempotency_conflict.sql \
  20260915000004_workspace_run_typed_artifacts.sql \
  20260915000011_workspace_continuation_plan_claim.sql
do
  "${psql_cmd[@]}" -f "${repo_root}/supabase/migrations/${migration}"
done

"${psql_cmd[@]}" <<'SQL'
INSERT INTO public."User"(id,"clerkId") VALUES ('owner-1','clerk-owner-1');
INSERT INTO public."Space"(id,"ownerId") VALUES ('space-1','owner-1');
INSERT INTO public."WorkspaceRun"(id,"spaceId",status) VALUES
  ('run-1','space-1','completed'),
  ('run-2','space-1','completed');

DO $$
DECLARE v_row record; v_bool boolean;
BEGIN
  IF has_function_privilege('anon','reserve_workspace_run_task_plan(text,text,text,text,text,integer)','EXECUTE')
    OR has_function_privilege('authenticated','reserve_workspace_run_task_plan(text,text,text,text,text,integer)','EXECUTE')
    OR has_function_privilege('anon','release_workspace_run_task_plan(text,text,text,text)','EXECUTE')
    OR has_function_privilege('authenticated','release_workspace_run_task_plan(text,text,text,text)','EXECUTE')
    OR has_function_privilege('anon','enqueue_reserved_workspace_run_task_with_plan(text,text,text,text,text,jsonb,jsonb,text)','EXECUTE')
    OR has_function_privilege('authenticated','enqueue_reserved_workspace_run_task_with_plan(text,text,text,text,text,jsonb,jsonb,text)','EXECUTE')
  THEN
    RAISE EXCEPTION 'client role can execute a planning reservation RPC';
  END IF;
  IF NOT has_function_privilege('service_role','reserve_workspace_run_task_plan(text,text,text,text,text,integer)','EXECUTE')
    OR NOT has_function_privilege('service_role','release_workspace_run_task_plan(text,text,text,text)','EXECUTE')
    OR NOT has_function_privilege('service_role','enqueue_reserved_workspace_run_task_with_plan(text,text,text,text,text,jsonb,jsonb,text)','EXECUTE')
  THEN
    RAISE EXCEPTION 'service role cannot execute a planning reservation RPC';
  END IF;

  SELECT * INTO v_row FROM reserve_workspace_run_task_plan(
    'run-1','space-1','plan-claim-key-0001','Prepare seller review','planning-token-0001',180
  );
  IF v_row.state <> 'claimed' OR v_row."planningToken" <> 'planning-token-0001' THEN
    RAISE EXCEPTION 'initial planning reservation failed';
  END IF;

  SELECT * INTO v_row FROM reserve_workspace_run_task_plan(
    'run-1','space-1','plan-claim-key-0001','  Prepare   seller review  ','planning-token-0002',180
  );
  IF v_row.state <> 'pending' OR v_row."planningToken" IS NOT NULL THEN
    RAISE EXCEPTION 'same-instruction duplicate did not wait';
  END IF;

  BEGIN
    PERFORM reserve_workspace_run_task_plan(
      'run-1','space-1','plan-claim-key-0001','Prepare buyer review','planning-token-0003',180
    );
    RAISE EXCEPTION 'different instruction reused an idempotency key';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'workspace continuation idempotency conflict' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM reserve_workspace_run_task_plan(
      'run-1','space-1','plan-claim-key-0002','Prepare another review','planning-token-0004',180
    );
    RAISE EXCEPTION 'parallel planning key bypassed the active claim';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'workspace continuation already active' THEN RAISE; END IF;
  END;

  SELECT release_workspace_run_task_plan(
    'run-1','space-1','plan-claim-key-0001','wrong-token-000000'
  ) INTO v_bool;
  IF v_bool IS DISTINCT FROM false THEN RAISE EXCEPTION 'wrong token released planning'; END IF;
  SELECT release_workspace_run_task_plan(
    'run-1','space-1','plan-claim-key-0001','planning-token-0001'
  ) INTO v_bool;
  IF v_bool IS DISTINCT FROM true THEN RAISE EXCEPTION 'current token did not release planning'; END IF;

  SELECT * INTO v_row FROM reserve_workspace_run_task_plan(
    'run-1','space-1','plan-claim-key-0001','Prepare seller review','planning-token-0005',180
  );
  IF v_row.state <> 'claimed' OR v_row."planningToken" <> 'planning-token-0005' THEN
    RAISE EXCEPTION 'released planning lease was not reclaimable';
  END IF;

  BEGIN
    PERFORM enqueue_reserved_workspace_run_task_with_plan(
      'run-1','space-1','task-stale','plan-claim-key-0001','Prepare seller review',
      '[{"command":"inspect","description":"Inspect"}]'::jsonb,
      '{"summary":"Grounded","title":"Review","evidence":[{"file":"brief.md","quote":"Grounded"}],"nextSteps":["Review"]}'::jsonb,
      'planning-token-0001'
    );
    RAISE EXCEPTION 'stale planner published a task';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'workspace continuation planning reservation is stale' THEN RAISE; END IF;
  END;

  SELECT * INTO v_row FROM enqueue_reserved_workspace_run_task_with_plan(
    'run-1','space-1','task-current','plan-claim-key-0001','Prepare seller review',
    '[{"command":"inspect","description":"Inspect"}]'::jsonb,
    '{"summary":"Grounded","title":"Review","evidence":[{"file":"brief.md","quote":"Grounded"}],"nextSteps":["Review"]}'::jsonb,
    'planning-token-0005'
  );
  IF v_row."taskId" <> 'task-current' OR v_row.created IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'current planning token did not publish';
  END IF;
  IF EXISTS (SELECT 1 FROM "WorkspaceRunTaskPlanClaim" WHERE "runId"='run-1') THEN
    RAISE EXCEPTION 'committed enqueue did not consume its planning claim';
  END IF;

  SELECT * INTO v_row FROM enqueue_reserved_workspace_run_task_with_plan(
    'run-1','space-1','task-lost-response','plan-claim-key-0001','Prepare seller review',
    '[{"command":"inspect","description":"Inspect"}]'::jsonb,
    '{"summary":"Grounded","title":"Review","evidence":[{"file":"brief.md","quote":"Grounded"}],"nextSteps":["Review"]}'::jsonb,
    'planning-token-0005'
  );
  IF v_row."taskId" <> 'task-current' OR v_row.created IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'committed-response retry did not reuse the task';
  END IF;

  SELECT * INTO v_row FROM reserve_workspace_run_task_plan(
    'run-2','space-1','plan-claim-key-0003','Prepare lease review','planning-token-0006',30
  );
  UPDATE "WorkspaceRunTaskPlanClaim" SET "leaseExpiresAt"=now()-interval '1 second'
  WHERE "runId"='run-2' AND "idempotencyKey"='plan-claim-key-0003';
  SELECT * INTO v_row FROM reserve_workspace_run_task_plan(
    'run-2','space-1','plan-claim-key-0003','Prepare lease review','planning-token-0007',30
  );
  IF v_row.state <> 'claimed' OR v_row."planningToken" <> 'planning-token-0007' THEN
    RAISE EXCEPTION 'crashed planning lease was not reclaimable';
  END IF;

  BEGIN
    PERFORM enqueue_workspace_run_task(
      'run-2','space-1','task-unfenced','unfenced-key-00001','Prepare unsafe review',
      '[{"command":"inspect","description":"Inspect"}]'::jsonb
    );
    RAISE EXCEPTION 'legacy unfenced enqueue remained usable';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'workspace continuation planning reservation required' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM enqueue_workspace_run_task_with_plan(
      'run-2','space-1','task-unfenced','unfenced-key-00001','Prepare unsafe review',
      '[{"command":"inspect","description":"Inspect"}]'::jsonb,
      '{"summary":"Grounded","title":"Review","evidence":[{"file":"brief.md","quote":"Grounded"}],"nextSteps":["Review"]}'::jsonb
    );
    RAISE EXCEPTION 'legacy unfenced plan enqueue remained usable';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'workspace continuation planning reservation required' THEN RAISE; END IF;
  END;
END $$;
SQL

echo "PASS: planning is atomically reserved before billing, duplicate/conflicting requests are fenced, leases recover, and only the current token can enqueue."
