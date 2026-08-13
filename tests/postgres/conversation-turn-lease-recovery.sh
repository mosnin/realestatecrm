#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
pg_bin="$(dirname "$(command -v postgres)")"
pg_tmp="$(mktemp -d "${TMPDIR:-/tmp}/chippi-turn-lease.XXXXXX")"
pg_data="${pg_tmp}/data"
pg_socket="${pg_tmp}/socket"
pg_port="$((59000 + RANDOM % 500))"

cleanup() {
  "${pg_bin}/pg_ctl" -D "${pg_data}" -m immediate stop >/dev/null 2>&1 || true
  if [[ "${pg_tmp}" == *"/chippi-turn-lease."* ]]; then
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

CREATE TABLE public."Space" (id text PRIMARY KEY);
CREATE TABLE public."Conversation" (
  id text PRIMARY KEY,
  "spaceId" text NOT NULL REFERENCES public."Space"(id),
  mode text NOT NULL CHECK (mode IN ('chat', 'work'))
);
CREATE TABLE public."AgentPausedRun" (
  id text PRIMARY KEY,
  "spaceId" text NOT NULL REFERENCES public."Space"(id),
  "userId" text NOT NULL,
  "conversationId" text,
  "runState" text NOT NULL,
  approvals jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resumed','cancelled','expired')),
  "expiresAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public."Space"(id) VALUES ('space-1');
INSERT INTO public."Conversation"(id,"spaceId",mode) VALUES
  ('conversation-1','space-1','work'),
  ('conversation-2','space-1','work'),
  ('conversation-3','space-1','work'),
  ('conversation-4','space-1','work');
SQL

"${psql_cmd[@]}" -f "${repo_root}/supabase/migrations/20260915000026_conversation_turn_queue.sql"
"${psql_cmd[@]}" -f "${repo_root}/supabase/migrations/20260915000027_conversation_turn_lease_recovery.sql"

"${psql_cmd[@]}" <<'SQL'
DO $$
BEGIN
  IF has_function_privilege('public', 'public.recover_expired_conversation_turns(integer)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.finish_conversation_turn_v2(text,text,text,text,text,text,text,integer)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.request_conversation_turn_cancel_v2(text,text,text,text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.claim_conversation_turn_v2(text,text,text,text,text,jsonb,text,integer)', 'EXECUTE')
  THEN RAISE EXCEPTION 'turn lease authority leaked'; END IF;
  IF NOT has_function_privilege('service_role', 'public.recover_expired_conversation_turns(integer)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.finish_conversation_turn_v2(text,text,text,text,text,text,text,integer)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.request_conversation_turn_cancel_v2(text,text,text,text)', 'EXECUTE')
  THEN RAISE EXCEPTION 'service role lacks turn lease authority'; END IF;
END $$;

-- The rolling-deploy entrypoint used by the current task route also receives
-- a bounded lease and cannot settle after authority expires.
SELECT * FROM public.enqueue_conversation_turn(
  'turn-legacy','space-1','conversation-4','work','typed','request-legacy','legacy','[]','[]',NULL
);
SELECT * FROM public.claim_conversation_turn(
  'turn-legacy','space-1','conversation-4','request-legacy','legacy','[]'
);
DO $$
BEGIN
  IF (SELECT "attemptToken" FROM public."ConversationTurn" WHERE id='turn-legacy') IS NULL
    OR (SELECT "leaseExpiresAt" FROM public."ConversationTurn" WHERE id='turn-legacy') <= now()
  THEN RAISE EXCEPTION 'compatibility claim did not receive a live lease'; END IF;
  UPDATE public."ConversationTurn"
  SET "leaseExpiresAt"=now()-interval '1 second'
  WHERE id='turn-legacy';
  BEGIN
    PERFORM * FROM public.finish_conversation_turn(
      'turn-legacy','space-1','conversation-4','completed','late',NULL
    );
    RAISE EXCEPTION 'compatibility finish settled after lease expiry';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%lease is no longer active%' THEN RAISE; END IF;
  END;
END $$;
SELECT * FROM public.recover_expired_conversation_turns(10);

-- Hard-killed running work is terminally released; the same row is never
-- recycled, so late settlement can only observe cancellation.
SELECT * FROM public.enqueue_conversation_turn(
  'turn-1','space-1','conversation-1','work','typed','request-1','first','[]','[]',NULL
);
SELECT * FROM public.enqueue_conversation_turn(
  'turn-2','space-1','conversation-1','work','typed','request-2','second','[]','[]',NULL
);
SELECT * FROM public.claim_conversation_turn_v2(
  'turn-1','space-1','conversation-1','request-1','first','[]',
  '10000000-0000-4000-8000-000000000001',60
);
UPDATE public."ConversationTurn" SET "leaseExpiresAt"=now()-interval '1 second' WHERE id='turn-1';

DO $$
DECLARE v_recovered record; v_late record;
BEGIN
  SELECT * INTO v_recovered FROM public.recover_expired_conversation_turns(10);
  IF v_recovered."turnId" <> 'turn-1'
    OR v_recovered."previousStatus" <> 'running'
    OR (SELECT status FROM public."ConversationTurn" WHERE id='turn-1') <> 'cancelled'
    OR (SELECT "terminalReason" FROM public."ConversationTurn" WHERE id='turn-1') <> 'execution_lease_expired'
  THEN RAISE EXCEPTION 'expired running attempt was not safely released'; END IF;

  SELECT * INTO v_late FROM public.finish_conversation_turn_v2(
    'turn-1','space-1','conversation-1',
    '10000000-0000-4000-8000-000000000001','completed','late',NULL,60
  );
  IF v_late.status <> 'cancelled'
    OR (SELECT "terminalReason" FROM public."ConversationTurn" WHERE id='turn-1') <> 'execution_lease_expired'
  THEN RAISE EXCEPTION 'late settlement altered recovered terminal state'; END IF;
END $$;

-- Releasing the expired head makes the next durable instruction claimable.
SELECT * FROM public.claim_conversation_turn_v2(
  'turn-2','space-1','conversation-1','request-2','second','[]',
  '20000000-0000-4000-8000-000000000002',60
);
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.finish_conversation_turn_v2(
      'turn-2','space-1','conversation-1','wrong-token','completed','wrong',NULL,60
    );
    RAISE EXCEPTION 'wrong attempt token settled turn';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%attempt token mismatch%' THEN RAISE; END IF;
  END;
  PERFORM * FROM public.finish_conversation_turn_v2(
    'turn-2','space-1','conversation-1',
    '20000000-0000-4000-8000-000000000002','completed','done',NULL,60
  );
END $$;

-- Expired approval state is closed on both linked records.
SELECT * FROM public.enqueue_conversation_turn(
  'turn-pause','space-1','conversation-2','work','typed','request-pause','pause','[]','[]',NULL
);
SELECT * FROM public.claim_conversation_turn_v2(
  'turn-pause','space-1','conversation-2','request-pause','pause','[]',
  '30000000-0000-4000-8000-000000000003',60
);
INSERT INTO public."AgentPausedRun"(id,"spaceId","userId","conversationId","turnId","runState")
VALUES ('pause-expired','space-1','user-1','conversation-2','turn-pause','opaque');
SELECT * FROM public.finish_conversation_turn_v2(
  'turn-pause','space-1','conversation-2',
  '30000000-0000-4000-8000-000000000003','paused','approval_required',NULL,60
);
UPDATE public."ConversationTurn" SET "leaseExpiresAt"=now()-interval '1 second' WHERE id='turn-pause';
SELECT * FROM public.recover_expired_conversation_turns(10);
DO $$
BEGIN
  IF (SELECT status FROM public."ConversationTurn" WHERE id='turn-pause') <> 'cancelled'
    OR (SELECT status FROM public."AgentPausedRun" WHERE id='pause-expired') <> 'expired'
  THEN RAISE EXCEPTION 'expired approval was not closed atomically'; END IF;
END $$;

-- Resume rotates authority. The pre-pause attempt cannot settle continuation.
SELECT * FROM public.enqueue_conversation_turn(
  'turn-resume','space-1','conversation-3','work','typed','request-resume','resume','[]','[]',NULL
);
SELECT * FROM public.claim_conversation_turn_v2(
  'turn-resume','space-1','conversation-3','request-resume','resume','[]',
  '40000000-0000-4000-8000-000000000004',60
);
INSERT INTO public."AgentPausedRun"(id,"spaceId","userId","conversationId","turnId","runState")
VALUES ('pause-resume','space-1','user-1','conversation-3','turn-resume','opaque');
SELECT * FROM public.finish_conversation_turn_v2(
  'turn-resume','space-1','conversation-3',
  '40000000-0000-4000-8000-000000000004','paused','approval_required',NULL,60
);
SELECT * FROM public.resume_paused_conversation_turn_v2(
  'pause-resume','turn-resume','space-1','user-1',
  '50000000-0000-4000-8000-000000000005',60
);
DO $$
BEGIN
  IF (SELECT "attempts" FROM public."ConversationTurn" WHERE id='turn-resume') <> 2
    OR (SELECT "attemptToken" FROM public."ConversationTurn" WHERE id='turn-resume')
      <> '50000000-0000-4000-8000-000000000005'
  THEN RAISE EXCEPTION 'resume did not rotate attempt authority'; END IF;
  BEGIN
    PERFORM * FROM public.finish_conversation_turn_v2(
      'turn-resume','space-1','conversation-3',
      '40000000-0000-4000-8000-000000000004','completed','stale',NULL,60
    );
    RAISE EXCEPTION 'pre-pause attempt settled resumed turn';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%attempt token mismatch%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM * FROM public.request_conversation_turn_cancel_v2(
      'turn-resume','space-1','conversation-3','40000000-0000-4000-8000-000000000004'
    );
    RAISE EXCEPTION 'pre-pause attempt cancelled resumed turn';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%active conversation turn attempt not found%' THEN RAISE; END IF;
  END;
  PERFORM * FROM public.request_conversation_turn_cancel_v2(
    'turn-resume','space-1','conversation-3','50000000-0000-4000-8000-000000000005'
  );
  PERFORM * FROM public.finish_conversation_turn_v2(
    'turn-resume','space-1','conversation-3',
    '50000000-0000-4000-8000-000000000005','completed','cancelled',NULL,60
  );
  IF (SELECT status FROM public."ConversationTurn" WHERE id='turn-resume') <> 'cancelled'
  THEN RAISE EXCEPTION 'active attempt cancellation did not settle exactly'; END IF;
END $$;
SQL

echo "conversation-turn lease recovery postgres checks passed"
