-- Durable scheduled-workflow occurrence + resumable step protocol.
--
-- Follow-on to 20260905000000_durable_agent_runs.sql. This is additive and is
-- deliberately NOT wired into the legacy cron until the
-- DURABLE_SCHEDULE_OCCURRENCES_ENABLED rollout has passed disposable-DB,
-- provider-idempotency, and shadow telemetry gates.
--
-- A ScheduleOccurrence identifies one cadence slot. ScheduleOccurrenceStep
-- records a stable action key within that slot so a retry can skip only steps
-- proven completed. It cannot prove a third-party side effect that happened
-- before this database recorded completion; consequential provider calls still
-- need a provider idempotency key or proposal/approval recovery path.

ALTER TABLE "ScheduleOccurrence"
  ADD COLUMN IF NOT EXISTS "maxAttempts" integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "leaseOwner" text,
  ADD COLUMN IF NOT EXISTS "leaseExpiresAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "heartbeatAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "claimedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "completedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "cancellationRequestedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "cancelledAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "errorCode" text,
  ADD COLUMN IF NOT EXISTS "leaseGeneration" bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "workflowVersion" integer;

-- The first durable-agent migration keyed cadence slots globally. Preserve its
-- data but replace that constraint before any feature-gated writer can run:
-- schedule ids are only tenant-meaningful, so a cross-space collision must not
-- coalesce or reveal another tenant's occurrence.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"ScheduleOccurrence"'::regclass
      AND conname = 'ScheduleOccurrence_scheduleType_scheduleId_scheduledFor_key'
  ) THEN
    ALTER TABLE "ScheduleOccurrence"
      DROP CONSTRAINT "ScheduleOccurrence_scheduleType_scheduleId_scheduledFor_key";
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"ScheduleOccurrence"'::regclass
      AND conname = 'ScheduleOccurrence_space_schedule_slot_key'
  ) THEN
    ALTER TABLE "ScheduleOccurrence"
      ADD CONSTRAINT "ScheduleOccurrence_space_schedule_slot_key"
      UNIQUE ("spaceId", "scheduleType", "scheduleId", "scheduledFor");
  END IF;
END;
$$;

ALTER TABLE "ScheduleOccurrence"
  DROP CONSTRAINT IF EXISTS "ScheduleOccurrence_max_attempts_check";
ALTER TABLE "ScheduleOccurrence"
  ADD CONSTRAINT "ScheduleOccurrence_max_attempts_check"
  CHECK ("maxAttempts" BETWEEN 1 AND 10);

CREATE INDEX IF NOT EXISTS "ScheduleOccurrence_expired_lease_idx"
  ON "ScheduleOccurrence" ("leaseExpiresAt")
  WHERE status = 'claimed';

