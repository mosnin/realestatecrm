-- User locale/market fields: which language the user reads and which
-- country/region (→ display currency) their pricing resolves to.
--
--   country  — ISO-3166 alpha-2 (e.g. 'AE', 'CL'), geo-defaulted at signup,
--              user-editable in settings.
--   region   — derived market key kept denormalized for analytics/queries
--              (e.g. 'us', 'eu', 'uae', 'latam', 'ru'); recomputed whenever
--              country changes.
--   language — marketing/app copy language; MUST stay in sync with the Lang
--              union in lib/i18n/markets.ts ('en' | 'es' | 'ru').
--
-- Language lives on the USER (each member of a brokerage reads their own
-- language). Billing currency deliberately does NOT live here: a Stripe
-- subscription has one currency, so the charge currency belongs to the
-- billing entity (Space/Brokerage) and is locked at first checkout — added
-- in the Stripe currency_options migration, not this one.
--
-- Idempotent, append-only.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "country" text;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "region" text;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "language" text NOT NULL DEFAULT 'en';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_language_check'
  ) THEN
    ALTER TABLE "User" ADD CONSTRAINT "User_language_check"
      CHECK ("language" IN ('en', 'es', 'ru'));
  END IF;
END $$;
