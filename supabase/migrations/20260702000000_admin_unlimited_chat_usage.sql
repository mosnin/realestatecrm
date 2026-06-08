-- ============================================================================
-- Platform admins: unlimited usage (never metered).
--
-- "Application admins have unlimited usage." The chat/agent charge is the DB
-- trigger charge_credits_for_chat_usage (20260627000000) — the single charge
-- point for EVERY surface — so the admin bypass has to live here too, not just
-- in the app-layer gate. Without this, an admin's turns would still be debited
-- by the trigger even though the app gate never refuses them.
--
-- Rule (identical to the app gate in lib/billing/meter.ts): if the turn's acting
-- user is a platform admin, skip the charge entirely. NEW."userId" is the Clerk
-- id of the realtor who sent the message; admins are User.platformRole = 'admin'.
-- A NULL userId (some background paths) is never an admin, so it charges as before.
--
-- CREATE OR REPLACE only — re-declares the function body with the early return;
-- the trigger binding (trg_charge_credits_on_chat_usage) is unchanged.
--
-- ✓ VALIDATED on PostgreSQL 16 — see PR for the transcript.
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
  -- Platform admins have unlimited usage: never charge their turns. This is the
  -- single charge point for every chat/agent surface, so the bypass must be here.
  IF NEW."userId" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "User" WHERE "clerkId" = NEW."userId" AND "platformRole" = 'admin'
  ) THEN
    RETURN NEW;
  END IF;

  -- Model-aware cost -> credits. 0.013 USD COGS budget per credit (lib/plans.ts).
  v_credits := GREATEST(1, CEIL(COALESCE(NEW."costUsd", 0) / 0.013));

  SELECT account_type, account_id INTO v_acct
    FROM resolve_billing_account_for_space(NEW."spaceId");
  IF v_acct.account_id IS NULL THEN RETURN NEW; END IF;

  v_need := v_credits;
  -- FIFO drain over spendable lots, soonest-expiring first (nulls last) — mirrors
  -- spend_credits' ordering. Drains to AVAILABLE only (never negative): a turn
  -- that overshoots the balance leaves it at 0 and the app gate refuses the next
  -- one. No spendable lots → no-op (self-gating).
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
