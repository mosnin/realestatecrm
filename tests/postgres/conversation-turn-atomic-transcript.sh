#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
pg_bin="$(dirname "$(command -v postgres)")"
pg_tmp="$(mktemp -d "${TMPDIR:-/tmp}/chippi-turn-transcript.XXXXXX")"
pg_data="${pg_tmp}/data"
pg_socket="${pg_tmp}/socket"
pg_port="$((59500 + RANDOM % 400))"

cleanup() {
  "${pg_bin}/pg_ctl" -D "${pg_data}" -m immediate stop >/dev/null 2>&1 || true
  if [[ "${pg_tmp}" == *"/chippi-turn-transcript."* ]]; then
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
  mode text NOT NULL CHECK (mode IN ('chat', 'work')),
  UNIQUE (id, "spaceId")
);
CREATE TABLE public."Message" (
  id text PRIMARY KEY,
  "spaceId" text NOT NULL REFERENCES public."Space"(id),
  "conversationId" text REFERENCES public."Conversation"(id),
  role text NOT NULL,
  content text NOT NULL,
  blocks jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY ("conversationId", "spaceId")
    REFERENCES public."Conversation"(id, "spaceId")
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
  ('conversation-4','space-1','work'),
  ('conversation-5','space-1','work');
SQL

"${psql_cmd[@]}" -f "${repo_root}/supabase/migrations/20260915000026_conversation_turn_queue.sql"
"${psql_cmd[@]}" -f "${repo_root}/supabase/migrations/20260915000027_conversation_turn_lease_recovery.sql"
"${psql_cmd[@]}" -f "${repo_root}/supabase/migrations/20260915000028_conversation_turn_atomic_transcript.sql"

"${psql_cmd[@]}" <<'SQL'
DO $$
BEGIN
  IF has_function_privilege(
      'public',
      'public.commit_conversation_turn_assistant_v2(text,text,text,text,text,text,jsonb,text,text,text,integer)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'anon',
      'public.commit_conversation_turn_assistant_v2(text,text,text,text,text,text,jsonb,text,text,text,integer)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'authenticated',
      'public.commit_conversation_turn_assistant_v2(text,text,text,text,text,text,jsonb,text,text,text,integer)',
      'EXECUTE'
    )
  THEN RAISE EXCEPTION 'assistant commit authority leaked'; END IF;
  IF NOT has_function_privilege(
      'service_role',
      'public.commit_conversation_turn_assistant_v2(text,text,text,text,text,text,jsonb,text,text,text,integer)',
      'EXECUTE'
    )
  THEN RAISE EXCEPTION 'service role lacks assistant commit authority'; END IF;
  IF has_function_privilege(
      'service_role',
      'public.finish_conversation_turn(text,text,text,text,text,text)',
      'EXECUTE'
    )
  THEN RAISE EXCEPTION 'legacy tokenless finish still executable'; END IF;
  BEGIN
    PERFORM * FROM public.finish_conversation_turn(
      'missing','space-1','conversation-1','failed','legacy','legacy'
    );
    RAISE EXCEPTION 'legacy tokenless finish did not fail closed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%requires explicit v2 attempt authority%' THEN RAISE; END IF;
  END;
END $$;

-- Happy path: Message, receipt, and ledger terminal state commit together.
SELECT * FROM public.enqueue_conversation_turn(
  'turn-1','space-1','conversation-1','work','typed','request-1','first','[]','[]',NULL
);
SELECT * FROM public.claim_conversation_turn_v2(
  'turn-1','space-1','conversation-1','request-1','first','[]','attempt-1',60
);
SELECT * FROM public.commit_conversation_turn_assistant_v2(
  'turn-1','space-1','conversation-1','attempt-1','message-1','Durably complete.',
  '[{"type":"text","content":"Durably complete."}]','completed','complete',NULL,60
);
DO $$
BEGIN
  IF (SELECT status FROM public."ConversationTurn" WHERE id='turn-1') <> 'completed'
    OR (SELECT count(*) FROM public."Message" WHERE id='message-1') <> 1
    OR (SELECT count(*) FROM public."ConversationTurnAssistantCommit" WHERE "turnId"='turn-1') <> 1
  THEN RAISE EXCEPTION 'assistant transcript did not finalize atomically'; END IF;
END $$;

-- Lost-response retry is exact and cannot duplicate a transcript.
SELECT * FROM public.commit_conversation_turn_assistant_v2(
  'turn-1','space-1','conversation-1','attempt-1','message-1','Durably complete.',
  '[{"type":"text","content":"Durably complete."}]','completed','complete',NULL,60
);
DO $$
BEGIN
  IF (SELECT count(*) FROM public."Message" WHERE "conversationId"='conversation-1') <> 1
    OR (SELECT count(*) FROM public."ConversationTurnAssistantCommit" WHERE "turnId"='turn-1') <> 1
  THEN RAISE EXCEPTION 'assistant commit retry duplicated rows'; END IF;
  BEGIN
    PERFORM * FROM public.commit_conversation_turn_assistant_v2(
      'turn-1','space-1','conversation-1','attempt-1','message-1','Different content.',
      '[{"type":"text","content":"Different content."}]','completed','complete',NULL,60
    );
    RAISE EXCEPTION 'assistant idempotency key accepted different content';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%assistant idempotency conflict%' THEN RAISE; END IF;
  END;
END $$;

-- Recovery removes publication authority before any stale Message insert.
SELECT * FROM public.enqueue_conversation_turn(
  'turn-2','space-1','conversation-2','work','typed','request-2','stale','[]','[]',NULL
);
SELECT * FROM public.claim_conversation_turn_v2(
  'turn-2','space-1','conversation-2','request-2','stale','[]','attempt-2',60
);
UPDATE public."ConversationTurn" SET "leaseExpiresAt"=now()-interval '1 second' WHERE id='turn-2';
SELECT * FROM public.recover_expired_conversation_turns(10);
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.commit_conversation_turn_assistant_v2(
      'turn-2','space-1','conversation-2','attempt-2','message-stale','Too late.',
      '[{"type":"text","content":"Too late."}]','completed','complete',NULL,60
    );
    RAISE EXCEPTION 'recovered attempt published an assistant message';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%lease is no longer active%' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public."Message" WHERE id='message-stale') THEN
    RAISE EXCEPTION 'stale assistant Message escaped rollback';
  END IF;
END $$;

-- Cancellation wins atomically, and the receipt reports the real terminal
-- state so the browser cannot emit a false complete frame.
SELECT * FROM public.enqueue_conversation_turn(
  'turn-3','space-1','conversation-3','work','typed','request-3','cancel','[]','[]',NULL
);
SELECT * FROM public.claim_conversation_turn_v2(
  'turn-3','space-1','conversation-3','request-3','cancel','[]','attempt-3',60
);
SELECT * FROM public.request_conversation_turn_cancel_v2(
  'turn-3','space-1','conversation-3','attempt-3'
);
DO $$
DECLARE v_receipt record;
BEGIN
  SELECT * INTO v_receipt FROM public.commit_conversation_turn_assistant_v2(
    'turn-3','space-1','conversation-3','attempt-3','message-3','Stopped output.',
    '[{"type":"text","content":"Stopped output."}]','completed','complete',NULL,60
  );
  IF v_receipt."terminalStatus" <> 'cancelled'
    OR v_receipt."terminalReason" <> 'cancel_requested'
    OR (SELECT status FROM public."ConversationTurn" WHERE id='turn-3') <> 'cancelled'
  THEN RAISE EXCEPTION 'cancellation did not win assistant finalization'; END IF;
END $$;

-- Exact terminal retries must prove the same transition, not accept any
-- already-terminal state carrying the same attempt token.
SELECT * FROM public.enqueue_conversation_turn(
  'turn-4','space-1','conversation-4','work','typed','request-4','failure','[]','[]',NULL
);
SELECT * FROM public.claim_conversation_turn_v2(
  'turn-4','space-1','conversation-4','request-4','failure','[]','attempt-4',60
);
SELECT * FROM public.finish_conversation_turn_v2(
  'turn-4','space-1','conversation-4','attempt-4','failed','provider_failed','boom',60
);
SELECT * FROM public.finish_conversation_turn_v2(
  'turn-4','space-1','conversation-4','attempt-4','failed','provider_failed','boom',60
);
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.finish_conversation_turn_v2(
      'turn-4','space-1','conversation-4','attempt-4','completed','complete',NULL,60
    );
    RAISE EXCEPTION 'terminal retry accepted a different transition';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%terminal result conflict%' THEN RAISE; END IF;
  END;
END $$;

-- A different attempt token never publishes under the current lease.
SELECT * FROM public.enqueue_conversation_turn(
  'turn-5','space-1','conversation-5','work','typed','request-5','wrong token','[]','[]',NULL
);
SELECT * FROM public.claim_conversation_turn_v2(
  'turn-5','space-1','conversation-5','request-5','wrong token','[]','attempt-5',60
);
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.commit_conversation_turn_assistant_v2(
      'turn-5','space-1','conversation-5','wrong-attempt','message-5','No authority.',
      '[{"type":"text","content":"No authority."}]','completed','complete',NULL,60
    );
    RAISE EXCEPTION 'wrong token published assistant transcript';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%attempt token mismatch%' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public."Message" WHERE id='message-5') THEN
    RAISE EXCEPTION 'wrong-token assistant Message escaped rollback';
  END IF;
END $$;
SQL

echo "conversation-turn atomic transcript postgres checks passed"
