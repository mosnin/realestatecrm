#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
pg_bin="$(dirname "$(command -v postgres)")"
pg_tmp="$(mktemp -d "${TMPDIR:-/tmp}/chippi-turn-queue.XXXXXX")"
pg_data="${pg_tmp}/data"
pg_socket="${pg_tmp}/socket"
pg_log="${pg_tmp}/postgres.log"
pg_port="$((60000 + RANDOM % 1000))"

cleanup() {
  "${pg_bin}/pg_ctl" -D "${pg_data}" -m immediate stop >/dev/null 2>&1 || true
  if [[ "${pg_tmp}" == *"/chippi-turn-queue."* ]]; then
    /bin/rm -rf "${pg_tmp}"
  fi
}
trap cleanup EXIT

mkdir -p "${pg_socket}"
"${pg_bin}/initdb" -D "${pg_data}" -A trust -U postgres >/dev/null
"${pg_bin}/pg_ctl" -D "${pg_data}" -l "${pg_log}" \
  -o "-k '${pg_socket}' -p ${pg_port} -c listen_addresses=''" \
  -w start >/dev/null

psql_cmd=(
  "${pg_bin}/psql" -X -qAt -v ON_ERROR_STOP=1
  -h "${pg_socket}" -p "${pg_port}" -U postgres -d postgres
)

"${psql_cmd[@]}" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE TABLE public."Space" (
  id text PRIMARY KEY
);

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
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'resumed', 'cancelled', 'expired')),
  "expiresAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public."Space"(id) VALUES ('space-a'), ('space-b');
INSERT INTO public."Conversation"(id, "spaceId", mode) VALUES
  ('bind-work', 'space-a', 'work'),
  ('bind-chat', 'space-a', 'chat'),
  ('bind-other-tenant', 'space-b', 'work'),
  ('replay', 'space-a', 'work'),
  ('capacity', 'space-a', 'work'),
  ('fifo', 'space-a', 'work'),
  ('steer', 'space-a', 'work'),
  ('other-active', 'space-a', 'work'),
  ('cancel-queued', 'space-a', 'work'),
  ('attachments', 'space-a', 'work'),
  ('acl', 'space-a', 'work');
SQL

"${psql_cmd[@]}" \
  -f "${repo_root}/supabase/migrations/20260915000026_conversation_turn_queue.sql"
"${psql_cmd[@]}" \
  -f "${repo_root}/supabase/migrations/20260915000027_conversation_turn_lease_recovery.sql"

