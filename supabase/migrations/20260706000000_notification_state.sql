-- ============================================================================
-- NotificationState: per-realtor read / dismiss state for the dashboard bell
-- ============================================================================
-- WHY: The realtor header bell (components/dashboard/notification-center.tsx)
-- shows notifications that are COMPUTED in real time from CRM data — new leads,
-- upcoming tours, due follow-ups, the waitlist, tours needing follow-up. They
-- are NOT stored rows, so there was nowhere to record that a realtor has seen
-- or dismissed one. The result: viewing a notification did nothing, the list
-- never cleared, and the unread badge was permanent.
--
-- This table is the durable side-channel that records, per realtor + per
-- workspace, which derived notification "keys" have been READ or DISMISSED.
-- The GET /api/notifications route joins against it to hide dismissed items and
-- to drop read items from the unread list; the PATCH route stamps the action.
--
-- KEY = the deterministic notification id the GET route already mints
-- ("new-leads", "tour-<id>", "followup-<id>", "waitlist",
-- "tours-need-action"). Because the same key is regenerated on every fetch
-- while the underlying condition holds, we also stamp the SOURCE timestamp the
-- notification carried when it was acted on (`sourceCreatedAt`). A
-- regenerated notification only re-surfaces if its source timestamp is NEWER
-- than what we stamped — so genuinely new activity reappears, but the exact
-- item the realtor already handled stays gone.
--
-- Scoped by (spaceId, userId, key): read/dismiss is per-person. A broker who
-- can also see a managed space gets their own independent state.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "NotificationState" (
  id                text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"         text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "userId"          text NOT NULL,
  key               text NOT NULL,
  "readAt"          timestamptz,
  "dismissedAt"     timestamptz,
  -- The createdAt the notification carried when it was last acted on. Used to
  -- decide whether a later, fresher occurrence of the same key should reappear.
  "sourceCreatedAt" timestamptz,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedAt"       timestamptz NOT NULL DEFAULT now()
);

-- Re-run safety if a prior partial run created the table without all columns.
ALTER TABLE "NotificationState" ADD COLUMN IF NOT EXISTS "spaceId" text;
ALTER TABLE "NotificationState" ADD COLUMN IF NOT EXISTS "userId" text;
ALTER TABLE "NotificationState" ADD COLUMN IF NOT EXISTS key text;
ALTER TABLE "NotificationState" ADD COLUMN IF NOT EXISTS "readAt" timestamptz;
ALTER TABLE "NotificationState" ADD COLUMN IF NOT EXISTS "dismissedAt" timestamptz;
ALTER TABLE "NotificationState" ADD COLUMN IF NOT EXISTS "sourceCreatedAt" timestamptz;
ALTER TABLE "NotificationState" ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT now();
ALTER TABLE "NotificationState" ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now();

-- One state row per (space, user, notification key). The API upserts on this
-- triple, flipping readAt / dismissedAt as the realtor acts.
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationState_space_user_key_key"
  ON "NotificationState" ("spaceId", "userId", key);

-- The hot read path: load all of a realtor's state for a workspace in one shot.
CREATE INDEX IF NOT EXISTS "NotificationState_space_user_idx"
  ON "NotificationState" ("spaceId", "userId");

-- RLS — defense-in-depth only. The /api/notifications routes use the Supabase
-- service-role key and enforce access via requireSpaceOwner at the route layer.
-- RLS is enabled to block direct client-side reads/writes via the anon key; no
-- policies are defined because no code path hits this table with a non-service
-- role. If direct client queries are ever exposed, add policies in a follow-up
-- migration — do NOT loosen the enable here.
ALTER TABLE "NotificationState" ENABLE ROW LEVEL SECURITY;
