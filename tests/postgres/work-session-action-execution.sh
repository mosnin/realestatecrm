#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
pg_bin="$(dirname "$(command -v postgres)")"
pg_tmp="$(mktemp -d "${TMPDIR:-/tmp}/chippi-ws-action.XXXXXX")"
pg_data="${pg_tmp}/data"
pg_socket="${pg_tmp}/socket"
pg_port="$((58000 + RANDOM % 1000))"

cleanup() {
  "${pg_bin}/pg_ctl" -D "${pg_data}" -m immediate stop >/dev/null 2>&1 || true
  if [[ "${pg_tmp}" == *"/chippi-ws-action."* ]]; then
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
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;

CREATE TABLE public."User" (
  id text PRIMARY KEY,
  "clerkId" text NOT NULL UNIQUE
);
CREATE TABLE public."Space" (
  id text PRIMARY KEY,
  "ownerId" text NOT NULL REFERENCES public."User"(id)
);
CREATE TABLE public."WorkSession" (
  id text PRIMARY KEY,
  "spaceId" text NOT NULL REFERENCES public."Space"(id),
  status text NOT NULL,
  kind text DEFAULT 'research',
  plan jsonb NOT NULL DEFAULT '[]'::jsonb,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  question text,
  summary text,
  "artifactFileId" text,
  "artifactName" text,
  error text,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "completedAt" timestamptz
);
CREATE TABLE public."File" (
  id text PRIMARY KEY,
  "spaceId" text NOT NULL REFERENCES public."Space"(id),
  "userId" text NOT NULL,
  "storageKey" text NOT NULL UNIQUE,
  name text NOT NULL,
  "mimeType" text NOT NULL,
  category text NOT NULL,
  "sizeBytes" bigint NOT NULL,
  "isPublic" boolean NOT NULL DEFAULT false
);
CREATE TABLE public."WorkSessionAction" (
  id text PRIMARY KEY,
  "sessionId" text NOT NULL REFERENCES public."WorkSession"(id),
  "spaceId" text NOT NULL REFERENCES public."Space"(id),
  tool text NOT NULL,
  args jsonb NOT NULL,
  summary text NOT NULL,
  rationale text,
  status text NOT NULL,
  result jsonb,
  error text,
  "decidedByUserId" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "decidedAt" timestamptz,
  "executedAt" timestamptz
);

INSERT INTO public."User"(id,"clerkId") VALUES ('owner-1','clerk-owner-1');
INSERT INTO public."Space"(id,"ownerId") VALUES ('space-1','owner-1');
SQL

"${psql_cmd[@]}" -f "${repo_root}/supabase/migrations/20260915000008_work_session_phase_claims.sql"
"${psql_cmd[@]}" -f "${repo_root}/supabase/migrations/20260915000021_work_session_atomic_finalization.sql"
"${psql_cmd[@]}" <<'SQL'
-- Historical split-writer corruption: completed parent with an approved child.
INSERT INTO public."WorkSession"(id,"spaceId",status,"completedAt")
VALUES ('completed-with-approved','space-1','completed',now());
INSERT INTO public."WorkSessionAction"(id,"sessionId","spaceId",tool,args,summary,status)
VALUES ('completed-approved-action','completed-with-approved','space-1','send_email','{}','ambiguous','approved');
SQL
"${psql_cmd[@]}" -f "${repo_root}/supabase/migrations/20260915000024_work_session_action_execution_leases.sql"

"${psql_cmd[@]}" <<'SQL'
DO $$
BEGIN
  IF has_function_privilege('public', 'public.claim_work_session_action_execution(text,text,text,text,integer)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.claim_work_session_action_execution(text,text,text,text,integer)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.claim_work_session_action_execution(text,text,text,text,integer)', 'EXECUTE')
    OR has_function_privilege('public', 'public.finish_claimed_work_session_action_execution(text,text,text,text,text,jsonb,text,boolean)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.list_recoverable_work_session_actions(integer)', 'EXECUTE')
  THEN RAISE EXCEPTION 'durable action authority leaked execute privilege'; END IF;
  IF NOT has_function_privilege('service_role', 'public.claim_work_session_action_execution(text,text,text,text,integer)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.finish_claimed_work_session_action_execution(text,text,text,text,text,jsonb,text,boolean)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.release_work_session_action_execution_claim(text,text,text,text,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.list_recoverable_work_session_actions(integer)', 'EXECUTE')
  THEN RAISE EXCEPTION 'service role lacks durable action authority'; END IF;

  BEGIN
    PERFORM * FROM public.claim_work_session_action_execution(
      'missing','missing','space-1',NULL::text,120
    );
    RAISE EXCEPTION 'null claim token did not fail closed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%invalid WorkSession action execution claim%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM * FROM public.list_recoverable_work_session_actions(NULL::integer);
    RAISE EXCEPTION 'null recovery limit did not fail closed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%invalid WorkSession action recovery limit%' THEN RAISE; END IF;
  END;
END $$;

DO $$
DECLARE v_claim record;
BEGIN
  IF (SELECT status FROM public."WorkSession" WHERE id='completed-with-approved') <> 'awaiting_actions'
  THEN RAISE EXCEPTION 'completed parent with approved child was not reopened for recovery'; END IF;
  SELECT * INTO v_claim FROM public.claim_work_session_action_execution(
    'completed-with-approved','completed-approved-action','space-1',
    '70000000-0000-4000-8000-000000000007',120
  );
  IF v_claim.disposition <> 'reconciliation_required'
    OR (SELECT status FROM public."WorkSessionAction" WHERE id='completed-approved-action') <> 'failed'
    OR (SELECT status FROM public."WorkSession" WHERE id='completed-with-approved') <> 'completed'
  THEN RAISE EXCEPTION 'reopened ambiguous approval did not reconcile and settle'; END IF;
END $$;

-- Rolling deploy fence: the historical approve authority can no longer hand
-- an unkeyed old executor a newly-approved action. V2 writes the stable key.
INSERT INTO public."WorkSession"(id,"spaceId",status) VALUES
  ('decision-old','space-1','awaiting_actions'),
  ('decision-v2','space-1','awaiting_actions');
INSERT INTO public."WorkSessionAction"(id,"sessionId","spaceId",tool,args,summary,status) VALUES
  ('decision-old-action','decision-old','space-1','send_email','{}','old','proposed'),
  ('decision-v2-action','decision-v2','space-1','send_email','{}','v2','proposed');

DO $$
DECLARE v_count integer; v_claim record; v_expected text;
BEGIN
  SELECT count(*) INTO v_count FROM public.claim_work_session_action_decision(
    'decision-old','decision-old-action','space-1','approve','clerk-owner-1'
  );
  IF v_count <> 0 OR (SELECT status FROM public."WorkSessionAction" WHERE id='decision-old-action') <> 'proposed'
  THEN RAISE EXCEPTION 'historical approve authority did not fail closed'; END IF;
  BEGIN
    UPDATE public."WorkSessionAction"
    SET status='approved', "decidedAt"=now()
    WHERE id='decision-old-action';
    RAISE EXCEPTION 'old direct approval did not raise';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%durable v2 authority%' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public."WorkSessionAction"
    SET status='approved',
        "executionIdempotencyKey"='work-session-action-00000000000000000000000000000000'
    WHERE id='decision-old-action';
    RAISE EXCEPTION 'forged durable approval key did not raise';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%durable v2 authority%' THEN RAISE; END IF;
  END;

  SELECT * INTO v_claim FROM public.claim_work_session_action_decision_v2(
    'decision-v2','decision-v2-action','space-1','approve','clerk-owner-1'
  );
  v_expected := 'work-session-action-' || md5('decision-v2-action');
  IF v_claim.status <> 'approved'
    OR (SELECT "executionIdempotencyKey" FROM public."WorkSessionAction" WHERE id='decision-v2-action') <> v_expected
  THEN RAISE EXCEPTION 'v2 approval did not atomically bind the provider key'; END IF;

  BEGIN
    UPDATE public."WorkSessionAction"
    SET status='executed', "executedAt"=now()
    WHERE id='decision-v2-action';
    RAISE EXCEPTION 'old direct finish did not raise';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%requires an execution lease%' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public."WorkSession" SET status='completed' WHERE id='decision-v2';
    RAISE EXCEPTION 'old direct parent completion did not raise';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%still has unsettled actions%' THEN RAISE; END IF;
  END;
END $$;

-- An approved row from before this migration may already have emitted its
-- side effect. It is terminally flagged for reconciliation without a claim.
INSERT INTO public."WorkSession"(id,"spaceId",status)
VALUES ('legacy-parent','space-1','awaiting_actions');
INSERT INTO public."WorkSessionAction"(id,"sessionId","spaceId",tool,args,summary,status)
VALUES ('legacy-action','legacy-parent','space-1','send_email','{}','legacy','approved');
DO $$
DECLARE v_claim record;
BEGIN
  SELECT * INTO v_claim FROM public.claim_work_session_action_execution(
    'legacy-parent','legacy-action','space-1','00000000-0000-4000-8000-000000000001',120
  );
  IF v_claim.disposition <> 'reconciliation_required'
    OR (SELECT status FROM public."WorkSessionAction" WHERE id='legacy-action') <> 'failed'
    OR (SELECT "reconciliationRequiredAt" FROM public."WorkSessionAction" WHERE id='legacy-action') IS NULL
    OR (SELECT status FROM public."WorkSession" WHERE id='legacy-parent') <> 'completed'
  THEN RAISE EXCEPTION 'legacy approval was not quarantined for reconciliation'; END IF;
END $$;

-- Concurrent deliveries contend on the parent/action row. The first token
-- wins; after its transaction commits the second sees a live lease and gets no
-- authority. This is an actual two-connection race, not a sequential mock.
INSERT INTO public."WorkSession"(id,"spaceId",status)
VALUES ('race-parent','space-1','awaiting_actions');
INSERT INTO public."WorkSessionAction"(
  id,"sessionId","spaceId",tool,args,summary,status,"executionIdempotencyKey"
) VALUES (
  'race-action','race-parent','space-1','send_email','{}','race','approved',
  'work-session-action-' || md5('race-action')
);
SQL

"${psql_cmd[@]}" >"${pg_tmp}/claim-a.out" 2>"${pg_tmp}/claim-a.err" <<'SQL' &
BEGIN;
SELECT concat_ws('|',disposition,id,"executionIdempotencyKey","executionAttempts")
FROM public.claim_work_session_action_execution(
  'race-parent','race-action','space-1','10000000-0000-4000-8000-000000000001',120
);
SELECT pg_sleep(2);
COMMIT;
SQL
claim_a_pid=$!

for _ in {1..100}; do
  claimant_sleeping="$("${psql_cmd[@]}" -c "SELECT count(*) FROM pg_stat_activity WHERE query LIKE 'SELECT pg_sleep(2)%' AND state='active'")"
  [[ "${claimant_sleeping}" -gt 0 ]] && break
  sleep 0.05
done
[[ "${claimant_sleeping:-0}" -gt 0 ]]

"${psql_cmd[@]}" >"${pg_tmp}/claim-b.out" 2>"${pg_tmp}/claim-b.err" <<'SQL' &
SELECT concat_ws('|',disposition,id,"executionIdempotencyKey","executionAttempts")
FROM public.claim_work_session_action_execution(
  'race-parent','race-action','space-1','20000000-0000-4000-8000-000000000002',120
);
SQL
claim_b_pid=$!

if ! wait "${claim_a_pid}"; then
  cat "${pg_tmp}/claim-a.err" >&2
  exit 1
fi
if ! wait "${claim_b_pid}"; then
  cat "${pg_tmp}/claim-b.err" >&2
  exit 1
fi

claim_a_result="$(grep '^claimed|' "${pg_tmp}/claim-a.out")"
claim_b_result="$(tr -d '[:space:]' <"${pg_tmp}/claim-b.out")"
expected_key="$("${psql_cmd[@]}" -c "SELECT 'work-session-action-' || md5('race-action')")"
[[ "${claim_a_result}" == "claimed|race-action|${expected_key}|1" ]]
[[ -z "${claim_b_result}" ]]

"${psql_cmd[@]}" <<'SQL'
-- Expired lease recovery uses a new opaque token but preserves the exact
-- provider key and increments the bounded attempt counter.
UPDATE public."WorkSessionAction"
SET "executionLeaseExpiresAt" = now() - interval '1 second'
WHERE id = 'race-action';
DO $$
DECLARE v_claim record; v_key text;
BEGIN
  v_key := 'work-session-action-' || md5('race-action');
  SELECT * INTO v_claim FROM public.claim_work_session_action_execution(
    'race-parent','race-action','space-1','20000000-0000-4000-8000-000000000002',120
  );
  IF v_claim.disposition <> 'claimed'
    OR v_claim."executionIdempotencyKey" <> v_key
    OR v_claim."executionAttempts" <> 2
    OR (SELECT "executionFirstAttemptAt" FROM public."WorkSessionAction" WHERE id='race-action') IS NULL
  THEN RAISE EXCEPTION 'expired lease did not recover with the stable provider key'; END IF;

  IF public.finish_claimed_work_session_action_execution(
    'race-parent','race-action','space-1','10000000-0000-4000-8000-000000000001',
    'executed','{"ok":true}',NULL,false
  ) THEN RAISE EXCEPTION 'stale execution token finished the action'; END IF;

  IF NOT public.finish_claimed_work_session_action_execution(
    'race-parent','race-action','space-1','20000000-0000-4000-8000-000000000002',
    'executed','{"ok":true}',NULL,false
  ) THEN RAISE EXCEPTION 'winning execution token did not finish'; END IF;
  IF (SELECT status FROM public."WorkSession" WHERE id='race-parent') <> 'completed'
    OR (SELECT status FROM public."WorkSessionAction" WHERE id='race-action') <> 'executed'
  THEN RAISE EXCEPTION 'fenced finish did not atomically settle parent'; END IF;
END $$;

-- A transient failure releases only the matching live token. Recovery sees
-- the row again; an incorrect token cannot clear the lease.
INSERT INTO public."WorkSession"(id,"spaceId",status)
VALUES ('release-parent','space-1','awaiting_actions');
INSERT INTO public."WorkSessionAction"(
  id,"sessionId","spaceId",tool,args,summary,status,"executionIdempotencyKey"
) VALUES (
  'release-action','release-parent','space-1','send_email','{}','release','approved',
  'work-session-action-' || md5('release-action')
);
DO $$
DECLARE v_claim record; v_count integer;
BEGIN
  SELECT * INTO v_claim FROM public.claim_work_session_action_execution(
    'release-parent','release-action','space-1','30000000-0000-4000-8000-000000000003',120
  );
  IF v_claim.disposition <> 'claimed' THEN RAISE EXCEPTION 'release fixture not claimed'; END IF;
  IF public.release_work_session_action_execution_claim(
    'release-parent','release-action','space-1','40000000-0000-4000-8000-000000000004','wrong token'
  ) THEN RAISE EXCEPTION 'wrong token released execution lease'; END IF;
  IF NOT public.release_work_session_action_execution_claim(
    'release-parent','release-action','space-1','30000000-0000-4000-8000-000000000003','provider unavailable'
  ) THEN RAISE EXCEPTION 'winning token did not release execution lease'; END IF;
  SELECT count(*) INTO v_count FROM public.list_recoverable_work_session_actions(50)
  WHERE "actionId"='release-action' AND "spaceId"='space-1';
  IF v_count <> 1 THEN RAISE EXCEPTION 'released action is not recoverable'; END IF;
END $$;

-- Bounded attempts become an explicit terminal reconciliation state instead
-- of an infinite retry loop.
INSERT INTO public."WorkSession"(id,"spaceId",status)
VALUES ('exhausted-parent','space-1','awaiting_actions');
INSERT INTO public."WorkSessionAction"(
  id,"sessionId","spaceId",tool,args,summary,status,
  "executionIdempotencyKey","executionAttempts"
) VALUES (
  'exhausted-action','exhausted-parent','space-1','send_email','{}','exhausted','approved',
  'work-session-action-' || md5('exhausted-action'),5
);
DO $$
DECLARE v_claim record;
BEGIN
  SELECT * INTO v_claim FROM public.claim_work_session_action_execution(
    'exhausted-parent','exhausted-action','space-1','50000000-0000-4000-8000-000000000005',120
  );
  IF v_claim.disposition <> 'reconciliation_required'
    OR (SELECT status FROM public."WorkSessionAction" WHERE id='exhausted-action') <> 'failed'
    OR (SELECT "reconciliationRequiredAt" FROM public."WorkSessionAction" WHERE id='exhausted-action') IS NULL
  THEN RAISE EXCEPTION 'exhausted action did not fail closed'; END IF;

  IF public.finish_work_session_action_execution(
    'exhausted-parent','exhausted-action','space-1','executed','{}',NULL
  ) THEN RAISE EXCEPTION 'historical unfenced finisher still mutates'; END IF;
END $$;

-- Provider idempotency expires after 24h. A recovery older than the
-- conservative 23h database window becomes manual reconciliation and never
-- obtains a new side-effect lease.
INSERT INTO public."WorkSession"(id,"spaceId",status)
VALUES ('window-parent','space-1','awaiting_actions');
INSERT INTO public."WorkSessionAction"(
  id,"sessionId","spaceId",tool,args,summary,status,
  "executionIdempotencyKey","executionAttempts","executionFirstAttemptAt"
) VALUES (
  'window-action','window-parent','space-1','send_email','{}','window','approved',
  'work-session-action-' || md5('window-action'),1,now() - interval '23 hours 1 minute'
);
DO $$
DECLARE v_claim record;
BEGIN
  SELECT * INTO v_claim FROM public.claim_work_session_action_execution(
    'window-parent','window-action','space-1','60000000-0000-4000-8000-000000000006',120
  );
  IF v_claim.disposition <> 'reconciliation_required'
    OR (SELECT status FROM public."WorkSessionAction" WHERE id='window-action') <> 'failed'
    OR (SELECT "executionClaimToken" FROM public."WorkSessionAction" WHERE id='window-action') IS NOT NULL
  THEN RAISE EXCEPTION 'expired provider idempotency window obtained execution authority'; END IF;
END $$;
SQL

echo "work-session action execution postgres test: PASS"
