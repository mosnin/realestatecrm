-- ═══════════════════════════════════════════════════════════════════════════
-- Workflow — a declarative "when X, if Y, then Z" automation, scoped to a Space.
--
-- A realtor (or Chippi on their behalf) describes an automation as data:
--   trigger     — WHEN it fires (a lead is created, a score crosses a line,
--                 an inbound message arrives, a schedule ticks, …)
--   conditions  — IF a boolean tree over the trigger's context is satisfied
--   actions     — THEN an ordered list of effects to run (draft a message,
--                 create a task, call an integration, hand off to Chippi, …)
--
-- The three jsonb columns (trigger / conditions / actions) are validated in the
-- app layer by lib/workflows/schema.ts — Postgres only guarantees they are JSON
-- and that the small set of enumerable columns (autonomy, statuses) stay in
-- bounds. This mirrors how "Routine" keeps its instruction free-form and lets
-- the API route own the richer validation.
--
-- This pass is the FOUNDATION only: tables + their bookkeeping. There is no
-- executor yet; WorkflowRun / WorkflowRunStep exist so the later executor pass
-- has a stable ledger to write into.
--
-- NOTE on identifiers: workflow rows use uuid primary keys, but "spaceId" is
-- text because "Space"(id) is itself text — a foreign key must match the
-- referenced column's type. The intra-workflow FKs (WorkflowRun.workflowId,
-- WorkflowRunStep.runId) are uuid, matching their parents.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "Workflow" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "spaceId"       text NOT NULL REFERENCES "Space"("id") ON DELETE CASCADE,
  "name"          text NOT NULL,
  "enabled"       boolean NOT NULL DEFAULT true,
  -- WHEN. A WorkflowTrigger: { type, config }. See lib/workflows/schema.ts.
  "trigger"       jsonb NOT NULL,
  -- IF. A ConditionGroup: { op, rules }. Defaults to the always-true empty AND.
  "conditions"    jsonb NOT NULL DEFAULT '{"op":"and","rules":[]}'::jsonb,
  -- THEN. An ordered WorkflowAction[]. Defaults to no actions.
  "actions"       jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- How much leash the workflow has:
  --   draft  — produce drafts only; nothing leaves without a human
  --   notify — run and notify the realtor of what it did
  --   auto   — run unattended
  "autonomy"      text NOT NULL DEFAULT 'draft'
                    CHECK ("autonomy" IN ('draft', 'notify', 'auto')),
  -- Bumped by the app on every edit so runs can record which shape ran.
  "version"       integer NOT NULL DEFAULT 1,
  -- Last execution bookkeeping, set by the (future) executor.
  "lastRunAt"     timestamptz,
  "lastRunStatus" text CHECK ("lastRunStatus" IN ('ok', 'error', 'skipped')
                              OR "lastRunStatus" IS NULL),
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now()
);

-- The realtor's list view, scoped to their space.
CREATE INDEX IF NOT EXISTS "Workflow_space_idx"
  ON "Workflow" ("spaceId");
-- The dispatcher's hot path: only enabled workflows are ever considered.
CREATE INDEX IF NOT EXISTS "Workflow_enabled_idx"
  ON "Workflow" ("enabled") WHERE "enabled";

-- Keep updatedAt honest on every edit. Dedicated to this table — there is no
-- shared helper in this schema; "Routine" et al. each define their own.
CREATE OR REPLACE FUNCTION workflow_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW."updatedAt" := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "Workflow_updated_at" ON "Workflow";
CREATE TRIGGER "Workflow_updated_at"
  BEFORE UPDATE ON "Workflow"
  FOR EACH ROW EXECUTE FUNCTION workflow_set_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- WorkflowRun — one execution of one Workflow. The executor pass writes these.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "WorkflowRun" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workflowId"    uuid NOT NULL REFERENCES "Workflow"("id") ON DELETE CASCADE,
  "spaceId"       text NOT NULL REFERENCES "Space"("id") ON DELETE CASCADE,
  "status"        text NOT NULL
                    CHECK ("status" IN ('running', 'completed', 'failed', 'skipped')),
  -- The trigger payload that started this run, captured for replay/debugging.
  "triggerEvent"  jsonb,
  -- A short human-readable account of what the run did.
  "summary"       text,
  -- Populated on failure.
  "error"         text,
  "startedAt"     timestamptz NOT NULL DEFAULT now(),
  "finishedAt"    timestamptz
);

-- A workflow's run history, newest first.
CREATE INDEX IF NOT EXISTS "WorkflowRun_workflow_idx"
  ON "WorkflowRun" ("workflowId", "startedAt" DESC);
-- A space's run history, newest first (the activity feed).
CREATE INDEX IF NOT EXISTS "WorkflowRun_space_idx"
  ON "WorkflowRun" ("spaceId", "startedAt" DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- WorkflowRunStep — one step within a run: a condition gate or an action.
-- Ordered by stepIndex within its run.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "WorkflowRunStep" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "runId"         uuid NOT NULL REFERENCES "WorkflowRun"("id") ON DELETE CASCADE,
  "stepIndex"     integer NOT NULL,
  "kind"          text NOT NULL CHECK ("kind" IN ('condition', 'action')),
  -- The WorkflowActionType when kind='action'; null for condition steps.
  "actionType"    text,
  "status"        text NOT NULL CHECK ("status" IN ('ok', 'failed', 'skipped')),
  -- Step-specific record: the evaluated condition tree, action result, etc.
  "detail"        jsonb,
  "createdAt"     timestamptz NOT NULL DEFAULT now()
);

-- Replaying a run in order.
CREATE INDEX IF NOT EXISTS "WorkflowRunStep_run_idx"
  ON "WorkflowRunStep" ("runId", "stepIndex");

-- Access is service-role only, same as "Routine"/"BrokerRoutine". Every read
-- and write goes through an API route that does its own auth + space-ownership
-- check. No policies — the server uses the service role.
ALTER TABLE "Workflow"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkflowRun"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkflowRunStep" ENABLE ROW LEVEL SECURITY;
