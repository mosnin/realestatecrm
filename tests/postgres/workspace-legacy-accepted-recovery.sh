#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
postgres_root="$(mktemp -d "/tmp/chippi-wslegacy.XXXXXX")"
postgres_data="$postgres_root/data"
postgres_socket="$postgres_root/socket"
postgres_port=$((56900 + ($$ % 300)))
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
  "spaceId" text NOT NULL,
  status text NOT NULL,
  plan jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  "completedAt" timestamptz,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE "WorkspaceRun" (
  id text PRIMARY KEY,
  "workSessionId" text NOT NULL REFERENCES "WorkSession"(id),
  "spaceId" text NOT NULL,
  status text NOT NULL,
  "launchToken" text,
  "modalAcceptedAt" timestamptz,
  "cancellationRequestedAt" timestamptz,
  error text,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE "WorkspaceRunLaunchReceipt" (
  "runId" text NOT NULL,
  "spaceId" text NOT NULL,
  "launchToken" text NOT NULL,
  attempt integer NOT NULL,
  state text NOT NULL,
  reason text,
  UNIQUE ("runId", "launchToken", state)
);
SQL

psql -X -v ON_ERROR_STOP=1 \
  -h "$postgres_socket" -p "$postgres_port" -U postgres postgres \
  -f "$repo_root/supabase/migrations/20260915000018_workspace_legacy_accepted_recovery.sql" >/dev/null

psql -X -v ON_ERROR_STOP=1 -h "$postgres_socket" -p "$postgres_port" -U postgres postgres <<'SQL' >/dev/null
INSERT INTO "WorkSession"(id,"spaceId",status,plan)
VALUES
  ('ws-legacy','space-1','running','[{"id":"s1","status":"pending"}]'),
  ('ws-current','space-1','running','[{"id":"s1","status":"pending"}]');
INSERT INTO "WorkspaceRun"(
  id,"workSessionId","spaceId",status,"launchToken","modalAcceptedAt"
) VALUES
  ('run-legacy','ws-legacy','space-1','launching','legacy-token',now() - interval '5 minutes'),
  ('run-current','ws-current','space-1','launching','current-token',now() - interval '5 minutes');
INSERT INTO "WorkspaceRunLaunchReceipt"(
  "runId","spaceId","launchToken",attempt,state
) VALUES ('run-current','space-1','current-token',1,'claimed');

DO $$
BEGIN
  IF NOT fail_stale_accepted_workspace_launch('run-legacy','space-1','legacy-token') THEN
    RAISE EXCEPTION 'legacy accepted row without a receipt was not recovered';
  END IF;
  IF NOT fail_stale_accepted_workspace_launch('run-current','space-1','current-token') THEN
    RAISE EXCEPTION 'current accepted row was not recovered';
  END IF;
  IF fail_stale_accepted_workspace_launch('run-current','space-1','wrong-token') THEN
    RAISE EXCEPTION 'wrong token recovered a run';
  END IF;
END $$;

DO $$
DECLARE v_legacy text; v_current text; v_failed_receipts integer;
BEGIN
  SELECT status INTO v_legacy FROM "WorkspaceRun" WHERE id='run-legacy';
  SELECT status INTO v_current FROM "WorkspaceRun" WHERE id='run-current';
  SELECT count(*) INTO v_failed_receipts
  FROM "WorkspaceRunLaunchReceipt"
  WHERE "runId"='run-current' AND state='failed';
  IF v_legacy <> 'failed' OR v_current <> 'failed' THEN
    RAISE EXCEPTION 'accepted rows did not become terminal: %, %',v_legacy,v_current;
  END IF;
  IF v_failed_receipts <> 1 THEN
    RAISE EXCEPTION 'current receipt history was not preserved';
  END IF;
END $$;
SQL

echo "workspace legacy accepted recovery postgres test: PASS"
