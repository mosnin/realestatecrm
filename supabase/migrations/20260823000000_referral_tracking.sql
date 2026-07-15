-- ============================================================================
-- Referral tracking: who referred whom
-- ============================================================================
-- WHY: a solo realtor's best pipeline is their past clients' referrals. To let
-- the Past-Client Reactivation & Referral Engine (lib/reactivation.ts) rank a
-- realtor's best advocates, a new lead can record which existing contact
-- referred them. `topReferrers(spaceId)` tallies these to answer "who sends me
-- the most business?".
--
-- Self-referential, nullable FK on Contact. ON DELETE SET NULL so deleting the
-- referrer keeps the referred contact's row intact (the link just clears) — the
-- same honesty stance the sibling nullable FKs take (ReviewCampaign.dealId).
-- Append-only + idempotent (ADD COLUMN IF NOT EXISTS); the app-level
-- .eq('spaceId') scope remains the tenant boundary (service role bypasses RLS).
-- ============================================================================

ALTER TABLE "Contact"
  ADD COLUMN IF NOT EXISTS "referredByContactId" text
    REFERENCES "Contact"(id) ON DELETE SET NULL;

-- topReferrers scans referred rows per space, then groups by referrer.
-- Partial index keeps it to the (few) rows that actually carry a referrer.
CREATE INDEX IF NOT EXISTS "Contact_referredBy_idx"
  ON "Contact" ("spaceId", "referredByContactId")
  WHERE "referredByContactId" IS NOT NULL;
