-- ============================================================================
-- Threaded inbox: InboxThread + InboxMessage
-- ============================================================================
-- WHY: today inbound messages from a contact are never captured as
-- contact-resolved messages, and an approved AgentDraft that gets sent leaves
-- no message record behind — so there is no single, contact-scoped transcript
-- of "what was said, in and out, on every channel". These two tables are the
-- durable home for that transcript.
--
-- Threading model is PER CONTACT (one open thread per contact per space), and
-- the channel lives on each MESSAGE — a single thread can interleave email,
-- sms, portal and note messages with the same person. This phase is purely the
-- storage layer; later phases wire inbound capture, outbound sends, the UI, and
-- cadences. Nothing reads or writes these tables yet.
--
-- A row in InboxThread is the rollup for one (spaceId, contactId): when the
-- last message landed, which direction it was, and how many inbound messages
-- are still unread. A row in InboxMessage is one message on the thread.
--
-- Conventions mirror 20260705000000_integration_event.sql and
-- 20260716000000_saved_views.sql (quoted camelCase columns,
-- gen_random_uuid()::text PKs, ON DELETE CASCADE to "Space"/"Contact", and the
-- authenticated-select RLS shape at the bottom). Idempotent: safe to re-run
-- (IF NOT EXISTS everywhere + ADD COLUMN IF NOT EXISTS heal blocks + DROP
-- POLICY IF EXISTS before CREATE POLICY). Validated to apply twice cleanly on
-- Postgres 16.
-- ============================================================================

-- ── InboxThread ──────────────────────────────────────────────────────────────
-- One thread per (spaceId, contactId). lastDirection/lastMessageAt/unreadCount
-- are the denormalised rollup the inbox list reads without touching messages.
CREATE TABLE IF NOT EXISTS "InboxThread" (
  "id"             text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"        text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "contactId"      text NOT NULL REFERENCES "Contact"(id) ON DELETE CASCADE,
  -- When the most recent message (either direction) landed on this thread.
  "lastMessageAt"  timestamptz NOT NULL DEFAULT now(),
  -- Direction of that most recent message. Nullable: a thread created ahead of
  -- its first message has no direction yet.
  "lastDirection"  text CHECK ("lastDirection" IN ('inbound', 'outbound')),
  -- Count of inbound messages not yet read. Bumped on inbound, zeroed on read.
  "unreadCount"    integer NOT NULL DEFAULT 0,
  "status"         text NOT NULL DEFAULT 'open' CHECK ("status" IN ('open', 'closed')),
  "createdAt"      timestamptz NOT NULL DEFAULT now(),
  "updatedAt"      timestamptz NOT NULL DEFAULT now(),
  -- Exactly one thread per contact per space — the upsert anchor in lib/inbox.ts.
  CONSTRAINT "InboxThread_space_contact_unique" UNIQUE ("spaceId", "contactId")
);

-- Re-run safety: bring an earlier partial table up to spec without erroring.
ALTER TABLE "InboxThread" ADD COLUMN IF NOT EXISTS "spaceId"       text;
ALTER TABLE "InboxThread" ADD COLUMN IF NOT EXISTS "contactId"     text;
ALTER TABLE "InboxThread" ADD COLUMN IF NOT EXISTS "lastMessageAt" timestamptz NOT NULL DEFAULT now();
ALTER TABLE "InboxThread" ADD COLUMN IF NOT EXISTS "lastDirection" text;
ALTER TABLE "InboxThread" ADD COLUMN IF NOT EXISTS "unreadCount"   integer NOT NULL DEFAULT 0;
ALTER TABLE "InboxThread" ADD COLUMN IF NOT EXISTS "status"        text NOT NULL DEFAULT 'open';
ALTER TABLE "InboxThread" ADD COLUMN IF NOT EXISTS "createdAt"     timestamptz NOT NULL DEFAULT now();
ALTER TABLE "InboxThread" ADD COLUMN IF NOT EXISTS "updatedAt"     timestamptz NOT NULL DEFAULT now();

-- The inbox list read path: a space's threads, most-recently-active first.
CREATE INDEX IF NOT EXISTS "InboxThread_space_lastMessageAt_idx"
  ON "InboxThread" ("spaceId", "lastMessageAt" DESC);

