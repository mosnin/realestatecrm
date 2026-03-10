ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "onboard" BOOLEAN NOT NULL DEFAULT false;

-- Backfill onboard=true for users who already completed onboarding via legacy signals.
UPDATE "User" u
SET "onboard" = true
WHERE u."onboardingCompletedAt" IS NOT NULL
   OR EXISTS (
     SELECT 1
     FROM "Space" s
     WHERE s."ownerId" = u."id"
   );
