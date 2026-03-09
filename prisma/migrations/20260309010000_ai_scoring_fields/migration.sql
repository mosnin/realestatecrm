-- Add AI scoring fields to RentalApplication
-- These store the result of the OpenAI Responses API call made after submission.
-- aiScoringPayload stores only the sanitized, non-PII payload sent to OpenAI.

ALTER TABLE "RentalApplication"
  ADD COLUMN "aiScore"          INTEGER,
  ADD COLUMN "aiPriorityLabel"  TEXT,
  ADD COLUMN "aiSummary"        TEXT,
  ADD COLUMN "aiReasonTags"     JSONB,
  ADD COLUMN "aiWatchouts"      JSONB,
  ADD COLUMN "aiConfidence"     TEXT,
  ADD COLUMN "aiScoredAt"       TIMESTAMP(3),
  ADD COLUMN "aiScoringVersion" TEXT,
  ADD COLUMN "aiScoringPayload" JSONB;
