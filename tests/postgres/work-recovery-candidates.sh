#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
pg_bin="$(dirname "$(command -v postgres)")"
pg_tmp="$(mktemp -d "/tmp/chippi-work-recovery.XXXXXX")"
pg_data="${pg_tmp}/data"
pg_socket="${pg_tmp}/socket"
pg_log="${pg_tmp}/postgres.log"
pg_port="$((57000 + RANDOM % 1000))"

cleanup() {
  "${pg_bin}/pg_ctl" -D "${pg_data}" -m immediate stop >/dev/null 2>&1 || true
  if [[ "${pg_tmp}" == *"/chippi-work-recovery."* ]]; then
    /bin/rm -rf "${pg_tmp}"
  fi
}
trap cleanup EXIT

mkdir -p "${pg_socket}"
"${pg_bin}/initdb" -D "${pg_data}" -A trust -U postgres >/dev/null
if ! "${pg_bin}/pg_ctl" -D "${pg_data}" -l "${pg_log}" \
  -o "-k '${pg_socket}' -p ${pg_port} -c listen_addresses=''" -w start >/dev/null; then
  /bin/cat "${pg_log}"
  exit 1
fi
psql_cmd=("${pg_bin}/psql" -X -qAt -v ON_ERROR_STOP=1 -h "${pg_socket}" -p "${pg_port}" -U postgres -d postgres)

"${psql_cmd[@]}" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE ROLE outsider NOLOGIN;