"${psql_cmd[@]}" <<'SQL'
\o /dev/null
CREATE OR REPLACE FUNCTION pg_temp.expect_error(p_sql text, p_expected text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_raised boolean := false;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF position(p_expected IN SQLERRM) = 0 THEN
      RAISE EXCEPTION 'expected error containing %, received %', p_expected, SQLERRM;
    END IF;
    v_raised := true;
  END;

  IF NOT v_raised THEN
    RAISE EXCEPTION 'expected error containing %, but statement succeeded', p_expected;
  END IF;
END;
$$;

-- Tenant, conversation, and immutable mode binding are checked before insert.
DO $$
BEGIN
  PERFORM pg_temp.expect_error(
    $q$SELECT * FROM public.enqueue_conversation_turn(
      'bind-cross-tenant', 'space-a', 'bind-other-tenant', 'work', 'typed',
      'bind-request-1', 'cross tenant', '[]', '[]', NULL
    )$q$,
    'conversation turn binding mismatch'
  );
  PERFORM pg_temp.expect_error(
    $q$SELECT * FROM public.enqueue_conversation_turn(
      'bind-wrong-mode', 'space-a', 'bind-work', 'chat', 'typed',
      'bind-request-2', 'wrong mode', '[]', '[]', NULL
    )$q$,
    'conversation turn binding mismatch'
  );
  PERFORM pg_temp.expect_error(
    $q$SELECT * FROM public.enqueue_conversation_turn(
      'bind-missing-conversation', 'space-a', 'missing', 'work', 'typed',
      'bind-request-3', 'missing conversation', '[]', '[]', NULL
    )$q$,
    'conversation turn binding mismatch'
  );

  IF EXISTS (
    SELECT 1 FROM public."ConversationTurn"
    WHERE id IN ('bind-cross-tenant', 'bind-wrong-mode', 'bind-missing-conversation')
  ) THEN
    RAISE EXCEPTION 'binding rejection left a queue row behind';
  END IF;
END;
$$;

-- Exact clientRequestId replay is one row; changed payload is a conflict.
SELECT * FROM public.enqueue_conversation_turn(
  'replay-turn', 'space-a', 'replay', 'work', 'typed', 'replay-request',
  '  inspect the CMA  ', '["replay-file"]',
  '[{"id":"replay-file","name":"cma.pdf","size":42}]', NULL
);
SELECT * FROM public.enqueue_conversation_turn(
  'replay-turn', 'space-a', 'replay', 'work', 'typed', 'replay-request',
  'inspect the CMA', '["replay-file"]',
  '[{"id":"replay-file","name":"cma.pdf","size":42}]', NULL
);
DO $$
BEGIN
  IF (SELECT count(*) FROM public."ConversationTurn"
      WHERE "conversationId" = 'replay' AND "clientRequestId" = 'replay-request') <> 1
    OR (SELECT message FROM public."ConversationTurn" WHERE id = 'replay-turn') <> 'inspect the CMA'
  THEN
    RAISE EXCEPTION 'exact replay was not idempotent';
  END IF;

  PERFORM pg_temp.expect_error(
    $q$SELECT * FROM public.enqueue_conversation_turn(
      'replay-turn', 'space-a', 'replay', 'work', 'typed', 'replay-request',
      'changed payload', '["replay-file"]',
      '[{"id":"replay-file","name":"cma.pdf","size":42}]', NULL
    )$q$,
    'conversation turn idempotency conflict'
  );
  PERFORM pg_temp.expect_error(
    $q$SELECT * FROM public.enqueue_conversation_turn(
      'different-turn', 'space-a', 'replay', 'work', 'typed', 'replay-request',
      'inspect the CMA', '["replay-file"]',
      '[{"id":"replay-file","name":"cma.pdf","size":42}]', NULL
    )$q$,
    'conversation turn idempotency conflict'
  );
END;
$$;

-- The cap is exactly 50 pending rows, and the rejected 51st is not persisted.
DO $$
DECLARE
  i integer;
BEGIN
  FOR i IN 1..50 LOOP
    PERFORM public.enqueue_conversation_turn(
      'capacity-turn-' || i,
      'space-a',
      'capacity',
      'work',
      'typed',
      'capacity-request-' || i,
      'capacity message ' || i,
      '[]'::jsonb,
      '[]'::jsonb,
      NULL
    );
  END LOOP;

  IF (SELECT count(*) FROM public."ConversationTurn"
      WHERE "conversationId" = 'capacity' AND status = 'pending') <> 50
  THEN
    RAISE EXCEPTION 'queue did not accept exactly 50 pending rows';
  END IF;

  PERFORM pg_temp.expect_error(
    $q$SELECT * FROM public.enqueue_conversation_turn(
      'capacity-turn-51', 'space-a', 'capacity', 'work', 'typed',
      'capacity-request-51', 'capacity message 51', '[]', '[]', NULL
    )$q$,
    'conversation queue limit reached'
  );

  IF EXISTS (SELECT 1 FROM public."ConversationTurn" WHERE id = 'capacity-turn-51') THEN
    RAISE EXCEPTION 'queue cap rejection persisted the 51st row';
  END IF;
END;
$$;

-- Typed work claims FIFO; a later FIFO row cannot jump the durable head.
SELECT * FROM public.enqueue_conversation_turn(
  'fifo-1', 'space-a', 'fifo', 'work', 'typed', 'fifo-request-1',
  'first', '[]', '[]', NULL
);
SELECT * FROM public.enqueue_conversation_turn(
  'fifo-2', 'space-a', 'fifo', 'work', 'typed', 'fifo-request-2',
  'second', '[]', '[]', NULL
);
DO $$
BEGIN
  PERFORM pg_temp.expect_error(
    $q$SELECT * FROM public.claim_conversation_turn_v2(
      'fifo-2', 'space-a', 'fifo', 'fifo-request-2', 'second', '[]',
      'fifo-attempt-2-early', 60
    )$q$,
    'conversation turn is not queue head'
  );
END;
$$;
SELECT * FROM public.claim_conversation_turn_v2(
  'fifo-1', 'space-a', 'fifo', 'fifo-request-1', 'first', '[]',
  'fifo-attempt-1', 60
);
SELECT * FROM public.finish_conversation_turn_v2(
  'fifo-1', 'space-a', 'fifo', 'fifo-attempt-1',
  'completed', 'completed', NULL, 60
);
SELECT * FROM public.claim_conversation_turn_v2(
  'fifo-2', 'space-a', 'fifo', 'fifo-request-2', 'second', '[]',
  'fifo-attempt-2', 60
);
SELECT * FROM public.finish_conversation_turn_v2(
  'fifo-2', 'space-a', 'fifo', 'fifo-attempt-2',
  'completed', 'completed', NULL, 60
);

-- Keep an unrelated live turn to prove steering/cancellation stay exact.
SELECT * FROM public.enqueue_conversation_turn(
  'other-running', 'space-a', 'other-active', 'work', 'typed',
  'other-running-request', 'unrelated active turn', '[]', '[]', NULL
);
SELECT * FROM public.claim_conversation_turn_v2(
  'other-running', 'space-a', 'other-active', 'other-running-request',
  'unrelated active turn', '[]', 'other-attempt', 60
);

-- Steering atomically requests cancellation of the named live turn and adds
-- a priority row ahead of already-queued typed work.
SELECT * FROM public.enqueue_conversation_turn(
  'steer-running', 'space-a', 'steer', 'work', 'typed',
  'steer-running-request', 'original direction', '[]', '[]', NULL
);
SELECT * FROM public.claim_conversation_turn_v2(
  'steer-running', 'space-a', 'steer', 'steer-running-request',
  'original direction', '[]', 'steer-attempt', 60
);
SELECT * FROM public.enqueue_conversation_turn(
  'steer-regular', 'space-a', 'steer', 'work', 'typed',
  'steer-regular-request', 'queued follow-up', '[]', '[]', NULL
);

DO $$
BEGIN
  PERFORM pg_temp.expect_error(
    $q$SELECT * FROM public.enqueue_conversation_turn(
      'steer-wrong-active', 'space-a', 'steer', 'work', 'steer',
      'steer-wrong-active-request', 'wrong active', '[]', '[]', 'steer-regular'
    )$q$,
    'active turn is not running'
  );
  PERFORM pg_temp.expect_error(
    $q$SELECT * FROM public.enqueue_conversation_turn(
      'steer-cross-conversation', 'space-a', 'steer', 'work', 'steer',
      'steer-cross-request', 'cross conversation', '[]', '[]', 'other-running'
    )$q$,
    'active turn is not running'
  );
  PERFORM pg_temp.expect_error(
    $q$SELECT * FROM public.enqueue_conversation_turn(
      'typed-with-active', 'space-a', 'steer', 'work', 'typed',
      'typed-with-active-request', 'not a steer', '[]', '[]', 'steer-running'
    )$q$,
    'active turn is only valid for steering'
  );

  IF EXISTS (
    SELECT 1 FROM public."ConversationTurn"
    WHERE id IN ('steer-wrong-active', 'steer-cross-conversation', 'typed-with-active')
  ) OR (SELECT "cancelRequestedAt" FROM public."ConversationTurn" WHERE id = 'other-running') IS NOT NULL
  THEN
    RAISE EXCEPTION 'rejected steering mutated durable state';
  END IF;
END;
$$;

SELECT * FROM public.enqueue_conversation_turn(
  'steer-priority', 'space-a', 'steer', 'work', 'steer',
  'steer-priority-request', 'change direction now',
  '["steer-file"]', '[{"id":"steer-file","name":"direction.txt"}]',
  'steer-running'
);
DO $$
BEGIN
  IF (SELECT "cancelRequestedAt" FROM public."ConversationTurn" WHERE id = 'steer-running') IS NULL
    OR (SELECT priority FROM public."ConversationTurn" WHERE id = 'steer-priority') <> 1
    OR (SELECT status FROM public."ConversationTurn" WHERE id = 'steer-priority') <> 'pending'
    OR (SELECT "cancelRequestedAt" FROM public."ConversationTurn" WHERE id = 'other-running') IS NOT NULL
  THEN
    RAISE EXCEPTION 'atomic steer did not cancel exactly and enqueue priority work';
  END IF;
END;
$$;
SELECT * FROM public.finish_conversation_turn_v2(
  'steer-running', 'space-a', 'steer', 'steer-attempt',
  'completed', 'completed', NULL, 60
);
DO $$
BEGIN
  IF (SELECT status FROM public."ConversationTurn" WHERE id = 'steer-running') <> 'cancelled'
  THEN
    RAISE EXCEPTION 'steered active turn did not settle cancelled';
  END IF;

  PERFORM pg_temp.expect_error(
    $q$SELECT * FROM public.claim_conversation_turn_v2(
      'steer-regular', 'space-a', 'steer', 'steer-regular-request',
      'queued follow-up', '[]', 'steer-regular-early', 60
    )$q$,
    'conversation turn is not queue head'
  );
END;
$$;
SELECT * FROM public.claim_conversation_turn_v2(
  'steer-priority', 'space-a', 'steer', 'steer-priority-request',
  'change direction now', '["steer-file"]', 'steer-priority-attempt', 60
);
SELECT * FROM public.finish_conversation_turn_v2(
  'steer-priority', 'space-a', 'steer', 'steer-priority-attempt',
  'completed', 'completed', NULL, 60
);
SELECT * FROM public.claim_conversation_turn_v2(
  'steer-regular', 'space-a', 'steer', 'steer-regular-request',
  'queued follow-up', '[]', 'steer-regular-attempt', 60
);
SELECT * FROM public.finish_conversation_turn_v2(
  'steer-regular', 'space-a', 'steer', 'steer-regular-attempt',
  'completed', 'completed', NULL, 60
);

-- Active cancellation requires the exact tenant, conversation, turn, and
-- attempt token; queued cancellation removes only the named durable row.
DO $$
BEGIN
  PERFORM pg_temp.expect_error(
    $q$SELECT * FROM public.request_conversation_turn_cancel_v2(
      'other-running', 'space-a', 'other-active', 'wrong-attempt'
    )$q$,
    'active conversation turn attempt not found'
  );
  PERFORM pg_temp.expect_error(
    $q$SELECT * FROM public.request_conversation_turn_cancel_v2(
      'other-running', 'space-a', 'steer', 'other-attempt'
    )$q$,
    'active conversation turn attempt not found'
  );
  IF (SELECT "cancelRequestedAt" FROM public."ConversationTurn" WHERE id = 'other-running') IS NOT NULL
  THEN
    RAISE EXCEPTION 'inexact cancellation mutated the active turn';
  END IF;
END;
$$;
SELECT * FROM public.request_conversation_turn_cancel_v2(
  'other-running', 'space-a', 'other-active', 'other-attempt'
);
SELECT * FROM public.finish_conversation_turn_v2(
  'other-running', 'space-a', 'other-active', 'other-attempt',
  'completed', 'completed', NULL, 60
);

SELECT * FROM public.enqueue_conversation_turn(
  'cancel-queued-1', 'space-a', 'cancel-queued', 'work', 'typed',
  'cancel-queued-request-1', 'remove me', '[]', '[]', NULL
);
SELECT * FROM public.enqueue_conversation_turn(
  'cancel-queued-2', 'space-a', 'cancel-queued', 'work', 'typed',
  'cancel-queued-request-2', 'keep me', '[]', '[]', NULL
);
DO $$
BEGIN
  PERFORM pg_temp.expect_error(
    $q$SELECT * FROM public.cancel_queued_conversation_turn(
      'cancel-queued-1', 'space-a', 'fifo'
    )$q$,
    'removable conversation turn not found'
  );
END;
$$;
SELECT * FROM public.cancel_queued_conversation_turn(
  'cancel-queued-1', 'space-a', 'cancel-queued'
);
DO $$
BEGIN
  IF (SELECT status FROM public."ConversationTurn" WHERE id = 'other-running') <> 'cancelled'
    OR (SELECT status FROM public."ConversationTurn" WHERE id = 'cancel-queued-1') <> 'cancelled'
    OR (SELECT status FROM public."ConversationTurn" WHERE id = 'cancel-queued-2') <> 'pending'
  THEN
    RAISE EXCEPTION 'exact cancellation touched the wrong durable row';
  END IF;
END;
$$;

-- Attachment IDs and sanitized manifests round-trip byte-for-byte as JSONB;
-- each array accepts 20 entries and rejects the 21st or a non-array value.
SELECT * FROM public.enqueue_conversation_turn(
  'attachment-roundtrip', 'space-a', 'attachments', 'work', 'typed',
  'attachment-roundtrip-request', 'review the attached files',
  '["file-a","file-b"]',
  '[{"id":"file-a","name":"cma.pdf","size":42,"type":"application/pdf"},
    {"id":"file-b","name":"notes.txt","size":7,"type":"text/plain"}]',
  NULL
);
DO $$
DECLARE
  v_twenty_ids jsonb;
  v_twenty_manifests jsonb;
  v_twenty_one_ids jsonb;
  v_twenty_one_manifests jsonb;
