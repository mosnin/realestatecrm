-- ═══════════════════════════════════════════════════════════════════════════
-- ScheduledMessage — a workflow's deferred outbound intent, scoped to a Space.
--
-- A workflow `schedule_message` action does NOT send at action time; it records
-- a row here with a future `sendAt`. A dedicated cron (the scheduled-message
-- dispatcher, app/api/cron/scheduled-messages) later loads the due rows and,
-- per the workflow's `autonomy`, either:
--   draft  — drafts a message for the realtor (status → 'drafted'); never sends.
--   notify — drafts AND notifies the realtor a draft is ready; never sends.
--   auto   — actually sends (rate-limited + audited + notified); status → 'sent'.
--
-- The product rule is "Chippi never sends without a tap" UNLESS the realtor set
-- the workflow to autonomy='auto'. That posture is enforced by the dispatcher
-- (lib/workflows/scheduled-dispatch.ts), not by Postgres — this table only holds
-- the intent and its lifecycle status.
--
-- NOTE on identifiers (mirrors the workflows migration): "spaceId" is text
-- because "Space"(id) is text — a foreign key must match the referenced
-- column's type. "workflowId"/"runId" are uuid, matching the workflow tables.
-- "recipientContactId" is text because "Contact"(id) is text; it is NOT a
-- foreign key (the contact may be a transient lead row at schedule time), so we
-- keep it as a plain text pointer the dispatcher resolves at send time.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "ScheduledMessage" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "spaceId"             text NOT NULL REFERENCES "Space"("id") ON DELETE CASCADE,
  -- The workflow that scheduled this. Nullable + cascade: deleting the workflow
  -- discards its pending schedule. A row may also be scheduled outside a
  -- workflow in the future, hence nullable.
  "workflowId"          uuid REFERENCES "Workflow"("id") ON DELETE CASCADE,
  -- The WorkflowRun that scheduled this, for audit correlation. No FK — the run
  -- ledger may be pruned independently of pending intents.
  "runId"               uuid,
  "channel"             text NOT NULL CHECK ("channel" IN ('sms', 'email')),
  -- The Contact/Lead id the message addresses, resolved at send time. Plain text
  -- pointer (see header), nullable when the schedule had no resolvable recipient.
  "recipientContactId"  text,
  -- The instruction handed to the drafting agent (or the send body source).
  "instruction"         text NOT NULL,
  -- WHEN the dispatcher should act: now + the action's delayMinutes.
  "sendAt"              timestamptz NOT NULL,
  -- The leash this message inherits from its workflow at schedule time.
  "autonomy"            text NOT NULL CHECK ("autonomy" IN ('draft', 'notify', 'auto')),
  -- Lifecycle:
  --   pending  — scheduled, not yet processed.
  --   drafted  — the dispatcher created a draft (draft/notify, or auto-fallback).
  --   sent     — the dispatcher actually sent (auto only).
  --   failed   — the dispatcher attempted and errored.
  --   canceled — the schedule was voided before dispatch.
  "status"              text NOT NULL DEFAULT 'pending'
                          CHECK ("status" IN ('pending', 'drafted', 'sent', 'failed', 'canceled')),
  -- Free-form record of the outcome (draftId, deliveredTo, error, audit note…).
  "detail"              jsonb,
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedAt"           timestamptz NOT NULL DEFAULT now()
);

-- The dispatcher's hot path: only pending rows whose time has come are scanned.
-- Partial index keeps it tiny — drafted/sent/failed rows never re-enter the scan.
CREATE INDEX IF NOT EXISTS "ScheduledMessage_due_idx"
  ON "ScheduledMessage" ("sendAt") WHERE "status" = 'pending';
-- The realtor's per-space view of scheduled / sent messages.
CREATE INDEX IF NOT EXISTS "ScheduledMessage_space_idx"
  ON "ScheduledMessage" ("spaceId");

-- Keep updatedAt honest on every edit. Dedicated to this table, mirroring the
-- workflows migration's per-table trigger convention (no shared helper here).
CREATE OR REPLACE FUNCTION scheduled_message_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW."updatedAt" := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "ScheduledMessage_updated_at" ON "ScheduledMessage";
CREATE TRIGGER "ScheduledMessage_updated_at"
  BEFORE UPDATE ON "ScheduledMessage"
  FOR EACH ROW EXECUTE FUNCTION scheduled_message_set_updated_at();

-- Access is service-role only, same as "Workflow"/"Routine". Every read and
-- write goes through a server path that does its own auth. No policies — the
-- server uses the service role.
ALTER TABLE "ScheduledMessage" ENABLE ROW LEVEL SECURITY;