CREATE TABLE public."Space" (id text PRIMARY KEY);
CREATE TABLE public."WorkSession" (
  id text PRIMARY KEY,
  "spaceId" text NOT NULL REFERENCES public."Space"(id),
  kind text NOT NULL,
  status text NOT NULL,
  "phaseClaimToken" text,
  "phaseClaimKind" text,
  "phaseClaimKey" text,
  "phaseLeaseExpiresAt" timestamptz,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
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

CREATE OR REPLACE FUNCTION public.fail_silent_accepted_workspace_run_task(
  p_task_id text,
  p_space_id text,
  p_launch_token text
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE "WorkspaceRunTask"
  SET status = 'failed', "updatedAt" = now()
  WHERE id = p_task_id
    AND "spaceId" = p_space_id
    AND status IN ('launching','running')
    AND "launchToken" = p_launch_token
    AND (
      (status='launching' AND "modalAcceptedAt" < now()-interval '5 minutes')
      OR (status='running' AND "updatedAt" < now()-interval '5 minutes')
    )
    AND "cancellationRequestedAt" IS NULL;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_workspace_run_task_launch(
  p_task_id text,
  p_space_id text,
  p_token text
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE "WorkspaceRunTask" AS task
  SET status = 'launching',
      "launchToken" = p_token,
      "launchLeaseExpiresAt" = now() + interval '2 minutes',
      "updatedAt" = now()
  FROM "WorkspaceRun" AS run
  WHERE task.id = p_task_id
    AND task."spaceId" = p_space_id
    AND task."runId" = run.id
    AND run."spaceId" = p_space_id
    AND run.status = 'completed'
    AND task.status = 'queued'
    AND task."cancellationRequestedAt" IS NULL;
  RETURN FOUND;
END;
$$;

GRANT SELECT ON public."WorkSession", public."WorkspaceRun", public."WorkspaceRunTask" TO service_role;
GRANT UPDATE ON public."WorkspaceRunTask" TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_workspace_run_task_launch(text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_silent_accepted_workspace_run_task(text,text,text) TO service_role;
SQL

"${psql_cmd[@]}" -f "${repo_root}/supabase/migrations/20260915000015_work_recovery_candidates.sql"

"${psql_cmd[@]}" <<'SQL'
INSERT INTO public."Space"(id) VALUES ('space-1'), ('space-2');
INSERT INTO public."WorkSession"(
  id,"spaceId",kind,status,"phaseClaimToken","phaseClaimKind","phaseClaimKey",
  "phaseLeaseExpiresAt","updatedAt"
) VALUES
  ('research-plan','space-1','research','planning',NULL,NULL,NULL,NULL,now()-interval '11 minutes'),
  ('research-running','space-1','research','running',NULL,NULL,NULL,NULL,now()-interval '20 minutes'),
  ('research-active','space-1','research','running','active-token','step','s1',now()+interval '1 minute',now()-interval '20 minutes'),
  ('research-expired','space-1','research','running','expired-token','step','s1',now()-interval '1 minute',now()-interval '20 minutes'),
  ('research-young','space-1','research','running',NULL,NULL,NULL,NULL,now()-interval '9 minutes'),
  ('workspace-kind','space-1','workspace','running',NULL,NULL,NULL,NULL,now()-interval '20 minutes'),
  ('research-terminal','space-1','research','completed',NULL,NULL,NULL,NULL,now()-interval '20 minutes');

INSERT INTO public."WorkspaceRun"(id,"spaceId",status) VALUES
  ('run-completed-1','space-1','completed'),
  ('run-completed-2','space-2','completed'),
  ('run-running','space-1','running');
INSERT INTO public."WorkspaceRunTask"(
  id,"runId","spaceId",status,"cancellationRequestedAt","updatedAt"
) VALUES
  ('task-stale','run-completed-1','space-1','queued',NULL,now()-interval '3 minutes'),
  ('task-young','run-completed-1','space-1','queued',NULL,now()-interval '1 minute'),
  ('task-cancelling','run-completed-1','space-1','queued',now()-interval '1 minute',now()-interval '3 minutes'),
  ('task-launching','run-completed-1','space-1','launching',NULL,now()-interval '3 minutes'),
  ('task-parent-live','run-running','space-1','queued',NULL,now()-interval '3 minutes'),
  ('task-other-space','run-completed-2','space-2','queued',NULL,now()-interval '3 minutes'),
  ('task-accepted-launching','run-completed-1','space-1','launching',NULL,now()-interval '7 minutes'),
  ('task-accepted-running','run-completed-1','space-1','running',NULL,now()-interval '7 minutes'),
  ('task-accepted-young','run-completed-1','space-1','running',NULL,now()-interval '4 minutes'),
  ('task-running-active','run-completed-1','space-1','running',NULL,now()-interval '1 minute'),
  ('task-launching-recent-update','run-completed-1','space-1','launching',NULL,now()-interval '1 minute');
UPDATE public."WorkspaceRunTask"
SET "launchToken"='accepted-launching-token', "modalAcceptedAt"=now()-interval '7 minutes'
WHERE id='task-accepted-launching';
UPDATE public."WorkspaceRunTask"
SET "launchToken"='accepted-running-token', "modalAcceptedAt"=now()-interval '7 minutes'
WHERE id='task-accepted-running';
UPDATE public."WorkspaceRunTask"
SET "launchToken"='accepted-young-token', "modalAcceptedAt"=now()-interval '4 minutes'
WHERE id='task-accepted-young';
UPDATE public."WorkspaceRunTask"
SET "launchToken"='running-active-token', "modalAcceptedAt"=now()-interval '20 minutes'
WHERE id='task-running-active';
UPDATE public."WorkspaceRunTask"
SET "launchToken"='launching-recent-update-token', "modalAcceptedAt"=now()-interval '7 minutes'
WHERE id='task-launching-recent-update';

DO $$
DECLARE
  v_research jsonb;
  v_tasks jsonb;
BEGIN
  SELECT jsonb_object_agg(candidate."sessionId", candidate.action)
  INTO v_research
  FROM public.list_research_work_session_recovery_candidates(25) AS candidate;
  IF v_research <> '{
    "research-plan":"plan",
    "research-running":"advance",
    "research-expired":"advance"
  }'::jsonb THEN
    RAISE EXCEPTION 'research recovery candidates were unsafe: %', v_research;
  END IF;

  SELECT jsonb_object_agg(candidate."taskId", candidate.action)
  INTO v_tasks
  FROM public.list_workspace_run_task_recovery_candidates(25, ARRAY['space-1']) AS candidate;
  IF v_tasks <> '{
    "task-stale":"dispatch",
    "task-accepted-launching":"fail_accepted_silent",
    "task-accepted-running":"fail_accepted_silent",
    "task-launching-recent-update":"fail_accepted_silent"
  }'::jsonb THEN
    RAISE EXCEPTION 'workspace task recovery candidates were unsafe: %', v_tasks;
  END IF;

  IF (SELECT count(*) FROM public.list_workspace_run_task_recovery_candidates(999, ARRAY['space-1','space-2'])) > 25
  THEN
    RAISE EXCEPTION 'workspace task recovery batch was not bounded';
  END IF;

  IF has_function_privilege('outsider','public.list_research_work_session_recovery_candidates(integer)','EXECUTE')
    OR has_function_privilege('anon','public.list_research_work_session_recovery_candidates(integer)','EXECUTE')
    OR has_function_privilege('authenticated','public.list_research_work_session_recovery_candidates(integer)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.list_research_work_session_recovery_candidates(integer)','EXECUTE')
  THEN
    RAISE EXCEPTION 'research recovery RPC ACL is not service-role-only';
  END IF;
  IF has_function_privilege('outsider','public.list_workspace_run_task_recovery_candidates(integer,text[])','EXECUTE')
    OR has_function_privilege('anon','public.list_workspace_run_task_recovery_candidates(integer,text[])','EXECUTE')
    OR has_function_privilege('authenticated','public.list_workspace_run_task_recovery_candidates(integer,text[])','EXECUTE')
    OR NOT has_function_privilege('service_role','public.list_workspace_run_task_recovery_candidates(integer,text[])','EXECUTE')
  THEN
    RAISE EXCEPTION 'workspace task recovery RPC ACL is not service-role-only';
  END IF;
END;
$$;

DO $$
BEGIN
  BEGIN
    SET LOCAL ROLE outsider;
    PERFORM public.list_research_work_session_recovery_candidates(25);
    RAISE EXCEPTION 'outsider executed research recovery RPC';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;

SET ROLE service_role;
DO $$
BEGIN
  IF public.claim_workspace_run_task_launch('task-stale','space-1','claim-one') IS DISTINCT FROM true
    OR public.claim_workspace_run_task_launch('task-stale','space-1','claim-two') IS DISTINCT FROM false
  THEN
    RAISE EXCEPTION 'queued workspace task claim did not fence duplicate execution';
  END IF;
  IF public.fail_silent_accepted_workspace_run_task(
    'task-accepted-running','space-1','stale-token'
  ) IS DISTINCT FROM false
    OR public.fail_silent_accepted_workspace_run_task(
      'task-accepted-running','space-1','accepted-running-token'
    ) IS DISTINCT FROM true
  THEN
    RAISE EXCEPTION 'accepted task timeout was not token-fenced';
  END IF;
END;
$$;
RESET ROLE;

DO $$
BEGIN
  IF (SELECT status FROM public."WorkspaceRunTask" WHERE id='task-stale') <> 'launching'
    OR EXISTS (
      SELECT 1 FROM public.list_workspace_run_task_recovery_candidates(25, ARRAY['space-1'])
      WHERE "taskId"='task-stale'
    )
  THEN
    RAISE EXCEPTION 'claimed task remained recoverable';
  END IF;
END;
$$;
SQL

echo "PASS: work recovery candidates are bounded, conservative, claim-safe, and service-role-only."
