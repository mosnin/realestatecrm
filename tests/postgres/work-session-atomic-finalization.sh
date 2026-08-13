#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
postgres_root="$(mktemp -d "/tmp/chippi-wsatomic.XXXXXX")"
postgres_data="$postgres_root/data"
postgres_socket="$postgres_root/socket"
postgres_port=$((57000 + ($$ % 400)))
mkdir -p "$postgres_socket"

cleanup() {
  if [[ -f "$postgres_data/postmaster.pid" ]]; then
    pg_ctl -D "$postgres_data" -m immediate stop >/dev/null 2>&1 || true
  fi
  rm -rf "$postgres_root"
}
trap cleanup EXIT

initdb -D "$postgres_data" -A trust -U postgres >/dev/null
pg_ctl -D "$postgres_data" \
  -l "$postgres_root/postgres.log" \
  -o "-F -p $postgres_port -k $postgres_socket" \
  start >/dev/null

psql_cmd=(psql -X -qAt -v ON_ERROR_STOP=1 -h "$postgres_socket" -p "$postgres_port" -U postgres postgres)

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
  "sizeBytes" bigint NOT NULL CHECK ("sizeBytes" >= 0),
  "isPublic" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now()
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

INSERT INTO public."User"(id,"clerkId") VALUES ('user-1','clerk-owner-1');
INSERT INTO public."Space"(id,"ownerId") VALUES ('space-1','user-1');
SQL

"${psql_cmd[@]}" -f "$repo_root/supabase/migrations/20260915000008_work_session_phase_claims.sql"
"${psql_cmd[@]}" -f "$repo_root/supabase/migrations/20260915000021_work_session_atomic_finalization.sql"

"${psql_cmd[@]}" <<'SQL'
-- Public/client roles cannot invoke any mutation authority; service_role can.
DO $$
BEGIN
  IF has_function_privilege('public', 'public.finalize_work_session_artifact(text,text,text,text,jsonb,jsonb)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.finalize_work_session_artifact(text,text,text,text,jsonb,jsonb)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.finalize_work_session_artifact(text,text,text,text,jsonb,jsonb)', 'EXECUTE')
  THEN RAISE EXCEPTION 'artifact finalizer leaked execute privilege'; END IF;
  IF NOT has_function_privilege('service_role', 'public.finalize_work_session_artifact(text,text,text,text,jsonb,jsonb)', 'EXECUTE')
  THEN RAISE EXCEPTION 'service role lacks artifact finalizer privilege'; END IF;
  IF has_function_privilege('public', 'public.claim_work_session_action_decision(text,text,text,text,text)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.claim_work_session_action_decision(text,text,text,text,text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.claim_work_session_action_decision(text,text,text,text,text)', 'EXECUTE')
    OR has_function_privilege('public', 'public.finish_work_session_action_execution(text,text,text,text,jsonb,text)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.finish_work_session_action_execution(text,text,text,text,jsonb,text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.finish_work_session_action_execution(text,text,text,text,jsonb,text)', 'EXECUTE')
  THEN RAISE EXCEPTION 'action authority leaked execute privilege'; END IF;
  IF NOT has_function_privilege('service_role', 'public.claim_work_session_action_decision(text,text,text,text,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.finish_work_session_action_execution(text,text,text,text,jsonb,text)', 'EXECUTE')
  THEN RAISE EXCEPTION 'service role lacks action authority privilege'; END IF;
END $$;

-- A stale token, expired lease, and cancellation all return no receipt and
-- leave both visibility tables empty.
INSERT INTO public."WorkSession"(id,"spaceId",status,kind,plan,findings)
VALUES
  ('stale','space-1','running','research','[{"id":"s1","status":"done"}]','[{"stepId":"s1","text":"proof"}]'),
  ('expired','space-1','running','research','[{"id":"s1","status":"done"}]','[{"stepId":"s1","text":"proof"}]'),
  ('cancelled','space-1','running','research','[{"id":"s1","status":"done"}]','[{"stepId":"s1","text":"proof"}]');

