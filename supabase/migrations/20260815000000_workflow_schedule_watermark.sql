-- Workflow schedule watermark.
--
-- The workflows cron (/api/cron/workflows) used to decide due-ness purely from
-- "is the current UTC hour the configured hour?", so one missed or late hourly
-- tick silently dropped that day's schedule-triggered workflows. The cron now
-- persists the last scheduled slot it fired per workflow and fires whenever
-- the most recent scheduled slot is later than this watermark — a late tick
-- catches up the missed slot exactly once, and a second tick inside the same
-- slot compares equal and cannot double-fire.
--
-- NULL (the default, and every pre-existing row) means "no watermark yet";
-- the cron falls back to the old strict tick-time rule for those rows, so
-- applying this migration changes nothing until a workflow fires once.
--
-- Idempotent: IF NOT EXISTS guard. Safe to re-run.

ALTER TABLE "Workflow"
  ADD COLUMN IF NOT EXISTS "lastScheduledFireAt" timestamptz;
