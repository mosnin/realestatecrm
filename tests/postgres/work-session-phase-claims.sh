#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
# PostgreSQL's Unix socket path is capped at about 100 bytes on macOS; TMPDIR
# is much longer than that, so keep this disposable cluster directly in /tmp.
postgres_root="$(mktemp -d "/tmp/chippi-wsclaims.XXXXXX")"
postgres_data="$postgres_root/data"
postgres_socket="$postgres_root/socket"
postgres_port=$((55000 + ($$ % 500)))
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

psql -X -v ON_ERROR_STOP=1 -h "$postgres_socket" -p "$postgres_port" -U postgres postgres <<'SQL' >/dev/null
CREATE TABLE "WorkSession" (
  id text PRIMARY KEY,
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
SQL

psql -X -v ON_ERROR_STOP=1 \
  -h "$postgres_socket" -p "$postgres_port" -U postgres postgres \
  -f "$repo_root/supabase/migrations/20260915000008_work_session_phase_claims.sql" >/dev/null

psql -X -v ON_ERROR_STOP=1 -h "$postgres_socket" -p "$postgres_port" -U postgres postgres <<'SQL' >/dev/null
INSERT INTO "WorkSession"(id,status,plan)
VALUES ('session-1','planning','[]'::jsonb);

DO $$
BEGIN
  IF NOT claim_work_session_phase(
    'session-1','plan','plan','plan-token-0000000000001',900
  ) THEN RAISE EXCEPTION 'first plan claim was not granted'; END IF;
  IF claim_work_session_phase(
    'session-1','plan','plan','plan-token-0000000000002',900
  ) THEN RAISE EXCEPTION 'active duplicate plan claim was granted'; END IF;
  IF patch_work_session_phase(
    'session-1','plan','plan','wrong-token-000000000000',
    '{"status":"running","plan":[{"id":"s1","title":"Research","status":"pending"}]}'::jsonb,
    true,900
  ) THEN RAISE EXCEPTION 'wrong plan token patched the row'; END IF;
  IF NOT patch_work_session_phase(
    'session-1','plan','plan','plan-token-0000000000001',
    '{"status":"running","plan":[{"id":"s1","title":"Research","status":"pending"}]}'::jsonb,
    true,900
  ) THEN RAISE EXCEPTION 'plan owner could not publish'; END IF;
END $$;

DO $$
BEGIN
  IF NOT claim_work_session_phase(
    'session-1','step','s1','step-token-stale-00000001',900
  ) THEN RAISE EXCEPTION 'first step claim was not granted'; END IF;
  IF claim_work_session_phase(
    'session-1','step','s1','step-token-duplicate-0001',900
  ) THEN RAISE EXCEPTION 'active duplicate step claim was granted'; END IF;

  UPDATE "WorkSession"
  SET "phaseLeaseExpiresAt" = now() - interval '1 second'
  WHERE id = 'session-1';

  IF NOT claim_work_session_phase(
    'session-1','step','s1','step-token-recovery-00001',900
  ) THEN RAISE EXCEPTION 'expired step was not reclaimable'; END IF;
  IF patch_work_session_phase(
    'session-1','step','s1','step-token-stale-00000001',
    '{"plan":[{"id":"s1","title":"Research","status":"done"}],"findings":[{"stepId":"s1","text":"stale"}]}'::jsonb,
    true,900
  ) THEN RAISE EXCEPTION 'stale step token patched the row'; END IF;
  IF NOT patch_work_session_phase(
    'session-1','step','s1','step-token-recovery-00001',
    '{"plan":[{"id":"s1","title":"Research","status":"done"}],"findings":[{"stepId":"s1","text":"recovered"}]}'::jsonb,
    true,900
  ) THEN RAISE EXCEPTION 'recovery step could not publish'; END IF;
END $$;

DO $$
BEGIN
  IF NOT claim_work_session_phase(
    'session-1','artifact','artifact','artifact-token-00000000001',900
  ) THEN RAISE EXCEPTION 'artifact claim was not granted'; END IF;
  UPDATE "WorkSession" SET status = 'cancelled' WHERE id = 'session-1';
  IF patch_work_session_phase(
    'session-1','artifact','artifact','artifact-token-00000000001',
    '{"status":"completed","summary":"must not land"}'::jsonb,
    true,900
  ) THEN RAISE EXCEPTION 'cancelled artifact attempt patched the row'; END IF;
END $$;

DO $$
DECLARE v_findings jsonb; v_status text;
BEGIN
  SELECT findings,status INTO v_findings,v_status FROM "WorkSession" WHERE id='session-1';
  IF v_findings <> '[{"stepId":"s1","text":"recovered"}]'::jsonb THEN
    RAISE EXCEPTION 'unexpected findings: %', v_findings;
  END IF;
  IF v_status <> 'cancelled' THEN RAISE EXCEPTION 'cancellation did not win'; END IF;
END $$;
SQL

echo "work-session phase claim postgres test: PASS"
