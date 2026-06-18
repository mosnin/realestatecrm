-- Complimentary ("comp") access: platform-admin-granted FREE access for internal
-- team members and demo accounts, fully INDEPENDENT of Stripe.
--
-- These columns are never read or written by the Stripe webhook / billing
-- reconciliation, so granting comp can never collide with a real subscription
-- (and a later real subscription never disturbs comp). An account is "comped"
-- when compAccess = true and the optional compExpiresAt hasn't passed.
--
--   compAccess    on/off switch for free access
--   compExpiresAt optional expiry (NULL = no expiry, active until revoked) — handy
--                 for time-boxed demos
--   compNote      free-text reason shown in the admin UI (e.g. "Sales — Jane")
--
-- Idempotent: safe to re-run. Service-role (the app's server client) bypasses RLS,
-- so the existing table RLS is unchanged.

ALTER TABLE "Space"     ADD COLUMN IF NOT EXISTS "compAccess"    boolean NOT NULL DEFAULT false;
ALTER TABLE "Space"     ADD COLUMN IF NOT EXISTS "compExpiresAt" timestamptz;
ALTER TABLE "Space"     ADD COLUMN IF NOT EXISTS "compNote"      text;

ALTER TABLE "Brokerage" ADD COLUMN IF NOT EXISTS "compAccess"    boolean NOT NULL DEFAULT false;
ALTER TABLE "Brokerage" ADD COLUMN IF NOT EXISTS "compExpiresAt" timestamptz;
ALTER TABLE "Brokerage" ADD COLUMN IF NOT EXISTS "compNote"      text;

-- Find comped accounts quickly (admin listing / cleanup of expired comps).
CREATE INDEX IF NOT EXISTS "Space_compAccess_idx"     ON "Space" ("compAccess")     WHERE "compAccess" = true;
CREATE INDEX IF NOT EXISTS "Brokerage_compAccess_idx" ON "Brokerage" ("compAccess") WHERE "compAccess" = true;
