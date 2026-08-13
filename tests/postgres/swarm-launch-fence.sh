#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
pg_bin="$(dirname "$(command -v postgres)")"
pg_tmp="$(mktemp -d "/tmp/chippi-swarm-launch-fence.XXXXXX")"
pg_data="${pg_tmp}/data"
pg_socket="${pg_tmp}/socket"
pg_log="${pg_tmp}/postgres.log"
pg_port="$((61000 + RANDOM % 1000))"

cleanup() {
  "${pg_bin}/pg_ctl" -D "${pg_data}" -m immediate stop >/dev/null 2>&1 || true
  if [[ "${pg_tmp}" == *"/chippi-swarm-launch-fence."* ]]; then
    /bin/rm -rf "${pg_tmp}"
  fi
}
trap cleanup EXIT

mkdir -p "${pg_socket}"
"${pg_bin}/initdb" -D "${pg_data}" -A trust -U postgres >/dev/null
"${pg_bin}/pg_ctl" -D "${pg_data}" -l "${pg_log}" -o "-k '${pg_socket}' -p ${pg_port} -c listen_addresses=''" -w start >/dev/null
psql_cmd=("${pg_bin}/psql" -X -qAt -v ON_ERROR_STOP=1 -h "${pg_socket}" -p "${pg_port}" -U postgres -d postgres)

