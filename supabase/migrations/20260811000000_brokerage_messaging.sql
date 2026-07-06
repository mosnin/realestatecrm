-- ============================================================================
-- Brokerage Messaging: Channels, Direct Messages, Presence
-- ============================================================================
-- Slack-like real-time communication scoped to a Brokerage. Owners/admins and
-- their realtor members exchange messages in named channels and 1:1 DMs, with
-- read receipts and online/last-seen presence.
--
-- Tenancy: every row is scoped to a Brokerage (brokerageId). Access is granted
-- via ChannelMember rows — a user only ever sees channels they belong to.
-- Like the rest of the app, isolation is enforced in application code on the
-- service-role client; RLS below is defense-in-depth only.
--
-- Message KIND is forward-looking: 'text'/'file' ship now; 'file_request' and
-- 'deal_status_request' are reserved for the structured coaching actions that
-- land in the follow-up (they render as rich cards keyed off metadata).
--
-- All new columns/tables use IF NOT EXISTS + safe defaults so re-runs and
-- existing rows are unaffected.
-- ============================================================================

-- 1. Presence: when a user was last active (for "last seen" in the roster).
--    Online-now is derived from live Ably presence; this is the durable
--    fallback the brokerage sees when a member is offline.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "lastSeenAt" timestamptz;

-- 2. Channel — a named group channel OR a direct-message conversation.
--    kind='channel'  → named, has a name; visibility public/private
--    kind='dm'       → 1:1 (or small group); dmKey enforces a single DM per
--                       unique member set within a brokerage.
CREATE TABLE IF NOT EXISTS "Channel" (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "brokerageId" text NOT NULL REFERENCES "Brokerage"(id) ON DELETE CASCADE,
  kind          text NOT NULL DEFAULT 'channel' CHECK (kind IN ('channel', 'dm')),
  visibility    text NOT NULL DEFAULT 'public'  CHECK (visibility IN ('public', 'private')),
  name          text,
  topic         text,
  -- Canonical, sorted key of member userIds for DMs (e.g. "a:b"). NULL for
  -- named channels. Unique per brokerage so opening a DM is idempotent.
  "dmKey"       text,
  "createdById" text REFERENCES "User"(id) ON DELETE SET NULL,
  "archivedAt"  timestamptz,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_channel_brokerage ON "Channel"("brokerageId");
CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_dmkey
  ON "Channel"("brokerageId", "dmKey") WHERE "dmKey" IS NOT NULL;

-- 3. ChannelMember — who belongs to a channel + their per-channel read cursor.
--    role: 'owner' can rename/archive/manage members; 'member' can read/post.
CREATE TABLE IF NOT EXISTS "ChannelMember" (
  id                text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "channelId"       text NOT NULL REFERENCES "Channel"(id) ON DELETE CASCADE,
  "userId"          text NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  role              text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  -- Read cursor: everything at/before this message is considered read by this
  -- member. Drives unread badges and "seen by" receipts.
  "lastReadAt"      timestamptz,
  "lastReadMessageId" text,
  muted             boolean NOT NULL DEFAULT false,
  "joinedAt"        timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("channelId", "userId")
);
CREATE INDEX IF NOT EXISTS idx_channelmember_channel ON "ChannelMember"("channelId");
CREATE INDEX IF NOT EXISTS idx_channelmember_user    ON "ChannelMember"("userId");

-- 4. ChannelMessage — one message. brokerageId is denormalized for cheap
--    tenant scoping and cascade cleanup.
CREATE TABLE IF NOT EXISTS "ChannelMessage" (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "channelId"   text NOT NULL REFERENCES "Channel"(id) ON DELETE CASCADE,
  "brokerageId" text NOT NULL REFERENCES "Brokerage"(id) ON DELETE CASCADE,
  "senderId"    text REFERENCES "User"(id) ON DELETE SET NULL,
  kind          text NOT NULL DEFAULT 'text'
                  CHECK (kind IN ('text', 'file', 'file_request', 'deal_status_request', 'system')),
  body          text,
  -- Array of { fileId, name, url, size, contentType } for shared files.
  attachments   jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Structured payload for non-text kinds (e.g. { dealId } for a status request).
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "editedAt"    timestamptz,
  "deletedAt"   timestamptz
);
-- History reads walk a channel newest-first; this composite serves them.
CREATE INDEX IF NOT EXISTS idx_channelmessage_channel_created
  ON "ChannelMessage"("channelId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_channelmessage_brokerage ON "ChannelMessage"("brokerageId");
CREATE INDEX IF NOT EXISTS idx_channelmessage_sender    ON "ChannelMessage"("senderId");

-- 5. RLS (defense-in-depth; the service role bypasses these). We enable RLS so
--    the anon/authenticated roles can never read messaging data directly, and
--    add member-scoped SELECT policies mirroring the app's access rule.
ALTER TABLE "Channel"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChannelMember"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChannelMessage" ENABLE ROW LEVEL SECURITY;

-- A user may see a channel (and its messages) only if they are a member of it.
-- current_user_internal_id() maps auth.uid() → "User".id (defined in the
-- 20260314000000_rls_policies migration).
DROP POLICY IF EXISTS channel_member_select ON "Channel";
CREATE POLICY channel_member_select ON "Channel"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "ChannelMember" cm
      WHERE cm."channelId" = "Channel".id
        AND cm."userId" = current_user_internal_id()
    )
  );

DROP POLICY IF EXISTS channelmember_self_select ON "ChannelMember";
CREATE POLICY channelmember_self_select ON "ChannelMember"
  FOR SELECT USING (
    "userId" = current_user_internal_id()
    OR EXISTS (
      SELECT 1 FROM "ChannelMember" mine
      WHERE mine."channelId" = "ChannelMember"."channelId"
        AND mine."userId" = current_user_internal_id()
    )
  );

DROP POLICY IF EXISTS channelmessage_member_select ON "ChannelMessage";
CREATE POLICY channelmessage_member_select ON "ChannelMessage"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "ChannelMember" cm
      WHERE cm."channelId" = "ChannelMessage"."channelId"
        AND cm."userId" = current_user_internal_id()
    )
  );
