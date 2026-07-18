-- ============================================================================
-- Drip sequences — multi-step nurture, stop-on-reply.
-- ============================================================================
-- WHY: realtors want a scripted nurture cadence per lead type ("new seller
-- lead → day 0 intro, day 3 value nudge, day 10 check-in") without hand-
-- scheduling each step. "DripSequence" holds the reusable script; enrolling a
-- Contact creates a "DripEnrollment" that walks the script over time. The
-- engine (lib/drip/engine.ts) is the only writer of ScheduledMessage rows
-- derived from a due step — it mirrors the columns/autonomy semantics of the
-- existing workflow `schedule_message` action (lib/workflows/actions.ts) so
-- the SAME dispatcher (lib/workflows/scheduled-dispatch.ts) processes them,
-- with the SAME "never sends without a tap" default.
--
-- STOP-ON-REPLY is a first-class product rule, not an afterthought: the
-- engine checks for any inbound activity on the contact since enrollment
-- BEFORE scheduling the next step, and flips the enrollment to
-- status='stopped', stopReason='replied' rather than scheduling a tone-deaf
-- drip message onto a live conversation.
--
-- Append-only + idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS), scoped
-- by "spaceId" exactly like sibling tables (Workflow, ScheduledMessage). No
-- RLS policies — service-role only, same posture as ScheduledMessage; the
-- app-level `.eq('spaceId', …)` is the tenant boundary.
--
-- OPS NOTE: this migration is NOT assumed live in prod just because it is in
-- git — it must go through the human-gated apply workflow (docs/RELEASE.md)
-- before lib/drip/** or the /api/drip/** routes can be exercised against a
-- real database.
-- ============================================================================

-- ── DripSequence ─────────────────────────────────────────────────────────
-- The reusable script. `steps` is an ordered jsonb array of
-- { dayOffset: number, channel: 'sms'|'email', instruction: string } objects,
-- validated in the application layer (lib/drip/schema.ts) — Postgres only
-- guarantees the column is valid JSON, same posture as Workflow.actions.
CREATE TABLE IF NOT EXISTS "DripSequence" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "spaceId"    text NOT NULL REFERENCES "Space"("id") ON DELETE CASCADE,
  "name"       text NOT NULL,
  "steps"      jsonb NOT NULL DEFAULT '[]'::jsonb,
  "active"     boolean NOT NULL DEFAULT true,
  "createdAt"  timestamptz NOT NULL DEFAULT now(),
  "updatedAt"  timestamptz NOT NULL DEFAULT now()
);

-- Re-run safety: bring an earlier partial table up to spec without erroring.
ALTER TABLE "DripSequence" ADD COLUMN IF NOT EXISTS "spaceId"   text;
ALTER TABLE "DripSequence" ADD COLUMN IF NOT EXISTS "name"      text;
ALTER TABLE "DripSequence" ADD COLUMN IF NOT EXISTS "steps"     jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "DripSequence" ADD COLUMN IF NOT EXISTS "active"    boolean NOT NULL DEFAULT true;
ALTER TABLE "DripSequence" ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT now();
ALTER TABLE "DripSequence" ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS "DripSequence_space_idx" ON "DripSequence" ("spaceId");
-- The engine's per-tick "which sequences are live" scan.
CREATE INDEX IF NOT EXISTS "DripSequence_space_active_idx"
  ON "DripSequence" ("spaceId") WHERE "active" = true;

ALTER TABLE "DripSequence" ENABLE ROW LEVEL SECURITY;

-- ── DripEnrollment ───────────────────────────────────────────────────────
-- One contact's walk through one sequence.
CREATE TABLE IF NOT EXISTS "DripEnrollment" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "spaceId"      text NOT NULL REFERENCES "Space"("id") ON DELETE CASCADE,
  "sequenceId"   uuid NOT NULL REFERENCES "DripSequence"("id") ON DELETE CASCADE,
  "contactId"    text NOT NULL REFERENCES "Contact"("id") ON DELETE CASCADE,
  "enrolledAt"   timestamptz NOT NULL DEFAULT now(),
  -- Index into the sequence's `steps` array — the NEXT step due, not the last
  -- one sent. 0 = the first step has not been dispatched yet.
  "currentStep"  integer NOT NULL DEFAULT 0,
  "status"       text NOT NULL DEFAULT 'enrolled'
                   CHECK ("status" IN ('enrolled', 'completed', 'stopped')),
  -- Set only when status = 'stopped' (e.g. 'replied', 'sequence_deleted',
  -- 'unenrolled'). Free text so new stop reasons don't require a migration.
  "stopReason"   text,
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  "updatedAt"    timestamptz NOT NULL DEFAULT now()
);

-- Re-run safety.
ALTER TABLE "DripEnrollment" ADD COLUMN IF NOT EXISTS "spaceId"     text;
ALTER TABLE "DripEnrollment" ADD COLUMN IF NOT EXISTS "sequenceId"  uuid;
ALTER TABLE "DripEnrollment" ADD COLUMN IF NOT EXISTS "contactId"   text;
ALTER TABLE "DripEnrollment" ADD COLUMN IF NOT EXISTS "enrolledAt"  timestamptz NOT NULL DEFAULT now();
ALTER TABLE "DripEnrollment" ADD COLUMN IF NOT EXISTS "currentStep" integer NOT NULL DEFAULT 0;
ALTER TABLE "DripEnrollment" ADD COLUMN IF NOT EXISTS "status"      text NOT NULL DEFAULT 'enrolled';
ALTER TABLE "DripEnrollment" ADD COLUMN IF NOT EXISTS "stopReason"  text;
ALTER TABLE "DripEnrollment" ADD COLUMN IF NOT EXISTS "createdAt"   timestamptz NOT NULL DEFAULT now();
ALTER TABLE "DripEnrollment" ADD COLUMN IF NOT EXISTS "updatedAt"   timestamptz NOT NULL DEFAULT now();

-- The engine's due-scan hot path: only 'enrolled' rows are ever advanced.
CREATE INDEX IF NOT EXISTS "DripEnrollment_due_idx"
  ON "DripEnrollment" ("spaceId", "enrolledAt") WHERE "status" = 'enrolled';
CREATE INDEX IF NOT EXISTS "DripEnrollment_contact_idx"
  ON "DripEnrollment" ("spaceId", "contactId");
-- At most one LIVE enrollment per (sequence, contact) — re-enrollment after
-- completion/stop is allowed (a new row), concurrent double-enrollment is not.
CREATE UNIQUE INDEX IF NOT EXISTS "DripEnrollment_live_unique"
  ON "DripEnrollment" ("sequenceId", "contactId") WHERE "status" = 'enrolled';

ALTER TABLE "DripEnrollment" ENABLE ROW LEVEL SECURITY;

-- Keep updatedAt honest on every edit, mirroring the ScheduledMessage
-- migration's per-table trigger convention (no shared helper).
CREATE OR REPLACE FUNCTION drip_sequence_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW."updatedAt" := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "DripSequence_updated_at" ON "DripSequence";
CREATE TRIGGER "DripSequence_updated_at"
  BEFORE UPDATE ON "DripSequence"
  FOR EACH ROW EXECUTE FUNCTION drip_sequence_set_updated_at();

DROP TRIGGER IF EXISTS "DripEnrollment_updated_at" ON "DripEnrollment";
CREATE TRIGGER "DripEnrollment_updated_at"
  BEFORE UPDATE ON "DripEnrollment"
  FOR EACH ROW EXECUTE FUNCTION drip_sequence_set_updated_at();