DO $$
DECLARE v_count integer;
BEGIN
  IF NOT public.claim_work_session_phase('stale','artifact','artifact','current-stale-token-00001',900)
  THEN RAISE EXCEPTION 'stale fixture claim failed'; END IF;
  SELECT count(*) INTO v_count FROM public.finalize_work_session_artifact(
    'stale','space-1','wrong-stale-token-0000001','summary',
    '{"storageKey":"files/space-1/stale-wrong-st-report.md","name":"report.md","mimeType":"text/markdown","sizeBytes":12}',
    '[]'
  );
  IF v_count <> 0 THEN RAISE EXCEPTION 'stale token finalized'; END IF;

  IF NOT public.claim_work_session_phase('expired','artifact','artifact','expired-token-current001',900)
  THEN RAISE EXCEPTION 'expired fixture claim failed'; END IF;
  UPDATE public."WorkSession" SET "phaseLeaseExpiresAt" = now() - interval '1 second' WHERE id='expired';
  SELECT count(*) INTO v_count FROM public.finalize_work_session_artifact(
    'expired','space-1','expired-token-current001','summary',
    '{"storageKey":"files/space-1/expired-expired--report.md","name":"report.md","mimeType":"text/markdown","sizeBytes":12}',
    '[]'
  );
  IF v_count <> 0 THEN RAISE EXCEPTION 'expired token finalized'; END IF;

  IF NOT public.claim_work_session_phase('cancelled','artifact','artifact','cancel-token-current0001',900)
  THEN RAISE EXCEPTION 'cancel fixture claim failed'; END IF;
  UPDATE public."WorkSession" SET status='cancelled' WHERE id='cancelled';
  SELECT count(*) INTO v_count FROM public.finalize_work_session_artifact(
    'cancelled','space-1','cancel-token-current0001','summary',
    '{"storageKey":"files/space-1/cancelle-cancel-t-report.md","name":"report.md","mimeType":"text/markdown","sizeBytes":12}',
    '[]'
  );
  IF v_count <> 0 THEN RAISE EXCEPTION 'cancelled session finalized'; END IF;

  IF EXISTS (SELECT 1 FROM public."File") OR EXISTS (SELECT 1 FROM public."WorkSessionAction")
  THEN RAISE EXCEPTION 'rejected finalization exposed metadata'; END IF;
END $$;

-- The old artifact completion path is no longer an alternate authority.
INSERT INTO public."WorkSession"(id,"spaceId",status,kind,plan,findings)
VALUES ('legacy','space-1','running','research','[{"id":"s1","status":"done"}]','[{"stepId":"s1","text":"proof"}]');
DO $$
BEGIN
  IF NOT public.claim_work_session_phase('legacy','artifact','artifact','legacy-token-current0001',900)
  THEN RAISE EXCEPTION 'legacy fixture claim failed'; END IF;
  BEGIN
    PERFORM public.patch_work_session_phase(
      'legacy','artifact','artifact','legacy-token-current0001',
      '{"status":"completed","summary":"bypass"}',true,900
    );
    RAISE EXCEPTION 'legacy artifact completion did not raise';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%atomic finalization%' THEN RAISE; END IF;
  END;
  IF NOT public.patch_work_session_phase(
    'legacy','artifact','artifact','legacy-token-current0001','{}',false,900
  ) THEN RAISE EXCEPTION 'artifact renewal was disabled'; END IF;
END $$;

-- One transaction publishes File + proposals + awaiting_actions. Retrying with
-- the released token is a no-op and cannot duplicate rows.
INSERT INTO public."WorkSession"(id,"spaceId",status,kind,plan,findings)
VALUES ('atomic','space-1','running','research','[{"id":"s1","status":"done"}]','[{"stepId":"s1","text":"proof"}]');
DO $$
DECLARE v_receipt record; v_count integer;
BEGIN
  IF NOT public.claim_work_session_phase('atomic','artifact','artifact','atomic-token-current0001',900)
  THEN RAISE EXCEPTION 'atomic fixture claim failed'; END IF;
  SELECT * INTO v_receipt FROM public.finalize_work_session_artifact(
    'atomic','space-1','atomic-token-current0001','Atomic summary',
    '{"storageKey":"files/space-1/atomic-atomic-t-report.md","name":"report.md","mimeType":"text/markdown","sizeBytes":42}',
    '[{"tool":"add_note","args":{"contactId":"c1","body":"Call"},"summary":"Add a note","rationale":"Research finding"}]'
  );
  IF v_receipt."finalStatus" <> 'awaiting_actions' OR v_receipt."proposedCount" <> 1
  THEN RAISE EXCEPTION 'unexpected atomic receipt: %', row_to_json(v_receipt); END IF;
  IF (SELECT status FROM public."WorkSession" WHERE id='atomic') <> 'awaiting_actions'
    OR (SELECT count(*) FROM public."File" WHERE id=v_receipt."artifactFileId") <> 1
    OR (SELECT count(*) FROM public."WorkSessionAction" WHERE "sessionId"='atomic') <> 1
  THEN RAISE EXCEPTION 'atomic surfaces did not commit together'; END IF;

  SELECT count(*) INTO v_count FROM public.finalize_work_session_artifact(
    'atomic','space-1','atomic-token-current0001','Atomic summary',
    '{"storageKey":"files/space-1/atomic-atomic-t-report.md","name":"report.md","mimeType":"text/markdown","sizeBytes":42}',
    '[{"tool":"add_note","args":{"contactId":"c1","body":"Call"},"summary":"Add a note","rationale":"Research finding"}]'
  );
  IF v_count <> 0 OR (SELECT count(*) FROM public."File") <> 1
    OR (SELECT count(*) FROM public."WorkSessionAction" WHERE "sessionId"='atomic') <> 1
  THEN RAISE EXCEPTION 'retry duplicated atomic rows'; END IF;
END $$;

