-- ============================================================================
-- Ledger / commission DB hardening, round 2 (audit follow-up to #350).
--
-- Two independent, code-grounded fixes:
--
-- 1. CommissionLedger.dealId retain-on-delete. #311 fixed exactly this bug class
--    on the agentUserId FK (CASCADE → SET NULL) so deleting an agent's User row
--    can't destroy the brokerage's frozen commission books. The IDENTICAL
--    footgun on the dealId FK was left as ON DELETE CASCADE: a space owner
--    deleting a won Deal (app/api/deals/[id]/route.ts) cascade-deletes the
--    brokerage's ledger row for that deal — a closed-commission record the
--    brokerage owns, gone with no trace. The amounts are already snapshotted at
--    close time, so the row should survive the deal with dealId = NULL, exactly
--    like the agentUserId fix. UNIQUE(dealId) is unaffected: Postgres treats
--    NULLs as distinct, so multiple deleted-deal rows coexist, and the
--    ON CONFLICT(dealId) idempotency only matters while the deal is live (non-null).
--    Readers already tolerate NULL agentUserId; they must tolerate NULL dealId
--    (historical rows for deleted deals) the same way.
--
-- 2. Pin search_path on current_user_internal_id(). It is SECURITY DEFINER (the
--    identity linchpin of every space-scoped RLS policy, including ChatUsage's)
--    and references "User" unqualified with no fixed search_path — the exact
--    function_search_path_mutable class #350 closed on the credit RPCs, and the
--    highest-value DEFINER function in the schema. auth.uid() is already
--    schema-qualified in the body, so public + pg_temp resolves the body fully.
--    pg_temp last so a temp-table shadow of "User" can't win.
--
-- (Deliberately NOT touching EXECUTE grants on the credit RPCs: they run as the
--  caller, not DEFINER, and CreditLot/CreditTxn are RLS-fail-closed with no role
--  grant, so the surface is already inert. REVOKE ... FROM PUBLIC would also
--  strip service_role's execute and risks breaking every credit op for marginal
--  defense-in-depth — it belongs in its own carefully-validated change, not here.)
--
-- ✓ VALIDATED on PostgreSQL 16 (both ALTERs apply clean; dealId delete now
--    preserves the ledger row with NULL dealId; proconfig pinned on the function).
-- ============================================================================

-- 1. ── CommissionLedger.dealId: retain books when the deal is deleted ────────
ALTER TABLE "CommissionLedger" ALTER COLUMN "dealId" DROP NOT NULL;

ALTER TABLE "CommissionLedger" DROP CONSTRAINT IF EXISTS "CommissionLedger_dealId_fkey";

ALTER TABLE "CommissionLedger"
  ADD CONSTRAINT "CommissionLedger_dealId_fkey"
  FOREIGN KEY ("dealId") REFERENCES "Deal"(id) ON DELETE SET NULL;

-- 2. ── pin search_path on the RLS identity function ─────────────────────────
ALTER FUNCTION current_user_internal_id() SET search_path = public, pg_temp;