BEGIN
  IF (SELECT "attachmentIds" FROM public."ConversationTurn" WHERE id = 'attachment-roundtrip')
      <> '["file-a","file-b"]'::jsonb
    OR (SELECT attachments FROM public."ConversationTurn" WHERE id = 'attachment-roundtrip')
      <> '[{"id":"file-a","name":"cma.pdf","size":42,"type":"application/pdf"},
            {"id":"file-b","name":"notes.txt","size":7,"type":"text/plain"}]'::jsonb
  THEN
    RAISE EXCEPTION 'attachment manifest did not round-trip';
  END IF;

  SELECT jsonb_agg('file-' || i ORDER BY i),
         jsonb_agg(jsonb_build_object('id', 'file-' || i, 'name', 'file-' || i || '.txt') ORDER BY i)
  INTO v_twenty_ids, v_twenty_manifests
  FROM generate_series(1, 20) AS i;

  PERFORM public.enqueue_conversation_turn(
    'attachment-max', 'space-a', 'attachments', 'work', 'typed',
    'attachment-max-request', 'twenty files',
    v_twenty_ids, v_twenty_manifests, NULL
  );
  IF jsonb_array_length((SELECT "attachmentIds" FROM public."ConversationTurn" WHERE id = 'attachment-max')) <> 20
    OR jsonb_array_length((SELECT attachments FROM public."ConversationTurn" WHERE id = 'attachment-max')) <> 20
  THEN
    RAISE EXCEPTION 'attachment bound rejected or changed 20 entries';
  END IF;

  SELECT jsonb_agg('file-' || i ORDER BY i),
         jsonb_agg(jsonb_build_object('id', 'file-' || i, 'name', 'file-' || i || '.txt') ORDER BY i)
  INTO v_twenty_one_ids, v_twenty_one_manifests
  FROM generate_series(1, 21) AS i;

  PERFORM pg_temp.expect_error(
    format(
      'SELECT * FROM public.enqueue_conversation_turn(%L,%L,%L,%L,%L,%L,%L,%L::jsonb,%L::jsonb,NULL)',
      'attachment-too-many-ids', 'space-a', 'attachments', 'work', 'typed',
      'attachment-too-many-ids-request', 'too many ids',
      v_twenty_one_ids::text, '[]'
    ),
    'invalid conversation turn'
  );
  PERFORM pg_temp.expect_error(
    format(
      'SELECT * FROM public.enqueue_conversation_turn(%L,%L,%L,%L,%L,%L,%L,%L::jsonb,%L::jsonb,NULL)',
      'attachment-too-many-manifests', 'space-a', 'attachments', 'work', 'typed',
      'attachment-too-many-manifests-request', 'too many manifests',
      '[]', v_twenty_one_manifests::text
    ),
    'invalid conversation turn'
  );
  PERFORM pg_temp.expect_error(
    $q$SELECT * FROM public.enqueue_conversation_turn(
      'attachment-not-array', 'space-a', 'attachments', 'work', 'typed',
      'attachment-not-array-request', 'invalid manifest', '[]', '{}', NULL
    )$q$,
    'invalid conversation turn'
  );
