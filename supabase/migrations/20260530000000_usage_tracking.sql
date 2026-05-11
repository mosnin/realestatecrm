-- ═══════════════════════════════════════════════════════════════════════════
-- Usage tracking foundation
--
-- Two billing primitives:
--   1. Subscription credits — monthly allowance per plan (Pro / Premium),
--      gated by a rolling 7-day cap so a realtor can't burn the month in
--      one weekend. Resets on Stripe billing-period boundaries.
--   2. Top-up credits — paid extras with no weekly cap and no expiry.
--      Drained AFTER subscription credits are exhausted.
--
-- This migration introduces the SCHEMA + the seed plans. It does NOT add
-- enforcement (PR-C) or UI (PR-B). The recordUsage() helper writes to
-- UsageEvent; downstream tools wire in over time.
--
-- ID model:
--   - One Space = one billing entity (matches existing Stripe integration)
--   - userId on UsageEvent attributes the action to the realtor who fired
--     it (matters when a brokerage has multiple agents under one Space)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Plan: the menu of monthly allowances ────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Plan" (
  "id"                  text PRIMARY KEY,             -- 'pro', 'premium'
  "name"                text NOT NULL,
  "stripePriceId"       text NOT NULL UNIQUE,
  "monthlyCredits"      integer NOT NULL CHECK ("monthlyCredits" >= 0),
  "weeklyCap"           integer NOT NULL CHECK ("weeklyCap" >= 0),
  "monthlyPriceCents"   integer NOT NULL CHECK ("monthlyPriceCents" >= 0),
  "isActive"            boolean NOT NULL DEFAULT true,  -- false = grandfathered, hide from upgrade UI
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedAt"           timestamptz NOT NULL DEFAULT now()
);

-- Seed the two paid plans. stripePriceId values are placeholders — fill
-- in real ones from the Stripe dashboard before this migration runs in
-- prod, or update via UPDATE statement after seeding.
INSERT INTO "Plan" ("id", "name", "stripePriceId", "monthlyCredits", "weeklyCap", "monthlyPriceCents")
VALUES
  ('pro',     'Pro',     'price_REPLACE_PRO_ID',     100000,  25000,  2000),
  ('premium', 'Premium', 'price_REPLACE_PREMIUM_ID', 600000, 150000, 10000)
ON CONFLICT ("id") DO NOTHING;

-- ── Space: which plan + billing-period anchor + top-up balance ──────────────
-- Existing columns: stripeCustomerId, stripeSubscriptionId, stripeSubscriptionStatus,
-- stripePeriodEnd. We add the link to Plan + the period START anchor (needed
-- for monthly accounting alongside the rolling 7-day cap) + a denormalized
-- top-up balance column so reads are O(1) instead of summing a ledger.
ALTER TABLE "Space"
  ADD COLUMN IF NOT EXISTS "planId"               text REFERENCES "Plan"("id"),
  ADD COLUMN IF NOT EXISTS "currentPeriodStart"   timestamptz,
  ADD COLUMN IF NOT EXISTS "topUpBalance"         integer NOT NULL DEFAULT 0
    CHECK ("topUpBalance" >= 0);

CREATE INDEX IF NOT EXISTS idx_space_plan
  ON "Space" ("planId");

-- ── UsageEvent: append-only audit log of every billable action ──────────────
-- The source of truth. UsageCounter (if we add it later) is a denormalized
-- cache rebuildable from this table at any time.
--
-- costCredits = 0 is allowed and useful (read-only tools logged for telemetry
-- but not billed). Filter by costCredits > 0 in billing queries.
CREATE TABLE IF NOT EXISTS "UsageEvent" (
  "id"            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"       text NOT NULL REFERENCES "Space"("id") ON DELETE CASCADE,
  "userId"        text NOT NULL,                    -- Clerk userId who fired this
  "kind"          text NOT NULL,                    -- 'agent_run', 'add_person', 'send_email', ...
  "costCredits"   integer NOT NULL DEFAULT 0 CHECK ("costCredits" >= 0),
  "refTable"      text,                             -- e.g., 'Contact'
  "refId"         text,                             -- e.g., the new contact id
  "metadata"      jsonb,                            -- optional context (model, tokens, etc.)
  "createdAt"     timestamptz NOT NULL DEFAULT now()
);

-- Hot path: rolling 7-day window query → (spaceId, createdAt DESC).
-- Monthly window query → (spaceId, createdAt) range.
CREATE INDEX IF NOT EXISTS idx_usage_event_space_time
  ON "UsageEvent" ("spaceId", "createdAt" DESC);

-- Optional analytics: usage by user
CREATE INDEX IF NOT EXISTS idx_usage_event_user_time
  ON "UsageEvent" ("userId", "createdAt" DESC);

-- ── TopUpPurchase: ledger of top-up purchases (for audit + Stripe reconcile) ─
-- The denormalized balance lives on Space.topUpBalance. This table is the
-- audit trail — every increment to topUpBalance corresponds to a row here.
CREATE TABLE IF NOT EXISTS "TopUpPurchase" (
  "id"                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"             text NOT NULL REFERENCES "Space"("id") ON DELETE CASCADE,
  "userId"              text NOT NULL,                    -- Clerk userId who paid
  "credits"             integer NOT NULL CHECK ("credits" > 0),
  "amountCents"         integer NOT NULL CHECK ("amountCents" >= 0),
  "stripeChargeId"      text UNIQUE,                       -- idempotency on webhook redelivery
  "stripeCheckoutId"    text UNIQUE,                       -- idempotency on Checkout completion
  "createdAt"           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_top_up_space_time
  ON "TopUpPurchase" ("spaceId", "createdAt" DESC);

-- ── RLS: server-side service-role only — these are billing-critical ─────────
ALTER TABLE "Plan"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UsageEvent"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TopUpPurchase"   ENABLE ROW LEVEL SECURITY;
