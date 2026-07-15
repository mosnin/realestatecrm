-- ============================================================================
-- ReviewCampaign: the Post-Close Reputation Engine
-- ============================================================================
-- WHY: when a deal is marked won, Chippi drafts a warm, grounded review
-- request in the realtor's voice, sends a tracked review link, and — if the
-- client hasn't clicked within a few days — drafts ONE polite nudge, then logs
-- the outcome. A solo agent's most valuable, most-forgotten marketing action.
--
-- One row per (space, deal) — the review ask fires at most once per deal
-- (lib/reputation/review-engine.ts enforces this with a select-check; the
-- unique index below is the race backstop).
--
-- Lifecycle (the `status` column):
--   'drafted'   — campaign row created, draft being composed
--   'sent'      — the pending AgentDraft ask was created (nudge cron keys on
--                 this + sentAt); realtor still reviews/approves the outbound
--   'clicked'   — the client hit the tracked redirect (/api/reviews/[id])
--   'completed' — reserved for a future "review posted" confirmation
--   'skipped'   — reserved for explicit opt-out
--
-- Conventions mirror the sibling tables (AppNotification, AgentDraft): quoted
-- camelCase columns, text PK/FK, ON DELETE CASCADE, RLS deny-all (every server
-- consumer uses the service-role client, which BYPASSES RLS; the app-level
-- .eq('spaceId') scope is the security boundary). Idempotent throughout.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "ReviewCampaign" (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"    text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  -- Nullable FKs: the deal/contact can be deleted while the campaign audit row
  -- lives on. SET NULL keeps the outcome log honest without a dangling ref.
  "dealId"     text REFERENCES "Deal"(id) ON DELETE SET NULL,
  "contactId"  text REFERENCES "Contact"(id) ON DELETE SET NULL,
  -- 'email' | 'sms' — how the ask was drafted to reach the client.
  channel      text,
  -- The realtor's configured Google/Zillow review URL, snapshotted at send
  -- time so the tracked redirect (/api/reviews/[id]) always resolves even if
  -- the space later changes its SpaceSetting.reviewUrl.
  "reviewUrl"  text,
  status       text NOT NULL DEFAULT 'drafted'
                 CHECK (status IN ('drafted', 'sent', 'clicked', 'completed', 'skipped')),
  "sentAt"     timestamptz,
  "clickedAt"  timestamptz,
  -- Set when the nudge cron drafts the single follow-up so it never
  -- double-nudges a campaign.
  "nudgedAt"   timestamptz,
  "createdAt"  timestamptz NOT NULL DEFAULT now(),
  "updatedAt"  timestamptz NOT NULL DEFAULT now()
);

-- One campaign per deal — the app-level dedupe's race backstop.
CREATE UNIQUE INDEX IF NOT EXISTS "ReviewCampaign_space_deal_key"
  ON "ReviewCampaign" ("spaceId", "dealId")
  WHERE "dealId" IS NOT NULL;

-- The nudge cron's hot scan: sent, un-clicked, un-nudged, ordered by sentAt.
CREATE INDEX IF NOT EXISTS "ReviewCampaign_nudge_scan_idx"
  ON "ReviewCampaign" (status, "sentAt")
  WHERE status = 'sent' AND "clickedAt" IS NULL AND "nudgedAt" IS NULL;

-- The Brief reputation cell: recent campaigns for a space, newest first.
CREATE INDEX IF NOT EXISTS "ReviewCampaign_space_createdAt_idx"
  ON "ReviewCampaign" ("spaceId", "createdAt" DESC);

ALTER TABLE "ReviewCampaign" ENABLE ROW LEVEL SECURITY;

-- RLS on + no permissive policy = deny all. ReviewCampaign is never read via
-- the browser anon client or Realtime; the explicit RESTRICTIVE anon-deny
-- keeps the denial unconditional and Supabase's advisor quiet (matches
-- 20260818000000_rls_close_remaining_tenant_tables.sql). Writes stay
-- service-role only.
DROP POLICY IF EXISTS deny_anon_reviewcampaign_select ON "ReviewCampaign";
CREATE POLICY deny_anon_reviewcampaign_select ON "ReviewCampaign"
  AS RESTRICTIVE FOR SELECT TO anon USING (false);

REVOKE ALL ON "ReviewCampaign" FROM anon;
REVOKE INSERT, UPDATE, DELETE ON "ReviewCampaign" FROM authenticated;

-- ── SpaceSetting.reviewUrl ──────────────────────────────────────────────────
-- The realtor's Google/Zillow (or any) public review link. Lives on
-- SpaceSetting (one-to-one with Space) alongside the other per-space
-- preferences (briefEnabled, timezone, businessName…) rather than a new table.
-- NULL by default: the Reputation Engine skips a space entirely until the
-- realtor configures where reviews should go — no reviewUrl, no review ask.
ALTER TABLE "SpaceSetting"
  ADD COLUMN IF NOT EXISTS "reviewUrl" text;
