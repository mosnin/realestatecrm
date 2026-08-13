-- ============================================================================
-- Durable agent work protocol (additive foundation, integrated after main's 20260908 migration)
-- ============================================================================
-- This migration does not replace Conversation, WorkSession, WorkflowRun, or
-- AgentRunLedger. It adds the lifecycle authority that those existing product
-- surfaces can dual-write/read during a feature-flagged migration.
--
-- Security posture:
--   * service-role access only for this first slice;
--   * child runs must be same-tenant, capability-subsets of their parent;
--   * leases, heartbeats, retries, cancellation, events, proposals, artifacts,
--     inbox, outbox, and schedule occurrences are durable;
--   * no browser/client write policy is introduced.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "AgentJobRun" (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "spaceId"             text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "conversationId"      text REFERENCES "Conversation"(id) ON DELETE SET NULL,
  "parentRunId"         uuid REFERENCES "AgentJobRun"(id) ON DELETE RESTRICT,
  "createdBy"           text NOT NULL,
  kind                  text NOT NULL CHECK (kind IN (
                          'chat_turn', 'work_session', 'routine', 'workflow',
                          'integration_event', 'voice_task', 'child_task',
                          'sandbox_job'
                        )),
  mode                  text NOT NULL CHECK (mode IN (
                          'interactive', 'unattended', 'voice_control', 'sandbox'
                        )),
  status                text NOT NULL DEFAULT 'queued' CHECK (status IN (
                          'queued', 'accepted', 'running', 'awaiting_input',
                          'awaiting_approval', 'retry_wait', 'completed',
                          'failed', 'cancelled', 'dead_letter'
                        )),
  title                 text NOT NULL,
  input                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  output                jsonb,
  "grantedCapabilities" text[] NOT NULL DEFAULT ARRAY[]::text[],
  "deniedCapabilities"  text[] NOT NULL DEFAULT ARRAY[]::text[],
  CHECK (NOT ("grantedCapabilities" && "deniedCapabilities")),
  restrictions          jsonb NOT NULL DEFAULT '{}'::jsonb,
  depth                 integer NOT NULL DEFAULT 0 CHECK (depth BETWEEN 0 AND 4),
  priority              smallint NOT NULL DEFAULT 0 CHECK (priority BETWEEN -10 AND 10),
  "idempotencyKey"      text,
  attempt               integer NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  "maxAttempts"         integer NOT NULL DEFAULT 3 CHECK ("maxAttempts" BETWEEN 1 AND 10),
  "availableAt"         timestamptz NOT NULL DEFAULT now(),
  "acceptedAt"          timestamptz,
  "startedAt"           timestamptz,
  "completedAt"         timestamptz,
  "leaseOwner"          text,
  "leaseExpiresAt"      timestamptz,
  "heartbeatAt"         timestamptz,
  "cancellationRequestedAt" timestamptz,
  "cancelledAt"         timestamptz,
  "vendorJobId"         text,
  "errorCode"           text,
  "errorMessage"        text,
  "eventSequence"       bigint NOT NULL DEFAULT 0,
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedAt"           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, "spaceId"),
  CHECK (
    status <> 'running'
    OR ("leaseOwner" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL AND "heartbeatAt" IS NOT NULL)
  ),
  CHECK (
    status NOT IN ('completed', 'failed', 'cancelled', 'dead_letter')
    OR (
      "completedAt" IS NOT NULL
      AND "leaseOwner" IS NULL
      AND "leaseExpiresAt" IS NULL
    )
  ),
  CHECK (status <> 'accepted' OR "acceptedAt" IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS "AgentJobRun_space_idempotency_uidx"
  ON "AgentJobRun" ("spaceId", "idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "AgentJobRun_claim_idx"
  ON "AgentJobRun" (priority DESC, "availableAt", "createdAt")
  WHERE status IN ('queued', 'accepted', 'retry_wait');
CREATE INDEX IF NOT EXISTS "AgentJobRun_expired_lease_idx"
  ON "AgentJobRun" ("leaseExpiresAt")
  WHERE status = 'running';
CREATE INDEX IF NOT EXISTS "AgentJobRun_space_created_idx"
  ON "AgentJobRun" ("spaceId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AgentJobRun_parent_idx"
  ON "AgentJobRun" ("parentRunId", "createdAt");
CREATE INDEX IF NOT EXISTS "AgentJobRun_conversation_idx"
  ON "AgentJobRun" ("conversationId", "createdAt");

CREATE OR REPLACE FUNCTION validate_agent_job_child()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  parent_row "AgentJobRun"%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE'
     AND (
       OLD."grantedCapabilities" IS DISTINCT FROM NEW."grantedCapabilities"
       OR OLD."deniedCapabilities" IS DISTINCT FROM NEW."deniedCapabilities"
     )
     AND EXISTS (
       SELECT 1 FROM "AgentJobRun" child WHERE child."parentRunId" = OLD.id
     )
  THEN
    RAISE EXCEPTION 'parent capabilities are immutable after child creation';
  END IF;

  IF NEW."parentRunId" IS NULL THEN
    IF NEW.depth <> 0 THEN
      RAISE EXCEPTION 'root agent job depth must be 0';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO parent_row
  FROM "AgentJobRun"
  WHERE id = NEW."parentRunId"
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'parent agent job not found';
  END IF;
  IF parent_row."spaceId" <> NEW."spaceId" THEN
    RAISE EXCEPTION 'child agent job must remain in parent space';
  END IF;
  IF NEW.depth <> parent_row.depth + 1 OR NEW.depth > 4 THEN
    RAISE EXCEPTION 'invalid child agent job depth';
  END IF;
  IF NOT parent_row."grantedCapabilities" @> NEW."grantedCapabilities" THEN
    RAISE EXCEPTION 'child agent job cannot gain capabilities';
  END IF;
  IF NOT NEW."deniedCapabilities" @> parent_row."deniedCapabilities" THEN
    RAISE EXCEPTION 'child agent job cannot remove parent restrictions';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agent_job_child_guard ON "AgentJobRun";
CREATE TRIGGER agent_job_child_guard
BEFORE INSERT OR UPDATE OF "parentRunId", "spaceId", depth,
  "grantedCapabilities", "deniedCapabilities"
ON "AgentJobRun"
FOR EACH ROW EXECUTE FUNCTION validate_agent_job_child();

CREATE TABLE IF NOT EXISTS "AgentRunEvent" (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "runId"     uuid NOT NULL REFERENCES "AgentJobRun"(id) ON DELETE CASCADE,
  sequence    bigint NOT NULL,
  type        text NOT NULL CHECK (type IN (
                'created', 'accepted', 'started', 'heartbeat', 'progress',
                'tool_started', 'tool_completed', 'proposal_created',
                'approval_recorded', 'artifact_created', 'clarification',
                'retry_scheduled', 'cancel_requested', 'cancelled',
                'completed', 'failed', 'dead_lettered'
              )),
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("runId", sequence)
);
CREATE INDEX IF NOT EXISTS "AgentRunEvent_run_sequence_idx"
  ON "AgentRunEvent" ("runId", sequence);

CREATE TABLE IF NOT EXISTS "AgentActionProposal" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "runId"          uuid NOT NULL,
  "spaceId"        text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  kind             text NOT NULL CHECK (kind IN (
                     'integration_action', 'crm_mutation', 'external_message',
                     'team_message', 'calendar_action', 'sandbox_job', 'child_task'
                   )),
  action           text NOT NULL,
  arguments        jsonb NOT NULL DEFAULT '{}'::jsonb,
  rationale        text NOT NULL,
  risk             text NOT NULL CHECK (risk IN ('low', 'high', 'destructive')),
  "expectedEffect" text NOT NULL,
  reversible       boolean NOT NULL,
  "dedupeKey"      text NOT NULL,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN (
                     'pending', 'approved', 'rejected', 'executing',
                     'executed', 'failed', 'cancelled'
                   )),
  "decidedBy"      text,
  "decidedAt"      timestamptz,
  "decisionNote"   text,
  "executedAt"     timestamptz,
  "createdAt"      timestamptz NOT NULL DEFAULT now(),
  "updatedAt"      timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("runId", "dedupeKey"),
  FOREIGN KEY ("runId", "spaceId")
    REFERENCES "AgentJobRun"(id, "spaceId") ON DELETE CASCADE,
  CHECK (
    status NOT IN ('approved', 'rejected')
    OR ("decidedBy" IS NOT NULL AND "decidedAt" IS NOT NULL)
  ),
  CHECK (status <> 'executed' OR "executedAt" IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS "AgentActionProposal_space_status_idx"
  ON "AgentActionProposal" ("spaceId", status, "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "AgentRunArtifact" (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "runId"       uuid NOT NULL,
  "spaceId"     text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN (
                  'markdown', 'document', 'spreadsheet', 'image', 'archive',
                  'log', 'structured_data'
                )),
  name          text NOT NULL,
  "storageKey"  text,
  "contentType" text,
  "sizeBytes"   bigint CHECK ("sizeBytes" IS NULL OR "sizeBytes" >= 0),
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY ("runId", "spaceId")
    REFERENCES "AgentJobRun"(id, "spaceId") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "AgentRunArtifact_run_created_idx"
  ON "AgentRunArtifact" ("runId", "createdAt");

CREATE TABLE IF NOT EXISTS "ScheduleOccurrence" (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "spaceId"      text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "scheduleType" text NOT NULL CHECK ("scheduleType" IN ('routine', 'workflow', 'agent_task')),
  "scheduleId"   text NOT NULL,
  "scheduledFor" timestamptz NOT NULL,
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN (
                   'pending', 'claimed', 'accepted', 'completed',
                   'retry_wait', 'failed', 'dead_letter', 'cancelled'
                 )),
  "runId"        uuid,
  attempt        integer NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  "availableAt"  timestamptz NOT NULL DEFAULT now(),
  "lastError"    text,
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  "updatedAt"    timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("scheduleType", "scheduleId", "scheduledFor"),
  FOREIGN KEY ("runId", "spaceId")
    REFERENCES "AgentJobRun"(id, "spaceId") ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "ScheduleOccurrence_due_idx"
  ON "ScheduleOccurrence" ("availableAt", "scheduledFor")
  WHERE status IN ('pending', 'retry_wait');

CREATE TABLE IF NOT EXISTS "AgentEventInbox" (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "spaceId"      text REFERENCES "Space"(id) ON DELETE CASCADE,
  provider       text NOT NULL,
  "deliveryId"   text NOT NULL,
  type           text NOT NULL,
  payload        jsonb NOT NULL,
  status         text NOT NULL DEFAULT 'received' CHECK (status IN (
                   'received', 'queued', 'processing', 'completed',
                   'skipped', 'retry_wait', 'dead_letter'
                 )),
  attempt        integer NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  "availableAt"  timestamptz NOT NULL DEFAULT now(),
  "lastError"    text,
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  "updatedAt"    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, "deliveryId")
);
CREATE INDEX IF NOT EXISTS "AgentEventInbox_due_idx"
  ON "AgentEventInbox" ("availableAt", "createdAt")
  WHERE status IN ('received', 'retry_wait');

CREATE TABLE IF NOT EXISTS "AgentOutbox" (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic         text NOT NULL,
  "aggregateId" text NOT NULL,
  payload       jsonb NOT NULL,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN (
                  'pending', 'publishing', 'published', 'retry_wait', 'dead_letter'
                )),
  attempt       integer NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  "availableAt" timestamptz NOT NULL DEFAULT now(),
  "publishedAt" timestamptz,
  "lastError"   text,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "AgentOutbox_publish_idx"
  ON "AgentOutbox" ("availableAt", "createdAt")
  WHERE status IN ('pending', 'retry_wait');

CREATE OR REPLACE FUNCTION claim_agent_job(
  p_worker_id text,
  p_lease_seconds integer DEFAULT 60
)
RETURNS SETOF "AgentJobRun"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  claimed "AgentJobRun"%ROWTYPE;
BEGIN
  IF p_worker_id IS NULL OR length(trim(p_worker_id)) = 0 THEN
    RAISE EXCEPTION 'worker id is required';
  END IF;
  IF p_lease_seconds < 15 OR p_lease_seconds > 600 THEN
    RAISE EXCEPTION 'lease seconds out of range';
  END IF;

  SELECT * INTO claimed
  FROM "AgentJobRun"
  WHERE (
      status IN ('queued', 'accepted', 'retry_wait')
      OR (status = 'running' AND "leaseExpiresAt" < now())
    )
    AND "availableAt" <= now()
    AND "cancellationRequestedAt" IS NULL
    AND attempt < "maxAttempts"
  ORDER BY priority DESC, "availableAt", "createdAt"
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE "AgentJobRun"
  SET status = 'running',
      attempt = attempt + 1,
      "leaseOwner" = p_worker_id,
      "leaseExpiresAt" = now() + make_interval(secs => p_lease_seconds),
      "heartbeatAt" = now(),
      "startedAt" = COALESCE("startedAt", now()),
      "updatedAt" = now()
  WHERE id = claimed.id
  RETURNING * INTO claimed;

  RETURN NEXT claimed;
END;
$$;

CREATE OR REPLACE FUNCTION finish_agent_job(
  p_run_id uuid,
  p_worker_id text,
  p_status text,
  p_output jsonb DEFAULT NULL,
  p_error_code text DEFAULT NULL,
  p_error_message text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_status NOT IN ('completed', 'failed', 'cancelled', 'dead_letter') THEN
    RAISE EXCEPTION 'invalid terminal status';
  END IF;

  UPDATE "AgentJobRun"
  SET status = p_status,
      output = p_output,
      "errorCode" = p_error_code,
      "errorMessage" = p_error_message,
      "completedAt" = now(),
      "cancelledAt" = CASE WHEN p_status = 'cancelled' THEN now() ELSE "cancelledAt" END,
      "leaseOwner" = NULL,
      "leaseExpiresAt" = NULL,
      "updatedAt" = now()
  WHERE id = p_run_id
    AND status = 'running'
    AND "leaseOwner" = p_worker_id;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION heartbeat_agent_job(
  p_run_id uuid,
  p_worker_id text,
  p_lease_seconds integer DEFAULT 60
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH touched AS (
    UPDATE "AgentJobRun"
    SET "heartbeatAt" = now(),
        "leaseExpiresAt" = now() + make_interval(secs => p_lease_seconds),
        "updatedAt" = now()
    WHERE id = p_run_id
      AND status = 'running'
      AND "leaseOwner" = p_worker_id
      AND "cancellationRequestedAt" IS NULL
      AND p_lease_seconds BETWEEN 15 AND 600
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM touched);
$$;

CREATE OR REPLACE FUNCTION append_agent_run_event(
  p_run_id uuid,
  p_type text,
  p_data jsonb DEFAULT '{}'::jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  next_sequence bigint;
BEGIN
  UPDATE "AgentJobRun"
  SET "eventSequence" = "eventSequence" + 1,
      "updatedAt" = now()
  WHERE id = p_run_id
  RETURNING "eventSequence" INTO next_sequence;

  IF next_sequence IS NULL THEN
    RAISE EXCEPTION 'agent run not found';
  END IF;

  INSERT INTO "AgentRunEvent" ("runId", sequence, type, data)
  VALUES (p_run_id, next_sequence, p_type, COALESCE(p_data, '{}'::jsonb));
  RETURN next_sequence;
END;
$$;

ALTER TABLE "AgentJobRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentRunEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentActionProposal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentRunArtifact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScheduleOccurrence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentEventInbox" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentOutbox" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON "AgentJobRun", "AgentRunEvent", "AgentActionProposal",
  "AgentRunArtifact", "ScheduleOccurrence", "AgentEventInbox", "AgentOutbox"
  FROM anon, authenticated;
REVOKE ALL ON FUNCTION claim_agent_job(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION heartbeat_agent_job(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION append_agent_run_event(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION finish_agent_job(uuid, text, text, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_agent_job(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION heartbeat_agent_job(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION append_agent_run_event(uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION finish_agent_job(uuid, text, text, jsonb, text, text) TO service_role;
