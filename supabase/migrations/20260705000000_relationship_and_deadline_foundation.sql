-- Foundation for three lifecycle features, built by EXTENDING existing tables
-- rather than adding parallel ones (the research swarm proposed ~9 new tables;
-- almost all duplicated what already ships):
--
--   1. After-Close engine (sphere / retention / referral) -> Contact columns
--   2. Contract-to-close reminders -> DealChecklistItem columns. The checklist
--      already carries dueAt/completedAt + the right `kind` set (inspection,
--      appraisal, loan_commitment, closing...); we just make it REMIND.
--   3. Nurture plays / proactive autonomy -> reuse AgentGoal. goalType already
--      has 'follow_up_sequence' + 'reengagement'; a play is a goal whose
--      metadata carries { playKind, step }. One promoted column for the cron.
--
-- Every column is nullable or defaulted: additive, reversible, no backfill, no
-- behavior change until the feature code ships. Server-side spaceId scoping
-- (service-role pattern, like the rest of this repo); no RLS policy changes.

-- == 1. After-Close: Contact relationship lifecycle ==========================
ALTER TABLE "Contact"
  ADD COLUMN IF NOT EXISTS "relationshipStage" TEXT NOT NULL DEFAULT 'lead'
    CHECK ("relationshipStage" IN ('lead','prospect','client','past_client','referral_target','dormant')),
  ADD COLUMN IF NOT EXISTS "lastClosedAt"    TIMESTAMPTZ,  -- when this contact's most recent deal closed (drives anniversary)
  ADD COLUMN IF NOT EXISTS "nextTouchAt"     TIMESTAMPTZ,  -- scheduled sphere/retention touch (independent of followUpAt)
  ADD COLUMN IF NOT EXISTS "referralAskedAt" TIMESTAMPTZ;  -- last time we asked this contact for a referral (rate-limit the ask)

-- Sphere sweep hot path: due touches for non-lead relationships.
CREATE INDEX IF NOT EXISTS "idx_contact_next_touch"
  ON "Contact" ("spaceId", "nextTouchAt")
  WHERE "nextTouchAt" IS NOT NULL;

-- Past-client / referral-target / dormant rolls for the After-Close UI + brief.
CREATE INDEX IF NOT EXISTS "idx_contact_relationship_stage"
  ON "Contact" ("spaceId", "relationshipStage")
  WHERE "relationshipStage" IN ('past_client','referral_target','dormant');

-- == 2. Contract-to-close: make the deal checklist a reminding deadline engine =
-- DealChecklistItem already has dueAt/completedAt + inspection/appraisal/loan/
-- closing kinds. Add role targeting + a one-shot reminder so the cron can draft
-- a nudge to the responsible party (lender, title, inspector...) before a date.
ALTER TABLE "DealChecklistItem"
  ADD COLUMN IF NOT EXISTS "assignedRoles"    TEXT[]     NOT NULL DEFAULT '{}', -- DealContact roles to notify
  ADD COLUMN IF NOT EXISTS "reminderLeadDays" INTEGER,                          -- draft reminder N days before dueAt; NULL = no reminder
  ADD COLUMN IF NOT EXISTS "reminderSentAt"   TIMESTAMPTZ;                      -- one-shot guard (cron idempotency)

-- Reminder sweep hot path: open, reminder-armed items not yet fired.
CREATE INDEX IF NOT EXISTS "idx_deal_checklist_reminder_due"
  ON "DealChecklistItem" ("spaceId", "dueAt")
  WHERE "completedAt" IS NULL AND "reminderSentAt" IS NULL AND "reminderLeadDays" IS NOT NULL;

-- == 3. Nurture plays / proactive autonomy: reuse AgentGoal ===================
-- A "play enrollment" is an AgentGoal (goalType 'follow_up_sequence' or
-- 'reengagement') whose metadata carries { playKind, step }. We promote one
-- column so the advancement cron indexes the due-work query instead of scanning
-- jsonb. No NurturePlay/PlayEnrollment tables -- play definitions live in code
-- (lib/plays); forecast is computed, not stored.
ALTER TABLE "AgentGoal"
  ADD COLUMN IF NOT EXISTS "nextActionAt" TIMESTAMPTZ;  -- when the next play step is due

-- Advancement sweep hot path: active goals with a due next action.
CREATE INDEX IF NOT EXISTS "idx_agent_goal_next_action"
  ON "AgentGoal" ("nextActionAt")
  WHERE "nextActionAt" IS NOT NULL AND "status" = 'active';