END;
$$;

-- Every queue/lease RPC is callable only by service_role. Direct ledger
-- access is RLS-protected and granted only to the service role at minimum
-- required SELECT/INSERT/UPDATE scope (never DELETE).
DO $$
DECLARE
  v_proc oid;
  v_proc_count integer := 0;
BEGIN
  FOR v_proc IN
    SELECT p.oid
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'enqueue_conversation_turn',
        'claim_conversation_turn',
        'finish_conversation_turn',
        'request_conversation_turn_cancel',
        'cancel_queued_conversation_turn',
        'resume_paused_conversation_turn',
        'claim_conversation_turn_v2',
        'renew_conversation_turn_lease_v2',
        'finish_conversation_turn_v2',
        'request_conversation_turn_cancel_v2',
        'resume_paused_conversation_turn_v2',
        'recover_expired_conversation_turns'
      )
  LOOP
    v_proc_count := v_proc_count + 1;
    IF has_function_privilege('public', v_proc, 'EXECUTE')
      OR has_function_privilege('anon', v_proc, 'EXECUTE')
      OR has_function_privilege('authenticated', v_proc, 'EXECUTE')
      OR NOT has_function_privilege('service_role', v_proc, 'EXECUTE')
    THEN
      RAISE EXCEPTION 'unsafe queue RPC ACL on %', v_proc::regprocedure;
    END IF;
  END LOOP;

  IF v_proc_count <> 12 THEN
    RAISE EXCEPTION 'expected 12 queue/lease RPCs, found %', v_proc_count;
  END IF;

  IF has_table_privilege('public', 'public."ConversationTurn"', 'SELECT')
    OR has_table_privilege('anon', 'public."ConversationTurn"', 'SELECT')
    OR has_table_privilege('authenticated', 'public."ConversationTurn"', 'SELECT')
    OR has_table_privilege('service_role', 'public."ConversationTurn"', 'DELETE')
    OR NOT has_table_privilege('service_role', 'public."ConversationTurn"', 'SELECT')
    OR NOT has_table_privilege('service_role', 'public."ConversationTurn"', 'INSERT')
    OR NOT has_table_privilege('service_role', 'public."ConversationTurn"', 'UPDATE')
    OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public."ConversationTurn"'::regclass)
  THEN
    RAISE EXCEPTION 'unsafe ConversationTurn table ACL';
  END IF;
