-- Add onboarding tracking fields to User
-- IF NOT EXISTS guards against re-running when columns were added via db push
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "onboardingCurrentStep" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "onboardingStartedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMP(3);

-- Add intake page customization fields to SpaceSetting
ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "businessName" TEXT;
ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "intakePageTitle" TEXT;
ALTER TABLE "SpaceSetting" ADD COLUMN IF NOT EXISTS "intakePageIntro" TEXT;