"${psql_cmd[@]}" <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE ROLE untrusted;
CREATE TABLE public."Space" (id text PRIMARY KEY);
CREATE TABLE public."CustomAgent" (
  id text PRIMARY KEY,
  "spaceId" text NOT NULL REFERENCES public."Space"(id),
  "isActive" boolean NOT NULL DEFAULT true
);
CREATE TABLE public."SwarmRun" (
  id text PRIMARY KEY,
  "spaceId" text NOT NULL REFERENCES public."Space"(id),
  "conversationId" text,
  goal text NOT NULL,
  status text NOT NULL,
  plan jsonb,
  result text,
  "errorMessage" text,
  "totalCostCents" integer NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "completedAt" timestamptz
);
CREATE TABLE public."SwarmMember" (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "swarmRunId" text NOT NULL REFERENCES public."SwarmRun"(id),
  "customAgentId" text,
  name text NOT NULL,
  role text,
  "systemPrompt" text NOT NULL DEFAULT '',
  task text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  output text,
  wave integer NOT NULL DEFAULT 1,
  "costCents" integer NOT NULL DEFAULT 0,
  "startedAt" timestamptz,
  "completedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public."SwarmEvent" (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "swarmRunId" text NOT NULL REFERENCES public."SwarmRun"(id),
  "memberId" text REFERENCES public."SwarmMember"(id),
  type text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
SQL

"${psql_cmd[@]}" -f "${repo_root}/supabase/migrations/20260915000016_swarm_launch_fence.sql"

"${psql_cmd[@]}" <<'SQL'
INSERT INTO public."Space"(id) VALUES ('space-1');
INSERT INTO public."CustomAgent"(id,"spaceId") VALUES ('agent-1','space-1');
INSERT INTO public."SwarmRun"(id,"spaceId",goal,status,"createdAt")
VALUES ('run-terminal','space-1','Done','completed',now()-interval '1 hour');

DO $$
DECLARE
  v_state text;
  v_member jsonb;
  v_member_id text;
  run_1 CONSTANT text := '12060da9-b26e-47f0-8056-803441ab721b';
  run_2 CONSTANT text := '6f4aa9f2-4e8e-441c-8679-cd64dabf0b43';
  token_1 CONSTANT text := '95945bee-15a4-47ee-86ae-ccf23ac224b9';
  token_2 CONSTANT text := '88fbbfe0-134b-46ec-8ae0-af415d05a18b';
  stale_token CONSTANT text := '0c57b877-55a8-4c21-87cb-37ee133546a8';
BEGIN
  SELECT public.create_claimed_swarm_run(
    run_1,'space-1','Goal one','',ARRAY['agent-1'],token_1
  ) INTO v_state;
  IF v_state <> 'claimed' THEN RAISE EXCEPTION 'first run did not atomically create+claim: %',v_state; END IF;
  SELECT public.create_claimed_swarm_run(
    run_2,'space-1','Goal two','',ARRAY[]::text[],token_2
  ) INTO v_state;
  IF v_state <> 'concurrent' THEN RAISE EXCEPTION 'distinct active run was not blocked'; END IF;

  SELECT public.claim_swarm_launch(run_1,'space-1',token_1) INTO v_state;
  IF v_state <> 'claimed' THEN RAISE EXCEPTION 'same token redelivery lost its claim'; END IF;
  SELECT public.claim_swarm_launch(run_1,'space-1',stale_token) INTO v_state;
  IF v_state <> 'stale' THEN RAISE EXCEPTION 'different token was not stale'; END IF;
  SELECT public.accept_swarm_launch(run_1,'space-1',stale_token) INTO v_state;
  IF v_state <> 'stale' THEN RAISE EXCEPTION 'stale token accepted'; END IF;
  SELECT public.accept_swarm_launch(run_1,'space-1',token_1) INTO v_state;
  IF v_state <> 'accepted' THEN RAISE EXCEPTION 'current token was not accepted'; END IF;
  SELECT public.accept_swarm_launch(run_1,'space-1',token_1) INTO v_state;
  IF v_state <> 'duplicate' THEN RAISE EXCEPTION 'same token could spawn twice'; END IF;

  IF public.transition_fenced_swarm_run(
    run_1,'space-1',stale_token,ARRAY['queued'],'planning',NULL,NULL,NULL,NULL,
    'swarm_planning','{"message":"stale"}'::jsonb
  ) THEN RAISE EXCEPTION 'stale run transition published'; END IF;
  IF NOT public.transition_fenced_swarm_run(
    run_1,'space-1',token_1,ARRAY['queued'],'planning',NULL,NULL,NULL,NULL,
    'swarm_planning','{"message":"current"}'::jsonb
  ) THEN RAISE EXCEPTION 'current planning transition failed'; END IF;
  IF NOT public.transition_fenced_swarm_run(
    run_1,'space-1',token_1,ARRAY['planning'],'running','{"tasks":[]}'::jsonb
  ) THEN RAISE EXCEPTION 'current running transition failed'; END IF;

  SELECT public.insert_fenced_swarm_member(
    run_1,'space-1',stale_token,'Member','Role','','Task',1
  ) INTO v_member;
  IF v_member IS NOT NULL THEN RAISE EXCEPTION 'stale member inserted'; END IF;
  SELECT public.insert_fenced_swarm_member(
    run_1,'space-1',token_1,'Member','Role','','Task',1,'agent-1'
  ) INTO v_member;
  v_member_id := v_member->>'id';
  IF v_member_id IS NULL THEN RAISE EXCEPTION 'current member not inserted'; END IF;

  IF public.insert_fenced_swarm_event(
    run_1,'space-1',stale_token,ARRAY['running'],'wave_2_starting','{}'::jsonb
  ) THEN RAISE EXCEPTION 'stale event published'; END IF;
  IF public.transition_fenced_swarm_member(
    run_1,'space-1',stale_token,v_member_id,ARRAY['queued'],'running',
    'agent_started','{}'::jsonb
  ) THEN RAISE EXCEPTION 'stale member transition published'; END IF;
  IF NOT public.transition_fenced_swarm_member(
    run_1,'space-1',token_1,v_member_id,ARRAY['queued'],'running',
    'agent_started','{}'::jsonb
  ) THEN RAISE EXCEPTION 'current member transition failed'; END IF;

  UPDATE public."SwarmRun"
  SET "modalAcceptedAt"=now()-interval '12 minutes',"launchUpdatedAt"=now()
  WHERE id=run_1;
  IF public.fail_stale_swarm_launch(run_1,'space-1',stale_token) THEN
    RAISE EXCEPTION 'stale timeout token won';
  END IF;
  IF NOT public.fail_stale_swarm_launch(run_1,'space-1',token_1) THEN
    RAISE EXCEPTION 'current bounded timeout did not fail';
  END IF;
  IF public.fail_stale_swarm_launch(run_1,'space-1',token_1) THEN
    RAISE EXCEPTION 'timeout replay mutated terminal state';
  END IF;

  IF (SELECT status FROM public."SwarmRun" WHERE id=run_1) <> 'failed'
    OR (SELECT count(*) FROM public."SwarmEvent" WHERE "swarmRunId"=run_1 AND type='swarm_failed') <> 1
    OR (SELECT count(*) FROM public."SwarmEvent" WHERE "swarmRunId"=run_1 AND data->>'message'='stale') <> 0
    OR (SELECT count(*) FROM public."SwarmMember" WHERE "swarmRunId"=run_1) <> 1
  THEN RAISE EXCEPTION 'terminal or stale-publication evidence invalid'; END IF;

  SELECT public.create_claimed_swarm_run(
    run_2,'space-1','Goal two','',ARRAY[]::text[],token_2
  ) INTO v_state;
  IF v_state <> 'claimed' THEN RAISE EXCEPTION 'space slot did not reopen'; END IF;
  SELECT public.claim_swarm_launch('run-terminal','space-1',token_1) INTO v_state;
  IF v_state <> 'terminal' THEN RAISE EXCEPTION 'terminal legacy run changed'; END IF;

  IF has_function_privilege('untrusted','public.claim_swarm_launch(text,text,text)','EXECUTE')
    OR has_function_privilege('anon','public.claim_swarm_launch(text,text,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.claim_swarm_launch(text,text,text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.claim_swarm_launch(text,text,text)','EXECUTE')
  THEN RAISE EXCEPTION 'claim privilege boundary invalid'; END IF;
END;
$$;
SQL

echo "PASS: SwarmRun durable claim, duplicate no-op, DB concurrency, token fencing, and timeout."
