-- Add onboarding + profile fields to User
ALTER TABLE "User"
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "businessName" TEXT,
  ADD COLUMN "onboardingStartedAt" TIMESTAMP(3),
  ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3),
  ADD COLUMN "onboardingCurrentStep" INTEGER NOT NULL DEFAULT 1;

-- Add lightweight intake branding fields to Space
ALTER TABLE "Space"
  ADD COLUMN "intakeDisplayTitle" TEXT,
  ADD COLUMN "intakeIntroLine" TEXT;

-- Backfill completion for existing users that already have a workspace.
UPDATE "User" u
SET "onboardingStartedAt" = COALESCE(u."onboardingStartedAt", NOW()),
    "onboardingCompletedAt" = COALESCE(u."onboardingCompletedAt", NOW()),
    "onboardingCurrentStep" = 7
WHERE EXISTS (
  SELECT 1 FROM "Space" s WHERE s."ownerId" = u.id
);
