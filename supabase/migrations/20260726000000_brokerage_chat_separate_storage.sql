-- ============================================================================
-- Brokerage team chat conversations move to their OWN tables.
--
-- WHY
-- Broker Chippi was already migrated out of the shared realtor chat tables in
-- 20260616000000_broker_chat_separate_storage.sql. That migration explicitly
-- left team chat ('[BROKERAGE_CHAT]%') in "Conversation" / "Message" as live
-- storage. As long as team chat rows share the realtor tables, every realtor
-- read path must remember to filter the reserved prefix. This migration removes
-- that structural bleed-over risk for team chat too.
--
-- SAFETY
-- This is additive and idempotent. It creates dedicated brokerage-scoped team
-- chat tables, backfills legacy '[BROKERAGE_CHAT] <brokerageId>' rows, and does
-- NOT delete from "Conversation" / "Message". A later purge can remove legacy
-- rows only after production verification proves the new tables carry the full
-- history.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "BrokerageChatConversation" (
  "id"          text PRIMARY KEY,
  "brokerageId" text NOT NULL REFERENCES "Brokerage"(id) ON DELETE CASCADE,
  "title"       text NOT NULL DEFAULT 'Team chat',
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "BrokerageChatConversation_brokerageId_updatedAt_idx"
  ON "BrokerageChatConversation" ("brokerageId", "updatedAt" DESC);

CREATE TABLE IF NOT EXISTS "BrokerageChatMessage" (
  "id"             text PRIMARY KEY,
  "brokerageId"    text NOT NULL REFERENCES "Brokerage"(id) ON DELETE CASCADE,
  "conversationId" text NOT NULL REFERENCES "BrokerageChatConversation"(id) ON DELETE CASCADE,
  "senderUserId"   text REFERENCES "User"(id) ON DELETE SET NULL,
  "role"           text NOT NULL,
  "content"        text NOT NULL DEFAULT '',
  "blocks"         jsonb,
  "createdAt"      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "BrokerageChatMessage_conversationId_createdAt_idx"
  ON "BrokerageChatMessage" ("conversationId", "createdAt");

CREATE INDEX IF NOT EXISTS "BrokerageChatMessage_brokerageId_createdAt_idx"
  ON "BrokerageChatMessage" ("brokerageId", "createdAt");

-- Deny browser/anon access by default. The app server uses the service role,
-- which bypasses RLS; if a browser-read surface is added later, add scoped
-- policies in that follow-up instead of weakening these tables.
ALTER TABLE IF EXISTS "BrokerageChatConversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "BrokerageChatMessage"      ENABLE ROW LEVEL SECURITY;

-- Backfill legacy team chat conversations. The historical title convention
-- mirrors broker Chippi: '[BROKERAGE_CHAT] <brokerageId> ...'. We take the
-- first whitespace-delimited token after the prefix and join to Brokerage so
-- malformed titles are skipped instead of violating the FK.
INSERT INTO "BrokerageChatConversation" ("id", "brokerageId", "title", "createdAt", "updatedAt")
SELECT
  c."id",
  b."id" AS "brokerageId",
  c."title",
  c."createdAt",
  c."updatedAt"
FROM "Conversation" c
JOIN "Brokerage" b
  ON b."id" = split_part(substring(c."title" FROM char_length('[BROKERAGE_CHAT] ') + 1), ' ', 1)
WHERE c."title" LIKE '[BROKERAGE_CHAT] %'
ON CONFLICT ("id") DO NOTHING;

-- Backfill legacy team chat messages only when the parent conversation made it
-- into the dedicated table. brokerageId comes from the parent so child rows
-- cannot drift across brokerages.
INSERT INTO "BrokerageChatMessage" ("id", "brokerageId", "conversationId", "role", "content", "blocks", "createdAt")
SELECT
  m."id",
  bcc."brokerageId",
  m."conversationId",
  m."role",
  m."content",
  m."blocks",
  m."createdAt"
FROM "Message" m
JOIN "BrokerageChatConversation" bcc
  ON bcc."id" = m."conversationId"
ON CONFLICT ("id") DO NOTHING;
