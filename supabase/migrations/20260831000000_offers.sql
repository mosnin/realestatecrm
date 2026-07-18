-- ============================================================================
-- Offer lifecycle tracker
-- ============================================================================
-- WHY: agents juggle multiple competing offers per listing with no structured
-- place to track them. Offer is a lightweight, space-scoped record of a single
-- offer (which may or may not yet be tied to a Deal — an agent often tracks an
-- incoming offer before a Deal row exists for it), and OfferEvent is its
-- append-only status-history log, written by every transition in
-- lib/offers.ts so the board can show "why is this here" at a glance.
--
-- Conventions mirror the sibling tables (ReviewCampaign, ReferralTracking):
-- quoted camelCase columns, text PK/FK, ON DELETE CASCADE for the owning
-- space, RLS deny-all (every server consumer uses the service-role client,
-- which BYPASSES RLS; the app-level .eq('spaceId') scope is the security
-- boundary — see lib/tenant-db.ts). Idempotent throughout — safe to re-run.
--
-- OPS-GATED: this migration is NOT auto-applied. It lands in git only; a
-- human runs it per docs/RELEASE.md. Do not assume it is live in prod.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "Offer" (
  id               text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"        text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  -- Nullable: an agent may track an offer before a Deal row exists for it
  -- (e.g. a buyer submits before the deal is created), or the offer never
  -- converts into a deal at all. SET NULL keeps the offer's own history
  -- intact if the linked deal is later deleted.
  "dealId"         text REFERENCES "Deal"(id) ON DELETE SET NULL,
  "propertyAddress" text,
  "buyerName"      text NOT NULL,
  amount           numeric,
  status           text NOT NULL DEFAULT 'draft'
                     CHECK (status IN (
                       'draft', 'submitted', 'countered', 'accepted',
                       'rejected', 'withdrawn', 'expired'
                     )),
  "expiresAt"      timestamptz,
  terms            jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes            text,
  "createdAt"      timestamptz NOT NULL DEFAULT now(),
  "updatedAt"      timestamptz NOT NULL DEFAULT now()
);

-- Board query: all offers for a space, newest first.
CREATE INDEX IF NOT EXISTS "Offer_space_createdAt_idx"
  ON "Offer" ("spaceId", "createdAt" DESC);

-- Board grouping + the expiring-soon scan (active offers with an expiry).
CREATE INDEX IF NOT EXISTS "Offer_space_status_idx"
  ON "Offer" ("spaceId", status);

CREATE INDEX IF NOT EXISTS "Offer_space_expiresAt_idx"
  ON "Offer" ("spaceId", "expiresAt")
  WHERE "expiresAt" IS NOT NULL;

-- Deal detail integration (next wave): offers linked to a given deal.
CREATE INDEX IF NOT EXISTS "Offer_dealId_idx"
  ON "Offer" ("dealId")
  WHERE "dealId" IS NOT NULL;

ALTER TABLE "Offer" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_anon_offer_select ON "Offer";
CREATE POLICY deny_anon_offer_select ON "Offer"
  AS RESTRICTIVE FOR SELECT TO anon USING (false);

REVOKE ALL ON "Offer" FROM anon;
REVOKE INSERT, UPDATE, DELETE ON "Offer" FROM authenticated;

-- ── OfferEvent: append-only status-history log ──────────────────────────────
-- One row per status transition (lib/offers.ts's `transition()` is the only
-- writer). fromStatus is nullable to record the initial creation as an event
-- (fromStatus NULL -> toStatus 'draft'/'submitted') so the board's history
-- view never has a gap before the first real transition.
CREATE TABLE IF NOT EXISTS "OfferEvent" (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "offerId"    text NOT NULL REFERENCES "Offer"(id) ON DELETE CASCADE,
  "spaceId"    text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "fromStatus" text,
  "toStatus"   text NOT NULL,
  note         text,
  at           timestamptz NOT NULL DEFAULT now()
);

-- Offer detail's history timeline: newest first per offer.
CREATE INDEX IF NOT EXISTS "OfferEvent_offer_at_idx"
  ON "OfferEvent" ("offerId", "at" DESC);

CREATE INDEX IF NOT EXISTS "OfferEvent_space_at_idx"
  ON "OfferEvent" ("spaceId", "at" DESC);

ALTER TABLE "OfferEvent" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_anon_offerevent_select ON "OfferEvent";
CREATE POLICY deny_anon_offerevent_select ON "OfferEvent"
  AS RESTRICTIVE FOR SELECT TO anon USING (false);

REVOKE ALL ON "OfferEvent" FROM anon;
REVOKE INSERT, UPDATE, DELETE ON "OfferEvent" FROM authenticated;
