-- Add a durable onboarding completion flag.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "onboarded" BOOLEAN NOT NULL DEFAULT false;