END;
$$;

-- Exercise the negative path as both browser-facing principals. If an RPC or
-- direct table grant leaks later, the sentinel exception is not caught.
SET ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.enqueue_conversation_turn(
      'acl-anon-turn', 'space-a', 'acl', 'work', 'typed',
      'acl-anon-request', 'must be denied', '[]', '[]', NULL
    );
    RAISE EXCEPTION 'anon unexpectedly executed queue RPC';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM 1 FROM public."ConversationTurn" LIMIT 1;
    RAISE EXCEPTION 'anon unexpectedly read ConversationTurn';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;
RESET ROLE;

SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.enqueue_conversation_turn(
      'acl-authenticated-turn', 'space-a', 'acl', 'work', 'typed',
      'acl-authenticated-request', 'must be denied', '[]', '[]', NULL
    );
    RAISE EXCEPTION 'authenticated unexpectedly executed queue RPC';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM 1 FROM public."ConversationTurn" LIMIT 1;
    RAISE EXCEPTION 'authenticated unexpectedly read ConversationTurn';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;
RESET ROLE;

-- Catalog checks and real denials prove the negative path; execute one real
-- enqueue through the service principal to prove the positive path under RLS.
SET ROLE service_role;
SELECT * FROM public.enqueue_conversation_turn(
  'acl-service-turn', 'space-a', 'acl', 'work', 'typed',
  'acl-service-request', 'service-only enqueue', '[]', '[]', NULL
);
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."ConversationTurn"
    WHERE id = 'acl-service-turn' AND "conversationId" = 'acl'
  ) THEN
    RAISE EXCEPTION 'service role could not use the queue RPC';
  END IF;
END;
$$;
SQL

echo "PASS: durable ConversationTurn queue binding, replay, capacity, order, steer, cancellation, attachments, and ACLs."
