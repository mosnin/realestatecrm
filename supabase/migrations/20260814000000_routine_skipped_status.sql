-- Allow 'skipped' in Routine/BrokerRoutine lastRunStatus.
--
-- The hourly cron now stamps routines it skips (subscription gate) instead of
-- leaving their stale nextRunAt permanently occupying the front of the
-- order(nextRunAt).limit(N) dispatch window, where they starved runnable
-- routines behind them. Stamping advances nextRunAt via the existing trigger;
-- 'skipped' records why the run didn't happen. Mirrors the Workflow table,
-- which has allowed 'skipped' since 20260802000000_workflows.sql.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'Routine' AND constraint_name = 'Routine_lastRunStatus_check'
  ) THEN
    ALTER TABLE "Routine" DROP CONSTRAINT "Routine_lastRunStatus_check";
  END IF;
  ALTER TABLE "Routine"
    ADD CONSTRAINT "Routine_lastRunStatus_check"
    CHECK ("lastRunStatus" IN ('ok', 'error', 'skipped'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'BrokerRoutine' AND constraint_name = 'BrokerRoutine_lastRunStatus_check'
  ) THEN
    ALTER TABLE "BrokerRoutine" DROP CONSTRAINT "BrokerRoutine_lastRunStatus_check";
  END IF;
  ALTER TABLE "BrokerRoutine"
    ADD CONSTRAINT "BrokerRoutine_lastRunStatus_check"
    CHECK ("lastRunStatus" IN ('ok', 'error', 'skipped'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