-- A statement-level failure rolls the File and proposal inserts back with the
-- parent transition (simulated database crash/failure inside the transaction).
CREATE FUNCTION public.reject_crash_action() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."sessionId" = 'crash' THEN RAISE EXCEPTION 'simulated crash'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reject_crash_action BEFORE INSERT ON public."WorkSessionAction"
FOR EACH ROW EXECUTE FUNCTION public.reject_crash_action();
INSERT INTO public."WorkSession"(id,"spaceId",status,kind,plan,findings)
VALUES ('crash','space-1','running','research','[{"id":"s1","status":"done"}]','[{"stepId":"s1","text":"proof"}]');
DO $$
BEGIN
  IF NOT public.claim_work_session_phase('crash','artifact','artifact','crash-token-current00001',900)
  THEN RAISE EXCEPTION 'crash fixture claim failed'; END IF;
  BEGIN
    PERFORM * FROM public.finalize_work_session_artifact(
      'crash','space-1','crash-token-current00001','summary',
      '{"storageKey":"files/space-1/crash-crash-to-report.md","name":"report.md","mimeType":"text/markdown","sizeBytes":12}',
      '[{"tool":"add_note","args":{"contactId":"c1","body":"Call"},"summary":"Add note","rationale":null}]'
    );
    RAISE EXCEPTION 'simulated crash did not abort';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'simulated crash' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public."File" WHERE "storageKey" LIKE '%crash%')
    OR EXISTS (SELECT 1 FROM public."WorkSessionAction" WHERE "sessionId"='crash')
    OR (SELECT status FROM public."WorkSession" WHERE id='crash') <> 'running'
  THEN RAISE EXCEPTION 'crash left a partial commit'; END IF;
END $$;
DROP TRIGGER reject_crash_action ON public."WorkSessionAction";
DROP FUNCTION public.reject_crash_action();

-- Action decisions require an awaiting_actions parent. Denial of the last
-- proposal completes parent+child atomically; approval finish is similarly
-- fenced and cannot update under a terminal parent.
INSERT INTO public."WorkSession"(id,"spaceId",status,kind,plan,findings)
VALUES
  ('not-awaiting','space-1','completed','research','[]','[]'),
  ('deny-parent','space-1','awaiting_actions','research','[]','[]'),
  ('approve-parent','space-1','awaiting_actions','research','[]','[]');
INSERT INTO public."WorkSessionAction"(id,"sessionId","spaceId",tool,args,summary,status)
VALUES
  ('not-awaiting-action','not-awaiting','space-1','add_note','{}','No','proposed'),
  ('deny-action','deny-parent','space-1','add_note','{}','Deny','proposed'),
  ('approve-action','approve-parent','space-1','add_note','{}','Approve','proposed');

DO $$
DECLARE v_count integer; v_claim record;
BEGIN
  SELECT count(*) INTO v_count FROM public.claim_work_session_action_decision(
    'not-awaiting','not-awaiting-action','space-1','deny','clerk-owner-1'
  );
  IF v_count <> 0 OR (SELECT status FROM public."WorkSessionAction" WHERE id='not-awaiting-action') <> 'proposed'
  THEN RAISE EXCEPTION 'terminal parent allowed a decision'; END IF;
  BEGIN
    UPDATE public."WorkSessionAction" SET status='denied' WHERE id='not-awaiting-action';
    RAISE EXCEPTION 'direct child update bypassed parent state';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%parent is not awaiting actions%' THEN RAISE; END IF;
  END;

  SELECT * INTO v_claim FROM public.claim_work_session_action_decision(
    'deny-parent','deny-action','space-1','deny','clerk-owner-1'
  );
  IF v_claim.status <> 'denied'
    OR (SELECT status FROM public."WorkSession" WHERE id='deny-parent') <> 'completed'
  THEN RAISE EXCEPTION 'deny did not atomically settle parent'; END IF;

  SELECT * INTO v_claim FROM public.claim_work_session_action_decision(
    'approve-parent','approve-action','space-1','approve','clerk-owner-1'
  );
  IF v_claim.status <> 'approved' THEN RAISE EXCEPTION 'approve claim failed'; END IF;
  SELECT count(*) INTO v_count FROM public.claim_work_session_action_decision(
    'approve-parent','approve-action','space-1','approve','clerk-owner-1'
  );
  IF v_count <> 0 THEN RAISE EXCEPTION 'approval claim was not idempotent'; END IF;
  IF NOT public.finish_work_session_action_execution(
    'approve-parent','approve-action','space-1','executed','{"ok":true}',NULL
  ) THEN RAISE EXCEPTION 'approved action did not finish'; END IF;
  IF (SELECT status FROM public."WorkSession" WHERE id='approve-parent') <> 'completed'
    OR (SELECT status FROM public."WorkSessionAction" WHERE id='approve-action') <> 'executed'
  THEN RAISE EXCEPTION 'finish did not atomically settle parent'; END IF;
  IF public.finish_work_session_action_execution(
    'approve-parent','approve-action','space-1','executed','{"ok":true}',NULL
  ) THEN RAISE EXCEPTION 'terminal parent permitted repeated finish'; END IF;
END $$;
SQL

echo "work-session atomic finalization postgres test: PASS"
