#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
postgres_root="$(mktemp -d "/tmp/chippi-wsempty.XXXXXX")"
postgres_data="$postgres_root/data"
postgres_socket="$postgres_root/socket"
postgres_port=$((56500 + ($$ % 400)))
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
psql -X -v ON_ERROR_STOP=1 \
  -h "$postgres_socket" -p "$postgres_port" -U postgres postgres \
  -f "$repo_root/supabase/migrations/20260915000017_work_session_empty_artifact_failure.sql" >/dev/null

psql -X -v ON_ERROR_STOP=1 -h "$postgres_socket" -p "$postgres_port" -U postgres postgres <<'SQL' >/dev/null
INSERT INTO "WorkSession"(id,status,plan,findings)
VALUES
  ('empty','running','[{"id":"s1","status":"skipped"}]'::jsonb,'[]'::jsonb),
  ('nonempty','running','[{"id":"s1","status":"done"}]'::jsonb,'[{"stepId":"s1","text":"proof"}]'::jsonb);

DO $$
BEGIN
  IF NOT claim_work_session_phase('empty','artifact','artifact','empty-token-current-00001',900) THEN
    RAISE EXCEPTION 'empty artifact claim was not granted';
  END IF;
  IF fail_empty_work_session_artifact('empty','empty-token-stale-000001') THEN
    RAISE EXCEPTION 'stale token failed the session';
  END IF;
  IF NOT fail_empty_work_session_artifact('empty','empty-token-current-00001') THEN
    RAISE EXCEPTION 'current empty artifact owner could not fail the session';
  END IF;
END $$;

DO $$
DECLARE v_status text; v_error text; v_claim text;
BEGIN
  SELECT status,error,"phaseClaimToken" INTO v_status,v_error,v_claim
  FROM "WorkSession" WHERE id='empty';
  IF v_status <> 'failed' OR v_error <> 'All research steps failed; no report was produced.' THEN
    RAISE EXCEPTION 'empty result was not recorded honestly: %, %',v_status,v_error;
  END IF;
  IF v_claim IS NOT NULL THEN RAISE EXCEPTION 'terminal failure retained its claim'; END IF;
END $$;

DO $$
BEGIN
  IF NOT claim_work_session_phase('nonempty','artifact','artifact','nonempty-token-current01',900) THEN
    RAISE EXCEPTION 'nonempty artifact claim was not granted';
  END IF;
  IF fail_empty_work_session_artifact('nonempty','nonempty-token-current01') THEN
    RAISE EXCEPTION 'nonempty findings were failed';
  END IF;
END $$;
SQL

echo "work-session empty artifact failure postgres test: PASS"
