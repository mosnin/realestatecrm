-- ═══════════════════════════════════════════════════════════════════════════
-- BrokerRoutine — a standing instruction for Chippi, scoped to a brokerage.
--
-- The broker admin writes one English instruction and picks how often it runs.
-- An hourly Vercel cron (/api/cron/broker-routines) finds rows whose nextRunAt
-- has passed and fires the Modal autonomous run (broker mode) with the
-- instruction attached. Like every autonomous path, the run DRAFTS — it never
-- sends unattended.
--
-- This mirrors the realtor "Routine" table exactly, swapping spaceId for
-- brokerageId. It REUSES the existing routine_next_run_at(...) SQL function
-- (defined by the realtor migrations 20260607000002 / 20260607000009) for the
-- scheduling math — that function is pure/IMMUTABLE and table-agnostic, so the
-- broker trigger simply calls it. We do NOT redefine it here.
--
-- nextRunAt is never set by a caller. The broker_routine_set_next_run trigger
-- recomputes it from (cadence, hour, dayOfMonth, daysOfWeek, now()) on every
-- INSERT and UPDATE, so the API route and the cron stay honest with one source
-- of truth: the database.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "BrokerRoutine" (
  "id"            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "brokerageId"   text NOT NULL REFERENCES "Brokerage"("id") ON DELETE CASCADE,
  -- The sentence. One English instruction the autonomous run receives verbatim.
  "instruction"   text NOT NULL,
  -- How often it runs. hour is the UTC hour 0-23; ignored when cadence='hourly'.
  "cadence"       text NOT NULL DEFAULT 'daily'
                    CHECK ("cadence" IN ('hourly', 'daily', 'weekdays', 'monthly', 'custom')),
  "hour"          integer NOT NULL DEFAULT 13
                    CHECK ("hour" BETWEEN 0 AND 23),
  -- Cadence-specific. monthly → dayOfMonth (1-28); custom → daysOfWeek. Null
  -- otherwise. See the cadence ↔ field consistency check below.
  "dayOfMonth"    integer
                    CHECK ("dayOfMonth" IS NULL OR ("dayOfMonth" BETWEEN 1 AND 28)),
  "daysOfWeek"    text[]
                    CHECK (
                      "daysOfWeek" IS NULL
                      OR (
                        array_length("daysOfWeek", 1) > 0
                        AND "daysOfWeek" <@ ARRAY['mon','tue','wed','thu','fri','sat','sun']::text[]
                      )
                    ),
  "enabled"       boolean NOT NULL DEFAULT true,
  -- Set by the cron when it dispatches a run. status reflects whether the
  -- Modal webhook accepted the job, not the run's eventual outcome.
  "lastRunAt"     timestamptz,
  "lastRunStatus" text CHECK ("lastRunStatus" IN ('ok', 'error')),
  -- Always trigger-managed. Never written by a caller.
  "nextRunAt"     timestamptz NOT NULL,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now(),
  -- Cadence ↔ field consistency:
  --   monthly  → dayOfMonth NOT NULL, daysOfWeek NULL
  --   custom   → daysOfWeek NOT NULL, dayOfMonth NULL
  --   other    → both NULL
  CONSTRAINT "BrokerRoutine_cadence_fields_check" CHECK (
    ("cadence" = 'monthly' AND "dayOfMonth" IS NOT NULL AND "daysOfWeek" IS NULL)
    OR ("cadence" = 'custom' AND "daysOfWeek" IS NOT NULL AND "dayOfMonth" IS NULL)
    OR (
      "cadence" IN ('hourly', 'daily', 'weekdays')
      AND "dayOfMonth" IS NULL
      AND "daysOfWeek" IS NULL
    )
  )
);

-- The cron's hot path: enabled routines that are due.
CREATE INDEX IF NOT EXISTS "BrokerRoutine_due_idx"
  ON "BrokerRoutine" ("nextRunAt") WHERE "enabled" = true;
-- The broker's list view.
CREATE INDEX IF NOT EXISTS "BrokerRoutine_brokerage_idx"
  ON "BrokerRoutine" ("brokerageId");

-- Keep nextRunAt and updatedAt honest. Runs BEFORE the NOT NULL check, so
-- nextRunAt needs no column default — the trigger is the only writer. Calls
-- the EXISTING routine_next_run_at(...) (from the realtor migrations) — pure
-- scheduling math, reused unchanged.
CREATE OR REPLACE FUNCTION broker_routine_set_next_run() RETURNS trigger AS $$
BEGIN
  NEW."nextRunAt" := routine_next_run_at(
    NEW."cadence",
    NEW."hour",
    now(),
    NEW."dayOfMonth",
    NEW."daysOfWeek"
  );
  NEW."updatedAt" := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "BrokerRoutine_next_run" ON "BrokerRoutine";
CREATE TRIGGER "BrokerRoutine_next_run"
  BEFORE INSERT OR UPDATE ON "BrokerRoutine"
  FOR EACH ROW EXECUTE FUNCTION broker_routine_set_next_run();

-- Access is service-role only, same as Routine. Every read and write goes
-- through an API route that does its own broker-admin auth + brokerage-scope
-- check. No policies — the server uses the service role.
ALTER TABLE "BrokerRoutine" ENABLE ROW LEVEL SECURITY;
