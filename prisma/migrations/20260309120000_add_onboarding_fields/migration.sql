-- Add onboarding tracking fields to User
ALTER TABLE "User" ADD COLUMN "onboardingCurrentStep" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "User" ADD COLUMN "onboardingStartedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);

-- Add intake page customization fields to SpaceSetting
ALTER TABLE "SpaceSetting" ADD COLUMN "businessName" TEXT;
ALTER TABLE "SpaceSetting" ADD COLUMN "intakePageTitle" TEXT;
ALTER TABLE "SpaceSetting" ADD COLUMN "intakePageIntro" TEXT;