CREATE TABLE IF NOT EXISTS "ScheduleOccurrenceStep" (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "occurrenceId"   uuid NOT NULL REFERENCES "ScheduleOccurrence"(id) ON DELETE CASCADE,
  "stepKey"        text NOT NULL,
  "idempotencyKey" text NOT NULL,
  "stepIndex"      integer NOT NULL CHECK ("stepIndex" >= 0),
  "actionType"     text,
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN (
                      'pending', 'claimed', 'completed', 'retry_wait', 'failed', 'cancelled'
                    )),
  attempt           integer NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  "maxAttempts"    integer NOT NULL DEFAULT 3 CHECK ("maxAttempts" BETWEEN 1 AND 10),
  "availableAt"    timestamptz NOT NULL DEFAULT now(),
  "leaseOwner"     text,
  "leaseExpiresAt" timestamptz,
  "occurrenceLeaseGeneration" bigint NOT NULL DEFAULT 0,
  "startedAt"      timestamptz,
  "completedAt"    timestamptz,
  result            jsonb,
  "errorCode"      text,
  "lastError"      text,
  "createdAt"      timestamptz NOT NULL DEFAULT now(),
  "updatedAt"      timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("occurrenceId", "stepKey"),
  UNIQUE ("occurrenceId", "idempotencyKey"),
  CHECK (
    status <> 'claimed'
    OR ("leaseOwner" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL)
  ),
  CHECK (
    status NOT IN ('completed', 'cancelled')
    OR ("completedAt" IS NOT NULL AND "leaseOwner" IS NULL AND "leaseExpiresAt" IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS "ScheduleOccurrenceStep_occurrence_idx"
  ON "ScheduleOccurrenceStep" ("occurrenceId", "stepIndex");
CREATE INDEX IF NOT EXISTS "ScheduleOccurrenceStep_expired_lease_idx"
  ON "ScheduleOccurrenceStep" ("leaseExpiresAt")
  WHERE status = 'claimed';

CREATE OR REPLACE FUNCTION materialize_schedule_occurrence(
  p_space_id text,
  p_schedule_type text,
  p_schedule_id text,
  p_scheduled_for timestamptz,
  p_max_attempts integer DEFAULT 3,
  p_workflow_version integer DEFAULT NULL
)
RETURNS SETOF "ScheduleOccurrence"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_space_id IS NULL OR length(trim(p_space_id)) = 0
     OR p_schedule_id IS NULL OR length(trim(p_schedule_id)) = 0 THEN
    RAISE EXCEPTION 'space id and schedule id are required';
  END IF;
  IF p_schedule_type NOT IN ('routine', 'workflow', 'agent_task') THEN
    RAISE EXCEPTION 'invalid schedule type';
  END IF;
  IF p_scheduled_for IS NULL OR p_max_attempts NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'invalid occurrence arguments';
  END IF;
  IF p_schedule_type = 'workflow' AND p_workflow_version IS NULL THEN
    RAISE EXCEPTION 'workflow version is required for a workflow occurrence';
  END IF;

  INSERT INTO "ScheduleOccurrence" (
    "spaceId", "scheduleType", "scheduleId", "scheduledFor", "maxAttempts", "workflowVersion"
  )
  VALUES (
    p_space_id, p_schedule_type, p_schedule_id, p_scheduled_for, p_max_attempts, p_workflow_version
  )
  ON CONFLICT ("spaceId", "scheduleType", "scheduleId", "scheduledFor") DO NOTHING;

  RETURN QUERY
  SELECT * FROM "ScheduleOccurrence"
  WHERE "spaceId" = p_space_id
    AND "scheduleType" = p_schedule_type
    AND "scheduleId" = p_schedule_id
    AND "scheduledFor" = p_scheduled_for;
  IF p_schedule_type = 'workflow' AND EXISTS (
    SELECT 1 FROM "ScheduleOccurrence"
    WHERE "spaceId" = p_space_id
      AND "scheduleType" = p_schedule_type
      AND "scheduleId" = p_schedule_id
      AND "scheduledFor" = p_scheduled_for
      AND "workflowVersion" IS DISTINCT FROM p_workflow_version
  ) THEN
    RAISE EXCEPTION 'workflow definition version changed after occurrence materialization';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION claim_schedule_occurrence(
  p_worker_id text,
  p_lease_seconds integer DEFAULT 60
)
RETURNS SETOF "ScheduleOccurrence"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  claimed "ScheduleOccurrence"%ROWTYPE;
BEGIN
  IF p_worker_id IS NULL OR length(trim(p_worker_id)) = 0 THEN
    RAISE EXCEPTION 'worker id is required';
  END IF;
  IF p_lease_seconds NOT BETWEEN 15 AND 600 THEN
    RAISE EXCEPTION 'lease seconds out of range';
  END IF;

  SELECT * INTO claimed
  FROM "ScheduleOccurrence"
  WHERE (
      status IN ('pending', 'retry_wait')
      OR (status = 'claimed' AND "leaseExpiresAt" < now())
    )
    AND "availableAt" <= now()
    AND "cancellationRequestedAt" IS NULL
    AND attempt < "maxAttempts"
  ORDER BY "scheduledFor", "createdAt"
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE "ScheduleOccurrence"
  SET status = 'claimed',
      attempt = attempt + 1,
      "leaseOwner" = p_worker_id,
      "leaseExpiresAt" = now() + make_interval(secs => p_lease_seconds),
      "leaseGeneration" = "leaseGeneration" + 1,
      "heartbeatAt" = now(),
      "claimedAt" = COALESCE("claimedAt", now()),
      "updatedAt" = now()
  WHERE id = claimed.id
  RETURNING * INTO claimed;

  RETURN NEXT claimed;
END;
$$;

CREATE OR REPLACE FUNCTION heartbeat_schedule_occurrence(
  p_occurrence_id uuid,
  p_worker_id text,
  p_lease_generation bigint,
  p_lease_seconds integer DEFAULT 60
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH touched AS (
    UPDATE "ScheduleOccurrence"
    SET "heartbeatAt" = now(),
        "leaseExpiresAt" = now() + make_interval(secs => p_lease_seconds),
        "updatedAt" = now()
    WHERE id = p_occurrence_id
      AND status = 'claimed'
      AND "leaseOwner" = p_worker_id
      AND "leaseGeneration" = p_lease_generation
      AND "leaseExpiresAt" > now()
      AND "cancellationRequestedAt" IS NULL
      AND p_lease_seconds BETWEEN 15 AND 600
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM touched);
$$;

CREATE OR REPLACE FUNCTION finish_schedule_occurrence(
  p_occurrence_id uuid,
  p_worker_id text,
  p_lease_generation bigint,
  p_outcome text,
  p_error_code text DEFAULT NULL,
  p_error_message text DEFAULT NULL,
  p_retry_after_seconds integer DEFAULT 30
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_row "ScheduleOccurrence"%ROWTYPE;
  next_status text;
BEGIN
  IF p_outcome NOT IN ('completed', 'retryable_failure', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'invalid occurrence outcome';
  END IF;
  IF p_retry_after_seconds NOT BETWEEN 1 AND 86400 THEN
    RAISE EXCEPTION 'retry delay out of range';
  END IF;

  SELECT * INTO current_row FROM "ScheduleOccurrence"
  WHERE id = p_occurrence_id
    AND status = 'claimed'
    AND "leaseOwner" = p_worker_id
    AND "leaseGeneration" = p_lease_generation
    AND "leaseExpiresAt" > now()
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF p_outcome = 'completed' THEN
    next_status := 'completed';
  ELSIF p_outcome = 'cancelled' OR current_row."cancellationRequestedAt" IS NOT NULL THEN
    next_status := 'cancelled';
  ELSIF p_outcome = 'retryable_failure' AND current_row.attempt < current_row."maxAttempts" THEN
    next_status := 'retry_wait';
  ELSIF p_outcome = 'retryable_failure' THEN
    next_status := 'dead_letter';
  ELSE
    next_status := 'failed';
  END IF;

  UPDATE "ScheduleOccurrence"
  SET status = next_status,
      "availableAt" = CASE
        WHEN next_status = 'retry_wait'
          THEN now() + make_interval(secs => p_retry_after_seconds)
        ELSE "availableAt"
      END,
      "errorCode" = p_error_code,
      "lastError" = p_error_message,
      "completedAt" = CASE
        WHEN next_status IN ('completed', 'failed', 'dead_letter') THEN now()
        ELSE "completedAt"
      END,
      "cancelledAt" = CASE WHEN next_status = 'cancelled' THEN now() ELSE "cancelledAt" END,
      "leaseOwner" = NULL,
      "leaseExpiresAt" = NULL,
      "updatedAt" = now()
  WHERE id = p_occurrence_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION claim_schedule_occurrence_step(
  p_occurrence_id uuid,
  p_worker_id text,
  p_lease_generation bigint,
  p_step_key text,
  p_idempotency_key text,
  p_step_index integer,
  p_action_type text DEFAULT NULL,
  p_lease_seconds integer DEFAULT 60,
  p_max_attempts integer DEFAULT 3
)
RETURNS SETOF "ScheduleOccurrenceStep"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  occurrence "ScheduleOccurrence"%ROWTYPE;
  step_row "ScheduleOccurrenceStep"%ROWTYPE;
BEGIN
  IF p_worker_id IS NULL OR length(trim(p_worker_id)) = 0
     OR p_step_key IS NULL OR length(trim(p_step_key)) = 0
     OR p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'worker id, step key, and idempotency key are required';
  END IF;
  IF p_step_index < 0 OR p_lease_seconds NOT BETWEEN 15 AND 600
     OR p_max_attempts NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'invalid step claim arguments';
  END IF;

  SELECT * INTO occurrence FROM "ScheduleOccurrence"
  WHERE id = p_occurrence_id
    AND status = 'claimed'
    AND "leaseOwner" = p_worker_id
    AND "leaseGeneration" = p_lease_generation
    AND "leaseExpiresAt" > now()
    AND "cancellationRequestedAt" IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO "ScheduleOccurrenceStep" (
    "occurrenceId", "stepKey", "idempotencyKey", "stepIndex", "actionType", "maxAttempts",
    "occurrenceLeaseGeneration"
  )
  VALUES (
    p_occurrence_id, p_step_key, p_idempotency_key, p_step_index, p_action_type, p_max_attempts,
    p_lease_generation
  )
  ON CONFLICT ("occurrenceId", "stepKey") DO NOTHING;

  SELECT * INTO step_row FROM "ScheduleOccurrenceStep"
  WHERE "occurrenceId" = p_occurrence_id AND "stepKey" = p_step_key
  FOR UPDATE;

  IF step_row."idempotencyKey" <> p_idempotency_key THEN
    RAISE EXCEPTION 'step idempotency key mismatch for occurrence step';
  END IF;

  -- A completed/cancelled step is returned as evidence to the caller; it must
  -- not be reissued. A live claim similarly remains owned by its current worker.
  IF step_row.status IN ('completed', 'cancelled')
     OR (step_row.status = 'claimed' AND step_row."leaseExpiresAt" > now()) THEN
    RETURN NEXT step_row;
    RETURN;
  END IF;
  IF step_row.attempt >= step_row."maxAttempts" THEN
    UPDATE "ScheduleOccurrenceStep"
    SET status = 'failed',
        "leaseOwner" = NULL,
        "leaseExpiresAt" = NULL,
        "lastError" = COALESCE("lastError", 'step attempts exhausted'),
        "updatedAt" = now()
    WHERE id = step_row.id
    RETURNING * INTO step_row;
    RETURN NEXT step_row;
    RETURN;
  END IF;

  UPDATE "ScheduleOccurrenceStep"
  SET status = 'claimed',
      attempt = attempt + 1,
      "leaseOwner" = p_worker_id,
      "leaseExpiresAt" = now() + make_interval(secs => p_lease_seconds),
      "occurrenceLeaseGeneration" = p_lease_generation,
      "startedAt" = COALESCE("startedAt", now()),
      "updatedAt" = now()
  WHERE id = step_row.id
  RETURNING * INTO step_row;
  RETURN NEXT step_row;
END;
$$;

CREATE OR REPLACE FUNCTION finish_schedule_occurrence_step(
  p_step_id uuid,
  p_worker_id text,
  p_lease_generation bigint,
  p_outcome text,
  p_result jsonb DEFAULT NULL,
  p_error_code text DEFAULT NULL,
  p_error_message text DEFAULT NULL,
  p_retry_after_seconds integer DEFAULT 30
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  step_row "ScheduleOccurrenceStep"%ROWTYPE;
  next_status text;
BEGIN
  IF p_outcome NOT IN ('completed', 'retryable_failure', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'invalid step outcome';
  END IF;
  IF p_retry_after_seconds NOT BETWEEN 1 AND 86400 THEN
    RAISE EXCEPTION 'retry delay out of range';
  END IF;

  SELECT step.* INTO step_row
  FROM "ScheduleOccurrenceStep" step
  JOIN "ScheduleOccurrence" occurrence ON occurrence.id = step."occurrenceId"
  WHERE step.id = p_step_id
    AND step.status = 'claimed'
    AND step."leaseOwner" = p_worker_id
    AND step."occurrenceLeaseGeneration" = p_lease_generation
    AND step."leaseExpiresAt" > now()
    AND occurrence.status = 'claimed'
    AND occurrence."leaseOwner" = p_worker_id
    AND occurrence."leaseGeneration" = p_lease_generation
    AND occurrence."leaseExpiresAt" > now()
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF p_outcome = 'completed' THEN
    next_status := 'completed';
  ELSIF p_outcome = 'cancelled' THEN
    next_status := 'cancelled';
  ELSIF p_outcome = 'retryable_failure' AND step_row.attempt < step_row."maxAttempts" THEN
    next_status := 'retry_wait';
  ELSE
    next_status := 'failed';
  END IF;

  UPDATE "ScheduleOccurrenceStep"
  SET status = next_status,
      result = p_result,
      "errorCode" = p_error_code,
      "lastError" = p_error_message,
      "availableAt" = CASE
        WHEN next_status = 'retry_wait'
          THEN now() + make_interval(secs => p_retry_after_seconds)
        ELSE "availableAt"
      END,
      "completedAt" = CASE
        WHEN next_status IN ('completed', 'failed', 'cancelled') THEN now()
        ELSE "completedAt"
      END,
      "leaseOwner" = NULL,
      "leaseExpiresAt" = NULL,
      "updatedAt" = now()
  WHERE id = p_step_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION heartbeat_schedule_occurrence_step(
  p_step_id uuid,
  p_worker_id text,
  p_lease_generation bigint,
  p_lease_seconds integer DEFAULT 60
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH touched AS (
    UPDATE "ScheduleOccurrenceStep" step
    SET "leaseExpiresAt" = now() + make_interval(secs => p_lease_seconds),
        "updatedAt" = now()
    FROM "ScheduleOccurrence" occurrence
    WHERE step.id = p_step_id
      AND step."occurrenceId" = occurrence.id
      AND step.status = 'claimed'
      AND step."leaseOwner" = p_worker_id
      AND step."occurrenceLeaseGeneration" = p_lease_generation
      AND step."leaseExpiresAt" > now()
      AND occurrence.status = 'claimed'
      AND occurrence."leaseOwner" = p_worker_id
      AND occurrence."leaseGeneration" = p_lease_generation
      AND occurrence."leaseExpiresAt" > now()
      AND occurrence."cancellationRequestedAt" IS NULL
      AND p_lease_seconds BETWEEN 15 AND 600
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM touched);
$$;

ALTER TABLE "ScheduleOccurrenceStep" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "ScheduleOccurrenceStep" FROM anon, authenticated;
REVOKE ALL ON FUNCTION materialize_schedule_occurrence(text, text, text, timestamptz, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION claim_schedule_occurrence(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION heartbeat_schedule_occurrence(uuid, text, bigint, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION finish_schedule_occurrence(uuid, text, bigint, text, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION claim_schedule_occurrence_step(uuid, text, bigint, text, text, integer, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION finish_schedule_occurrence_step(uuid, text, bigint, text, jsonb, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION heartbeat_schedule_occurrence_step(uuid, text, bigint, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION materialize_schedule_occurrence(text, text, text, timestamptz, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION claim_schedule_occurrence(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION heartbeat_schedule_occurrence(uuid, text, bigint, integer) TO service_role;
GRANT EXECUTE ON FUNCTION finish_schedule_occurrence(uuid, text, bigint, text, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION claim_schedule_occurrence_step(uuid, text, bigint, text, text, integer, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION finish_schedule_occurrence_step(uuid, text, bigint, text, jsonb, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION heartbeat_schedule_occurrence_step(uuid, text, bigint, integer) TO service_role;
