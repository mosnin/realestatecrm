-- Add lead scoring fields to Contact
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "leadScore" DOUBLE PRECISION;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "scoreLabel" TEXT DEFAULT 'unscored';
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "scoreSummary" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "scoringStatus" TEXT NOT NULL DEFAULT 'pending';
