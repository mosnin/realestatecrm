-- Durable de-dupe for tour reminder emails.
--
-- The tour-reminder cron (app/api/tours/reminders) previously had no per-tour
-- de-dupe column, so it relied on a fragile 23h-24h time window to avoid
-- double-sending. This adds a real marker: reminderSentAt is stamped after a
-- successful reminder send and the cron filters on it being NULL, so a tour is
-- reminded exactly once regardless of how many times the cron fires.
--
-- Additive and idempotent: safe to re-run.

ALTER TABLE "Tour" ADD COLUMN IF NOT EXISTS "reminderSentAt" timestamptz;

-- Partial index: the cron only ever scans not-yet-reminded upcoming tours.
CREATE INDEX IF NOT EXISTS idx_tour_reminder_pending
  ON "Tour"("startsAt")
  WHERE "reminderSentAt" IS NULL;
