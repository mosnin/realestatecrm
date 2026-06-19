-- ============================================================================
-- NotificationPreference + digest cadence: per-member overrides and roll-ups
-- ============================================================================
-- WHY (two additive, default-OFF pieces — no behavior change for anyone who
-- doesn't opt in):
--
--   1. DIGEST CADENCE. Today every notable event (new lead / tour / deal /
--      follow-up) fires its own email the moment it happens (lib/notify.ts).
--      For a busy realtor that's a lot of one-off mail. This adds an opt-in
--      DAILY or WEEKLY roll-up: a new cron (app/api/cron/notification-digest)
--      batches the period's events and sends ONE summary email. When a digest
--      covers an event type, the per-event EMAIL for that type is suppressed
--      (SMS/push are unchanged). Default cadence is 'off' → the per-event path
--      behaves exactly as before.
--
--   2. PER-MEMBER PREFERENCES. Notification prefs live on SpaceSetting today,
--      so in a brokerage a member can't tune their own — they inherit the
--      space-level toggles. This adds a per-(space, user) override layer:
--      channels, which event types, and digest cadence. Effective preference =
--      member override ?? space default. A NULL column on the override means
--      "inherit the space default", so an opted-in member only overrides what
--      they explicitly set.
--
-- Two storage changes:
--   * SpaceSetting gains `digestCadence` ('off'|'daily'|'weekly', default
--     'off') and `lastDigestAt` — the SPACE-LEVEL digest default + the
--     idempotency stamp for the owner's space-default digest.
--   * NotificationPreference is the per-member override table, keyed by
--     (spaceId, userId). `userId` is the Clerk user id, matching the
--     convention used by NotificationState (20260706000000).
--
-- Conventions mirror 20260716000000_saved_views.sql (quoted camelCase columns,
-- gen_random_uuid()::text PK, ON DELETE CASCADE to "Space") and the RLS shape
-- from the integration tables — see the RLS block at the bottom.
-- Idempotent: safe to re-run (IF NOT EXISTS everywhere + ADD COLUMN IF NOT
-- EXISTS heal block + DROP POLICY IF EXISTS before CREATE POLICY).
-- ============================================================================

-- ── 1. Space-level digest default + idempotency stamp ───────────────────────
-- digestCadence: the space's default cadence. 'off' (the default) preserves the
-- current per-event behavior verbatim. lastDigestAt: when the owner's space-
-- default digest last went out — the digest cron uses it to stay idempotent per
-- period (a re-trigger within the same day/week is a no-op).
ALTER TABLE "SpaceSetting"
  ADD COLUMN IF NOT EXISTS "digestCadence" text NOT NULL DEFAULT 'off';
ALTER TABLE "SpaceSetting"
  ADD COLUMN IF NOT EXISTS "lastDigestAt" timestamptz;

-- Constrain to the three legal values. Added separately + guarded so the
-- migration is safe to re-run and safe on a table that already has the column.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SpaceSetting_digestCadence_check'
  ) THEN
    ALTER TABLE "SpaceSetting"
      ADD CONSTRAINT "SpaceSetting_digestCadence_check"
      CHECK ("digestCadence" IN ('off', 'daily', 'weekly'));
  END IF;
END $$;

-- ── 2. Per-member override table ────────────────────────────────────────────
-- One row per (space, member). Every preference column is NULLABLE on purpose:
-- NULL means "inherit the space default", so a member overrides only the knobs
-- they explicitly touch. The resolver (lib/notify-prefs.ts) coalesces each
-- field against the SpaceSetting default.
--
--   channels   — which delivery channels this member wants. JSON object,
--                e.g. {"email":true,"sms":false,"push":true}. NULL = inherit.
--   eventTypes — which event types this member wants notified. JSON object,
--                e.g. {"newLeads":true,"tourBookings":false,"newDeals":true,
--                "followUps":true}. NULL = inherit the space's notify* toggles.
--   digestCadence — this member's cadence ('off'|'daily'|'weekly'). NULL =
--                inherit the space default. Same suppression semantics.
--   lastDigestAt — per-member idempotency stamp for their digest period.
CREATE TABLE IF NOT EXISTS "NotificationPreference" (
  "id"            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"       text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  -- Clerk user id of the member. NOT a FK to "User" (which is keyed on its own
  -- id, not clerkId) — mirrors NotificationState.userId.
  "userId"        text NOT NULL,
  "channels"      jsonb,
  "eventTypes"    jsonb,
  "digestCadence" text,
  "lastDigestAt"  timestamptz,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now()
);

-- Re-run safety: bring an older partial table up to spec without erroring.
ALTER TABLE "NotificationPreference" ADD COLUMN IF NOT EXISTS "spaceId" text;
ALTER TABLE "NotificationPreference" ADD COLUMN IF NOT EXISTS "userId" text;
ALTER TABLE "NotificationPreference" ADD COLUMN IF NOT EXISTS "channels" jsonb;
ALTER TABLE "NotificationPreference" ADD COLUMN IF NOT EXISTS "eventTypes" jsonb;
ALTER TABLE "NotificationPreference" ADD COLUMN IF NOT EXISTS "digestCadence" text;
ALTER TABLE "NotificationPreference" ADD COLUMN IF NOT EXISTS "lastDigestAt" timestamptz;
ALTER TABLE "NotificationPreference" ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT now();
ALTER TABLE "NotificationPreference" ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now();

-- Same three-value guard for the override's cadence (NULL allowed = inherit).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'NotificationPreference_digestCadence_check'
  ) THEN
    ALTER TABLE "NotificationPreference"
      ADD CONSTRAINT "NotificationPreference_digestCadence_check"
      CHECK ("digestCadence" IS NULL OR "digestCadence" IN ('off', 'daily', 'weekly'));
  END IF;
END $$;

-- One override row per (space, user). The settings route + cron upsert on this
-- pair.
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationPreference_space_user_key"
  ON "NotificationPreference" ("spaceId", "userId");

-- Digest cron read path: find every override opted into a cadence in one shot.
CREATE INDEX IF NOT EXISTS "NotificationPreference_digestCadence_idx"
  ON "NotificationPreference" ("digestCadence")
  WHERE "digestCadence" IS NOT NULL AND "digestCadence" <> 'off';

ALTER TABLE "NotificationPreference" ENABLE ROW LEVEL SECURITY;

-- ── RLS — defense-in-depth, mirrors the integration / saved-view tables ──────
-- All app access is via the service-role key (lib/supabase.ts), which BYPASSES
-- RLS; ownership is enforced at the route layer (requireSpaceOwner). This
-- SELECT policy exists for least-privilege posture and to protect against a
-- future browser/anon path; it buys zero security for the current server flow
-- and cannot break it. Scope by space ownership through Clerk's userId, exactly
-- like saved_view_authenticated_select.
DROP POLICY IF EXISTS "notification_preference_authenticated_select" ON "NotificationPreference";
CREATE POLICY "notification_preference_authenticated_select" ON "NotificationPreference"
  FOR SELECT TO authenticated
  USING (
    "spaceId" IN (
      SELECT s.id FROM "Space" s
      JOIN "User" u ON u.id = s."ownerId"
      WHERE u."clerkId" = auth.jwt() ->> 'sub'
    )
  );
REVOKE ALL ON "NotificationPreference" FROM anon, authenticated;
GRANT SELECT ON "NotificationPreference" TO authenticated;
