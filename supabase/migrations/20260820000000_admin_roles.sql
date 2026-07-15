-- ============================================================================
-- Graded platform-admin roles (SOC2 least-privilege / CC6.1, CC6.3)
-- ============================================================================
-- Today platform-admin is a single coarse boolean: User.platformRole = 'admin'.
-- Every admin can do everything — delete accounts, impersonate, refund, blast a
-- broadcast — which violates least-privilege. This adds a SECOND, finer axis:
-- User.adminRole, a graded capability tier that only matters for users who are
-- already admins (platformRole = 'admin' stays the coarse gate).
--
-- Tiers (see lib/permissions.ts ADMIN_CAPABILITIES for the capability map):
--   admin_readonly  — reads only
--   admin_support   — reads + support:write (repair, suspend, sessions, MFA…)
--   admin_billing   — support + billing:refund / billing:credit
--   super_admin     — everything (delete / impersonate / role / broadcast)
--
-- Backfill: existing platformRole='admin' rows become 'super_admin' so nothing
-- an admin can do today regresses. A legacy admin whose adminRole is somehow
-- NULL is treated as super_admin in code (getAdminRole) as a second belt.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + guarded CHECK + conditional backfill.
-- ============================================================================

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "adminRole" text;

-- CHECK constraint (added only once — DROP-then-ADD would break under RLS locks
-- and isn't idempotent-friendly, so guard on the catalog).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_adminRole_check'
  ) THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_adminRole_check"
      CHECK ("adminRole" IS NULL OR "adminRole" IN (
        'admin_readonly', 'admin_support', 'admin_billing', 'super_admin'
      ));
  END IF;
END$$;

-- Backfill every current platform admin to super_admin so their access is
-- unchanged the moment this ships. Idempotent: only touches admins still NULL.
UPDATE "User"
  SET "adminRole" = 'super_admin'
  WHERE "platformRole" = 'admin' AND "adminRole" IS NULL;
