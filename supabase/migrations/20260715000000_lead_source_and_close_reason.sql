-- ============================================================================
-- Lead-source attribution + deal close-reason taxonomy.
--
-- Two additive analytics foundations, neither of which existed before:
--
--   1. Contact."source" / Contact."sourceDetail"
--      WHERE a lead came from, captured at every creation point so brokers can
--      see which channels actually convert. "source" is a small stable enum
--      (web_form | brokerage_form | api | import | referral | manual | agent |
--      other); "sourceDetail" is free-form context (referral name, utm value).
--
--      This is intentionally distinct from the pre-existing free-form
--      Contact."sourceLabel" / Contact."referralSource" columns — those are
--      human-authored strings with no fixed vocabulary, so they can't be grouped
--      reliably for a per-channel conversion report. "source" is the structured,
--      groupable dimension; the older columns are left untouched.
--
--   2. Deal."closeReason" / Deal."closeReasonDetail"
--      WHY a deal was won or lost, captured on the won/lost transition, so
--      win/loss analysis is possible. "closeReason" is a stable enum key (e.g.
--      'price', 'went_with_other_agent') and "closeReasonDetail" is free-form.
--
--      Also distinct from the pre-existing Deal."wonLostReason" /
--      Deal."wonLostNote" (free-form display strings captured by the kanban
--      dialog). The structured "closeReason" is what analytics groups on;
--      "wonLostReason" continues to be written for backward compatibility.
--
-- Additive + idempotent: only nullable ADD COLUMN IF NOT EXISTS, no destructive
-- DDL, no data rewrite, safe to re-run against any database state.
--
-- RLS: "Contact" and "Deal" already have row level security enabled (Contact
-- since the original org/space schema; Deal likewise). Every read/write goes
-- through the server with the service-role key, which bypasses RLS — the policy
-- posture is unchanged here. The ENABLE statements below are defensive
-- re-asserts (no-ops when already enabled) so this file leaves both tables
-- protected on its own, matching the convention in
-- 20260710000000_deal_require_signed_before_close.sql.
-- ============================================================================

-- ── Feature A — lead-source attribution on Contact ──────────────────────────

ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "source"       text;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "sourceDetail" text;

-- Constrain "source" to the known vocabulary. NULL is always allowed (unknown /
-- legacy rows). Added as NOT VALID + a separate VALIDATE so re-running is cheap
-- and so the constraint can't fail against historical NULL/blank data. Wrapped
-- in a guard because ADD CONSTRAINT has no IF NOT EXISTS in older Postgres.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contact_source_check'
  ) THEN
    ALTER TABLE "Contact"
      ADD CONSTRAINT contact_source_check
      CHECK (
        "source" IS NULL OR "source" IN (
          'web_form', 'brokerage_form', 'api', 'import',
          'referral', 'manual', 'agent', 'other'
        )
      ) NOT VALID;
    ALTER TABLE "Contact" VALIDATE CONSTRAINT contact_source_check;
  END IF;
END $$;

-- Index for the per-source analytics breakdown (grouped counts scoped by space).
CREATE INDEX IF NOT EXISTS "Contact_spaceId_source_idx"
  ON "Contact" ("spaceId", "source");

ALTER TABLE "Contact" ENABLE ROW LEVEL SECURITY;

-- ── Feature B — close-reason taxonomy on Deal ───────────────────────────────

ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "closeReason"       text;
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "closeReasonDetail" text;

-- Constrain "closeReason" to the known win/loss vocabulary. NULL allowed for
-- active/on-hold deals and legacy rows. Same NOT VALID + VALIDATE pattern.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deal_close_reason_check'
  ) THEN
    ALTER TABLE "Deal"
      ADD CONSTRAINT deal_close_reason_check
      CHECK (
        "closeReason" IS NULL OR "closeReason" IN (
          -- won
          'price', 'relationship', 'speed', 'other_won',
          -- lost
          'went_with_other_agent', 'financing_fell_through',
          'changed_mind', 'price_too_high', 'timing', 'other_lost'
        )
      ) NOT VALID;
    ALTER TABLE "Deal" VALIDATE CONSTRAINT deal_close_reason_check;
  END IF;
END $$;

-- Index for the win/loss-by-reason analytics breakdown (grouped by status +
-- reason within a space).
CREATE INDEX IF NOT EXISTS "Deal_spaceId_status_closeReason_idx"
  ON "Deal" ("spaceId", "status", "closeReason");

ALTER TABLE "Deal" ENABLE ROW LEVEL SECURITY;
