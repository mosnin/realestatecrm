-- Tour reminder idempotency.
--
-- The tour reminder path (cron → /api/tours/reminders) sends a 24h and a
-- 1h reminder to each guest. Without a durable "already sent" marker, every
-- cron tick (every 15 min) would re-blast the same guest for the whole
-- window before the tour — 24h of texts. These columns are the guard: the
-- sender stamps them and filters them out on the next pass.
--
-- Two columns (not one `remindedAt`) because the 24h and 1h reminders are
-- distinct sends — a tour gets both, at different times, and each must fire
-- exactly once. The send path sets the matching column in the SAME update
-- it filters on, so a concurrent/duplicate cron can't double-send.

ALTER TABLE "Tour" ADD COLUMN IF NOT EXISTS "reminder24SentAt" timestamptz;
ALTER TABLE "Tour" ADD COLUMN IF NOT EXISTS "reminder1hSentAt"  timestamptz;
