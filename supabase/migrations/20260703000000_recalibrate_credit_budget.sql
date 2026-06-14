-- ============================================================================
-- Recalibrate the per-credit COGS budget: $0.013 -> $0.0065.
--
-- Monthly credit allotments doubled (lib/plans.ts) and the model lineup moved to
-- the far cheaper DeepSeek / Tencent / qwen set. Halving the budget alongside the
-- 2x allotments keeps worst-case margins UNCHANGED (credits 2x * budget 1/2x),
-- while real usage roughly doubles (actual model COGS sits well under the budget).
--
-- Must stay in sync with CREDIT_COGS_BUDGET_USD in lib/plans.ts. Only the
-- per-credit constant changes; the FIFO drain + txn logging are identical to
-- 20260627000000_meter_chat_usage_credits.sql. CREATE OR REPLACE swaps the
-- function body in place — the existing trigger keeps pointing at it.
-- ============================================================================

CREATE OR REPLACE FUNCTION charge_credits_for_chat_usage()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_credits integer;
  v_acct    RECORD;
  v_need    integer;
  v_lot     RECORD;
  v_take    integer;
  v_debited integer := 0;
BEGIN
  -- Model-aware cost -> credits. 0.0065 USD COGS budget per credit (lib/plans.ts).
  v_credits := GREATEST(1, CEIL(COALESCE(NEW."costUsd", 0) / 0.0065));

  SELECT account_type, account_id INTO v_acct
    FROM resolve_billing_account_for_space(NEW."spaceId");
  IF v_acct.account_id IS NULL THEN RETURN NEW; END IF;

  v_need := v_credits;
  -- FIFO drain over spendable lots, soonest-expiring first (nulls last). Drains
  -- to AVAILABLE only (never negative); no spendable lots -> no-op (self-gating).
  FOR v_lot IN
    SELECT id, remaining FROM "CreditLot"
     WHERE "accountType" = v_acct.account_type
       AND "accountId"   = v_acct.account_id
       AND remaining > 0
       AND ("expiresAt" IS NULL OR "expiresAt" > now())
     ORDER BY ("expiresAt" IS NULL), "expiresAt" ASC, "createdAt" ASC
     FOR UPDATE
  LOOP
    EXIT WHEN v_need <= 0;
    v_take := LEAST(v_lot.remaining, v_need);
    UPDATE "CreditLot" SET remaining = remaining - v_take WHERE id = v_lot.id;
    v_need    := v_need - v_take;
    v_debited := v_debited + v_take;
  END LOOP;

  IF v_debited > 0 THEN
    INSERT INTO "CreditTxn" ("accountType", "accountId", delta, workflow, "spaceId", "userId", reason, metadata)
    VALUES (
      v_acct.account_type, v_acct.account_id, -v_debited, 'chat_turn', NEW."spaceId", NEW."userId", 'spend',
      jsonb_build_object(
        'chatUsageId', NEW.id, 'model', NEW.model, 'costUsd', NEW."costUsd",
        'creditsAssessed', v_credits, 'creditsDebited', v_debited
      )
    );
  END IF;

  RETURN NEW;
END;
$$;
