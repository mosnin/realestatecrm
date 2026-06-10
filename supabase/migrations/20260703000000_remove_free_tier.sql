-- Remove the free tier.
--
-- There is no longer a free plan: the trial requires a card, and credits are
-- granted only on a paid invoice. An account with no active subscription has
-- NO plan (NULL) — not 'free'.
--
-- Space.plan was `NOT NULL DEFAULT 'free'` (20260621000000_plan_tiers.sql).
--   1. Make it nullable with a NULL default — "no plan" is the resting state.
--   2. Migrate existing free spaces to NULL. Paid spaces keep their plan
--      (solo / pro / team / team_plus).
--
-- Brokerage.plan keeps its own legacy default ('starter') — it was never a
-- customer-facing free tier and is coerced through normalizePlan() in TS.
--
-- The historical 'free_signup' CreditLot rows and their unique index
-- (uq_creditlot_free_signup) are left in place: no new ones are created, but
-- existing grants stay valid and auditable.

ALTER TABLE "Space" ALTER COLUMN plan DROP NOT NULL;
ALTER TABLE "Space" ALTER COLUMN plan SET DEFAULT NULL;
UPDATE "Space" SET plan = NULL WHERE plan = 'free';
