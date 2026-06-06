-- ============================================================================
-- CommissionLedger: retain the brokerage's commission books when an agent's
-- User account is hard-deleted.
--
-- THE BUG: CommissionLedger.agentUserId was `NOT NULL REFERENCES "User"(id)
-- ON DELETE CASCADE` (20260507000000_commission_ledger.sql:59). So deleting an
-- agent's User row CASCADE-deleted their entire commission history — destroying
-- financial records the brokerage owns. docs/DATA-DELETION.md states these
-- records are meant to be RETAINED ("erasing one agent's account should not
-- destroy the brokerage's commission books"); the FK contradicted that intent.
--
-- FIX: make agentUserId nullable and switch the FK to ON DELETE SET NULL. A
-- deleted agent's ledger rows survive with agentUserId = NULL (the brokerage's
-- books stay intact; the row simply no longer points at a live User). The
-- brokerageId FK keeps ON DELETE CASCADE — deleting the whole brokerage still
-- clears its ledger, which is correct.
--
-- Readers of agentUserId must tolerate NULL (historical rows for departed
-- agents). Grouping/leaderboard queries treat NULL as "former agent".
--
-- ⚠️ VALIDATION REQUIRED (same as the Tier E migration): apply against a real
-- Supabase DB and confirm the constraint swap succeeds. Not validatable in the
-- build sandbox (no Postgres). The auto-generated FK name is assumed to be
-- "CommissionLedger_agentUserId_fkey" (Postgres default for the inline REFERENCES
-- in the create migration); the DROP is guarded with IF EXISTS.
-- ============================================================================

ALTER TABLE "CommissionLedger" ALTER COLUMN "agentUserId" DROP NOT NULL;

ALTER TABLE "CommissionLedger" DROP CONSTRAINT IF EXISTS "CommissionLedger_agentUserId_fkey";

ALTER TABLE "CommissionLedger"
  ADD CONSTRAINT "CommissionLedger_agentUserId_fkey"
  FOREIGN KEY ("agentUserId") REFERENCES "User"(id) ON DELETE SET NULL;
