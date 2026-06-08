-- ============================================================================
-- Retain CreditTxn (the financial ledger) when a Space/Brokerage is deleted.
--
-- The 20260625000000 purge trigger deleted BOTH "CreditLot" AND "CreditTxn" for
-- a deleted account. That was wrong for "CreditTxn": it is the immutable record
-- of every credit debit/refund — a financial ledger — and financial ledgers
-- must survive account deletion (same stance as CommissionLedger, which was
-- switched to ON DELETE SET NULL rather than cascade). Destroying it erases the
-- billing trail for an account that may still be in dispute, reconciliation, or
-- chargeback.
--
-- "CreditLot" is different: it is the *spendable balance* (its `remaining`
-- column is the live wallet). Once the account is gone the balance is
-- meaningless and nothing can ever spend it, so we keep purging the lots to
-- avoid orphan rows accumulating forever. Only the ledger is retained.
--
-- We CREATE OR REPLACE the trigger function in place. The triggers themselves
-- (trg_purge_credits_on_space_delete / _brokerage_delete) already point at this
-- function name, so replacing the body is enough — no trigger DDL needed.
--
-- ✓ VALIDATED on PostgreSQL 16: after applying 20260625000000 then this
--   migration, deleting a Space/Brokerage removes its CreditLot rows and
--   RETAINS its CreditTxn rows; another account's rows are untouched.
-- ============================================================================

CREATE OR REPLACE FUNCTION purge_credit_rows_for_account() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- TG_ARGV[0] is the accountType this trigger guards ('space' | 'brokerage').
  -- Drop the spendable balance (CreditLot). Deliberately do NOT touch
  -- CreditTxn — the financial ledger is retained for billing/audit.
  DELETE FROM "CreditLot" WHERE "accountType" = TG_ARGV[0] AND "accountId" = OLD.id;
  RETURN OLD;
END;
$$;
