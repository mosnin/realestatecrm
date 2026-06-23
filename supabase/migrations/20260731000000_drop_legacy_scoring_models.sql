-- Drop the legacy AI-generated "scoring model" columns.
--
-- These stored per-space/per-brokerage deterministic scoring models whose
-- question-id keys never matched the rendered form's answer keys, so they
-- scored every answer 0 and — blended at 80% weight — buried good leads at
-- ~17/cold. Lead scoring is now AI-only (lib/dynamic-lead-scoring.ts); nothing
-- reads these columns anymore.
--
-- ⚠️ DEPLOY ORDERING: apply this ONLY AFTER the AI-only-scoring code is live in
-- production. The previous code revision SELECTs these columns in the public
-- apply route; dropping them before that revision is replaced would break live
-- submissions. Safe to run once the new build is deployed.

ALTER TABLE "SpaceSetting" DROP COLUMN IF EXISTS "rentalScoringModel";
ALTER TABLE "SpaceSetting" DROP COLUMN IF EXISTS "buyerScoringModel";
ALTER TABLE "Brokerage" DROP COLUMN IF EXISTS "brokerageRentalScoringModel";
ALTER TABLE "Brokerage" DROP COLUMN IF EXISTS "brokerageBuyerScoringModel";
