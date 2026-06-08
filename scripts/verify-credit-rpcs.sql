-- ============================================================================
-- verify-credit-rpcs.sql — operator proof of the credit-ledger invariants
-- against a REAL Postgres, not a TS mirror.
--
-- WHY THIS EXISTS
-- ---------------
-- The credit balance is money. The FIFO debit, the sourceId idempotency, and
-- the fail-closed-on-insufficient-balance behavior all live in plpgsql
-- (supabase/migrations/20260620…, 20260623…). The TS mirror (lib/billing/
-- credits.ts) is unit-tested, but the SQL itself is only as trustworthy as the
-- last time someone ran it against a real cluster. This script IS that run.
--
-- HOW TO RUN
-- ----------
-- Against a throwaway local Postgres 16 (must be run as a non-root user — PG
-- refuses to start as root):
--
--   initdb -D /tmp/pgcredit -U postgres --auth=trust
--   pg_ctl  -D /tmp/pgcredit -o "-p 54329 -k /tmp" -l /tmp/pg.log start
--   psql -h /tmp -p 54329 -U postgres -c 'CREATE DATABASE credittest;'
--   # load the credit migrations (the Space backfill in the hardening
--   # migration is irrelevant here and will warn — that's expected):
--   psql -h /tmp -p 54329 -U postgres -d credittest \
--     -f supabase/migrations/20260620000000_credit_ledger.sql
--   psql -h /tmp -p 54329 -U postgres -d credittest \
--     -f supabase/migrations/20260623000000_credit_grant_idempotency.sql
--   # then this script:
--   psql -h /tmp -p 54329 -U postgres -d credittest -v ON_ERROR_STOP=1 \
--     -f scripts/verify-credit-rpcs.sql
--
-- It is self-checking: every invariant is asserted with a DO block that RAISES
-- on violation, so a non-zero psql exit means an invariant broke. A clean run
-- prints "ALL CREDIT-RPC INVARIANTS HOLD".
-- ============================================================================

\set ON_ERROR_STOP on

-- Isolate this run from any prior data.
DELETE FROM "CreditTxn" WHERE "accountId" = 'verify_acct';
DELETE FROM "CreditLot" WHERE "accountId" = 'verify_acct';

-- ── 1. grant N, spend M → balance = N - M ───────────────────────────────────
SELECT grant_credits('space', 'verify_acct', 1000, 'monthly_grant',
                     now() + interval '30 days', 'verify_inv_1');

DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM spend_credits('space','verify_acct',300,'chat_turn',NULL,NULL,'{}'::jsonb);
  IF NOT r.ok THEN RAISE EXCEPTION 'spend of 300 from 1000 should succeed'; END IF;
  IF r.balance <> 700 THEN RAISE EXCEPTION 'expected balance 700 after spend, got %', r.balance; END IF;
END $$;

DO $$
DECLARE bal integer;
BEGIN
  SELECT COALESCE(SUM(remaining),0) INTO bal FROM "CreditLot"
   WHERE "accountId"='verify_acct' AND remaining > 0;
  IF bal <> 700 THEN RAISE EXCEPTION 'ledger balance should be 700, got %', bal; END IF;
END $$;

-- ── 2. re-grant the SAME sourceId → no double-grant ─────────────────────────
SELECT grant_credits('space', 'verify_acct', 1000, 'monthly_grant',
                     now() + interval '30 days', 'verify_inv_1');  -- duplicate

DO $$
DECLARE bal integer; lots integer;
BEGIN
  SELECT COALESCE(SUM(remaining),0) INTO bal FROM "CreditLot"
   WHERE "accountId"='verify_acct' AND remaining > 0;
  SELECT count(*) INTO lots FROM "CreditLot" WHERE "accountId"='verify_acct';
  IF bal <> 700 THEN RAISE EXCEPTION 'duplicate sourceId must not re-grant; balance % (expected 700)', bal; END IF;
  IF lots <> 1 THEN RAISE EXCEPTION 'duplicate sourceId must not mint a new lot; lot count % (expected 1)', lots; END IF;
END $$;

-- ── 3. spend MORE than balance → fails closed, balance untouched ────────────
DO $$
DECLARE r record; bal integer;
BEGIN
  SELECT * INTO r FROM spend_credits('space','verify_acct',9999,'chat_turn',NULL,NULL,'{}'::jsonb);
  IF r.ok THEN RAISE EXCEPTION 'overspend (9999 of 700) must fail closed'; END IF;
  SELECT COALESCE(SUM(remaining),0) INTO bal FROM "CreditLot"
   WHERE "accountId"='verify_acct' AND remaining > 0;
  IF bal <> 700 THEN RAISE EXCEPTION 'failed spend must not touch balance; got % (expected 700)', bal; END IF;
END $$;

-- Clean up the verification rows so the script is rerunnable.
DELETE FROM "CreditTxn" WHERE "accountId" = 'verify_acct';
DELETE FROM "CreditLot" WHERE "accountId" = 'verify_acct';

\echo 'ALL CREDIT-RPC INVARIANTS HOLD'
