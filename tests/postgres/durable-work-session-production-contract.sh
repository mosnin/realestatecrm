#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
pg_bin="$(dirname "$(command -v postgres)")"
pg_tmp="$(mktemp -d "/tmp/chippi-durable-work-session.XXXXXX")"
pg_data="${pg_tmp}/data"
pg_socket="${pg_tmp}/socket"
pg_port="$((59000 + RANDOM % 500))"

cleanup() {
  "${pg_bin}/pg_ctl" -D "${pg_data}" -m immediate stop >/dev/null 2>&1 || true
  if [[ "${pg_tmp}" == *"/chippi-durable-work-session."* ]]; then
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
-- Mirrors production before the catch-up: no kind or phase claim columns.
CREATE TABLE public."WorkSession" (
  id text PRIMARY KEY,
  "spaceId" text NOT NULL REFERENCES public."Space"(id),
  "conversationId" text,
  goal text NOT NULL,
  autonomy text NOT NULL DEFAULT 'plan_first',
  "allowQuestions" boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'planning',
  plan jsonb NOT NULL DEFAULT '[]'::jsonb,
  question text,
  answer text,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  "artifactFileId" text,
  "artifactName" text,
  summary text,
  error text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
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
  "isPublic" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public."WorkSessionAction" (
  id text PRIMARY KEY,
  "sessionId" text NOT NULL REFERENCES public."WorkSession"(id),
  "spaceId" text NOT NULL REFERENCES public."Space"(id),
  tool text NOT NULL,
  args jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary text NOT NULL,
  rationale text,
  status text NOT NULL DEFAULT 'proposed',
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

"${psql_cmd[@]}" -f "${repo_root}/supabase/migrations/20260822043207_durable_work_session_production_contract.sql"

"${psql_cmd[@]}" <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='WorkSession'
      AND column_name='kind' AND is_nullable='NO'
  ) THEN RAISE EXCEPTION 'kind contract was not installed'; END IF;
  IF has_function_privilege(
    'anon', 'public.claim_work_session_phase(text,text,text,text,integer)', 'EXECUTE'
  ) OR has_function_privilege(
    'authenticated', 'public.list_research_work_session_recovery_candidates(integer)', 'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role', 'public.finalize_work_session_artifact(text,text,text,text,jsonb,jsonb)', 'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role', 'public.claim_work_session_action_execution(text,text,text,text,integer)', 'EXECUTE'
  ) THEN RAISE EXCEPTION 'durable authorities are not service-only'; END IF;
END;
$$;

INSERT INTO public."WorkSession"(
  id,"spaceId",goal,status,plan,"updatedAt",
  "phaseClaimToken","phaseClaimKind","phaseClaimKey","phaseLeaseExpiresAt"
) VALUES
  ('stale-plan','space-1','Plan stale work','planning','[]',now()-interval '11 minutes',NULL,NULL,NULL,NULL),
  ('stale-run','space-1','Advance stale work','running','[{"id":"s1","title":"Step","status":"pending"}]',now()-interval '11 minutes',NULL,NULL,NULL,NULL),
  ('active-run','space-1','Do not duplicate','running','[{"id":"s1","title":"Step","status":"pending"}]',now()-interval '11 minutes','active-token-00000001','step','s1',now()+interval '2 minutes'),
  ('expired-run','space-1','Recover expired','running','[{"id":"s1","title":"Step","status":"pending"}]',now()-interval '11 minutes','expired-token-000001','step','s1',now()-interval '1 minute');

DO $$
DECLARE v_candidates jsonb;
BEGIN
  SELECT jsonb_object_agg(candidate."sessionId", candidate.action)
    INTO v_candidates
  FROM public.list_research_work_session_recovery_candidates(25) AS candidate;
  IF v_candidates <> '{
    "stale-plan":"plan",
    "stale-run":"advance",
    "expired-run":"advance"
  }'::jsonb THEN
    RAISE EXCEPTION 'unsafe recovery candidates: %', v_candidates;
  END IF;

  IF NOT public.claim_work_session_phase(
    'expired-run','step','s1','recovery-token-000001',420
  ) THEN RAISE EXCEPTION 'expired phase was not recoverable'; END IF;
  IF public.claim_work_session_phase(
    'expired-run','step','s1','duplicate-token-00001',420
  ) THEN RAISE EXCEPTION 'duplicate phase claim was accepted'; END IF;
END;
$$;
SQL

echo "PASS: production catch-up installs, fences, and recovers the durable WorkSession rail."