-- ── InboxMessage ─────────────────────────────────────────────────────────────
-- One message on a thread. channel is per-message (a thread interleaves
-- channels). externalId is the provider id (gmail message id, sms sid, …) used
-- for webhook idempotency via the partial unique index below.
CREATE TABLE IF NOT EXISTS "InboxMessage" (
  "id"            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"       text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "threadId"      text NOT NULL REFERENCES "InboxThread"(id) ON DELETE CASCADE,
  "contactId"     text NOT NULL REFERENCES "Contact"(id) ON DELETE CASCADE,
  "direction"     text NOT NULL CHECK ("direction" IN ('inbound', 'outbound')),
  "channel"       text NOT NULL CHECK ("channel" IN ('email', 'sms', 'portal', 'note')),
  "subject"       text,
  "body"          text NOT NULL,
  -- Provider message id (gmail id / twilio sid / …). NULL for messages with no
  -- external origin (e.g. internal notes). The webhook-idempotency anchor.
  "externalId"    text,
  -- The approved draft this outbound message was sent from, when applicable.
  -- ON DELETE SET NULL: the transcript outlives the draft row.
  "agentDraftId"  text REFERENCES "AgentDraft"(id) ON DELETE SET NULL,
  "metadata"      jsonb,
  -- When this (inbound) message was marked read. NULL = unread.
  "readAt"        timestamptz,
  "createdAt"     timestamptz NOT NULL DEFAULT now()
);

-- Re-run safety.
ALTER TABLE "InboxMessage" ADD COLUMN IF NOT EXISTS "spaceId"      text;
ALTER TABLE "InboxMessage" ADD COLUMN IF NOT EXISTS "threadId"     text;
ALTER TABLE "InboxMessage" ADD COLUMN IF NOT EXISTS "contactId"    text;
ALTER TABLE "InboxMessage" ADD COLUMN IF NOT EXISTS "direction"    text;
ALTER TABLE "InboxMessage" ADD COLUMN IF NOT EXISTS "channel"      text;
ALTER TABLE "InboxMessage" ADD COLUMN IF NOT EXISTS "subject"      text;
ALTER TABLE "InboxMessage" ADD COLUMN IF NOT EXISTS "body"         text;
ALTER TABLE "InboxMessage" ADD COLUMN IF NOT EXISTS "externalId"   text;
ALTER TABLE "InboxMessage" ADD COLUMN IF NOT EXISTS "agentDraftId" text;
ALTER TABLE "InboxMessage" ADD COLUMN IF NOT EXISTS "metadata"     jsonb;
ALTER TABLE "InboxMessage" ADD COLUMN IF NOT EXISTS "readAt"       timestamptz;
ALTER TABLE "InboxMessage" ADD COLUMN IF NOT EXISTS "createdAt"    timestamptz NOT NULL DEFAULT now();

-- The thread read path: a thread's messages in chronological order.
CREATE INDEX IF NOT EXISTS "InboxMessage_thread_createdAt_idx"
  ON "InboxMessage" ("threadId", "createdAt" ASC);

-- Webhook idempotency: at most one message per (spaceId, channel, externalId).
-- Partial so the many rows without an externalId (notes, etc.) never collide on
-- a shared NULL. This is the dedupe anchor lib/inbox.ts relies on.
CREATE UNIQUE INDEX IF NOT EXISTS "InboxMessage_space_channel_externalId_unique"
  ON "InboxMessage" ("spaceId", "channel", "externalId")
  WHERE "externalId" IS NOT NULL;

-- ── RLS — defense-in-depth, mirrors the integration tables ──────────────────
-- All app access is via the service-role key (lib/supabase.ts), which BYPASSES
-- RLS; ownership is enforced at the server boundary (the helpers in
-- lib/inbox.ts run server-side only). These SELECT policies exist for
-- least-privilege posture and to protect against a future browser/anon path;
-- they buy zero security for the current server flow and cannot break it. Scope
-- by space ownership through Clerk's userId, exactly like
-- integration_event_authenticated_select / saved_view_authenticated_select.
ALTER TABLE "InboxThread"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InboxMessage" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inbox_thread_authenticated_select" ON "InboxThread";
CREATE POLICY "inbox_thread_authenticated_select" ON "InboxThread"
  FOR SELECT TO authenticated
  USING (
    "spaceId" IN (
      SELECT s.id FROM "Space" s
      JOIN "User" u ON u.id = s."ownerId"
      WHERE u."clerkId" = auth.jwt() ->> 'sub'
    )
  );
REVOKE ALL ON "InboxThread" FROM anon, authenticated;
GRANT SELECT ON "InboxThread" TO authenticated;

DROP POLICY IF EXISTS "inbox_message_authenticated_select" ON "InboxMessage";
CREATE POLICY "inbox_message_authenticated_select" ON "InboxMessage"
  FOR SELECT TO authenticated
  USING (
    "spaceId" IN (
      SELECT s.id FROM "Space" s
      JOIN "User" u ON u.id = s."ownerId"
      WHERE u."clerkId" = auth.jwt() ->> 'sub'
    )
  );
REVOKE ALL ON "InboxMessage" FROM anon, authenticated;
GRANT SELECT ON "InboxMessage" TO authenticated;
