-- Rename broker_manager → broker_admin across brokerage role system
-- This creates a clearer hierarchy: broker_owner > broker_admin > realtor_member

BEGIN;

-- 1. Update existing membership rows
UPDATE "BrokerageMembership"
SET role = 'broker_admin'
WHERE role = 'broker_manager';

-- 2. Update existing invitation rows
UPDATE "Invitation"
SET "roleToAssign" = 'broker_admin'
WHERE "roleToAssign" = 'broker_manager';

-- 3. Drop and recreate CHECK constraint on BrokerageMembership.role
ALTER TABLE "BrokerageMembership" DROP CONSTRAINT IF EXISTS "BrokerageMembership_role_check";
ALTER TABLE "BrokerageMembership"
  ADD CONSTRAINT "BrokerageMembership_role_check"
  CHECK (role IN ('broker_owner', 'broker_admin', 'realtor_member'));

-- 4. Drop and recreate CHECK constraint on Invitation.roleToAssign
ALTER TABLE "Invitation" DROP CONSTRAINT IF EXISTS "Invitation_roleToAssign_check";
ALTER TABLE "Invitation"
  ADD CONSTRAINT "Invitation_roleToAssign_check"
  CHECK ("roleToAssign" IN ('broker_admin', 'realtor_member'));

COMMIT;
