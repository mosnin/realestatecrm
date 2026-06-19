-- ============================================================================
-- Invite codes: admin-minted codes that grant a Space FREE access (comp) at a
-- chosen plan, bypassing Stripe — WITHOUT a parallel bypass mechanism.
-- ============================================================================
-- WHY: Sales / partnerships need to hand out "free <$97 plan>" codes that a user
-- redeems on the pick-a-plan page instead of paying. The existing complimentary
-- ("comp") access mechanism (Space."compAccess"/"compExpiresAt"/"compNote",
-- migration 20260707000000) is ALREADY the Stripe-independent free-access path
-- the access gate + credit meter + plan resolver all honor. Redeeming a code is
-- therefore nothing more than "grant comp on the caller's Space, at the code's
-- plan, for the code's duration." This migration adds the codes + a redemption
-- ledger, ONE new optional column ("compPlan") so a comped Space can resolve to a
-- plan OTHER than the historical demo default, and an ATOMIC redemption function
-- so a code can never be used past its maxUses under concurrency.
--
-- Two tables:
--   InviteCode           — one row per code (the thing an admin mints)
--   InviteCodeRedemption — one row per (code, space) redemption (the ledger)
--
-- Conventions mirror 20260716000000_saved_views.sql (quoted camelCase columns,
-- text PK via gen_random_uuid()::text, ON DELETE CASCADE to "Space", RLS block at
-- the bottom). Idempotent: safe to re-run (IF NOT EXISTS everywhere + ADD COLUMN
-- IF NOT EXISTS heal blocks + CREATE OR REPLACE FUNCTION + DROP POLICY IF EXISTS
-- before CREATE POLICY).

-- ── compPlan: the plan a comped Space reports ───────────────────────────────
-- Before this, lib/billing/comp.ts resolved EVERY comped Space to the top tier
-- (COMP_SPACE_PLAN = 'pro') so internal demos saw the full feature set. An
-- invite code grants a SPECIFIC plan (e.g. the $97 'solo' tier), so a comped
-- Space needs to be able to report that plan instead of always 'pro'. This
-- nullable column carries the granted PlanId; lib/billing/account.ts uses it when
-- set and falls back to COMP_SPACE_PLAN when NULL — so existing demo comps (NULL
-- compPlan) keep resolving to 'pro' unchanged. Stripe never reads/writes it.
ALTER TABLE "Space" ADD COLUMN IF NOT EXISTS "compPlan" text;

-- ── InviteCode ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "InviteCode" (
  "id"               text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  -- Stored NORMALIZED (trimmed + lowercased) so lookups are case-insensitive and
  -- the UNIQUE constraint can't be dodged with casing. The route normalizes on
  -- both create + redeem; this UNIQUE is the backstop.
  "code"             text NOT NULL UNIQUE,
  -- The granted PlanId (a value of lib/plans.ts PlanId). Defaults to the $97
  -- self-serve tier. CHECKed against the known plan ids so a typo can never mint
  -- a code that grants an un-resolvable plan.
  "plan"             text NOT NULL DEFAULT 'solo'
                       CHECK ("plan" IN ('free','solo','pro','team','team_plus')),
  -- NULL = unlimited uses; else the cap.
  "maxUses"          integer,
  -- Monotonic counter of successful redemptions. The atomic function bumps it
  -- under a row lock so it can never exceed maxUses.
  "usesCount"        integer NOT NULL DEFAULT 0,
  -- NULL = never expires; else the instant after which redemption is refused.
  "expiresAt"        timestamptz,
  -- Kill switch — a deactivated code is refused regardless of uses/expiry.
  "active"           boolean NOT NULL DEFAULT true,
  -- NULL = the granted comp never expires; else compExpiresAt = redeem time + N
  -- days (a time-boxed free period).
  "compDurationDays" integer,
  -- Clerk id of the admin who minted it (attribution only).
  "createdByClerkId" text,
  -- Free-text admin note (e.g. "Partner: Acme webinar").
  "note"             text,
  "createdAt"        timestamptz NOT NULL DEFAULT now(),
  "updatedAt"        timestamptz NOT NULL DEFAULT now()
);

-- Normalize the code (trim + lowercase) on every write so the stored value is
-- ALWAYS canonical and the UNIQUE constraint is truly case-insensitive — even if
-- a future caller forgets to normalize. The app normalizes too (belt + braces);
-- this trigger is the DB-level guarantee the redemption lookup (which matches
-- lower(btrim(...))) depends on.
CREATE OR REPLACE FUNCTION normalize_invite_code() RETURNS trigger AS $$
BEGIN
  NEW."code" := lower(btrim(NEW."code"));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "InviteCode_normalize_code" ON "InviteCode";
CREATE TRIGGER "InviteCode_normalize_code"
  BEFORE INSERT OR UPDATE OF "code" ON "InviteCode"
  FOR EACH ROW EXECUTE FUNCTION normalize_invite_code();

-- Re-run safety: bring a partially-created table up to spec without erroring.
ALTER TABLE "InviteCode" ADD COLUMN IF NOT EXISTS "code" text;
ALTER TABLE "InviteCode" ADD COLUMN IF NOT EXISTS "plan" text NOT NULL DEFAULT 'solo';
ALTER TABLE "InviteCode" ADD COLUMN IF NOT EXISTS "maxUses" integer;
ALTER TABLE "InviteCode" ADD COLUMN IF NOT EXISTS "usesCount" integer NOT NULL DEFAULT 0;
ALTER TABLE "InviteCode" ADD COLUMN IF NOT EXISTS "expiresAt" timestamptz;
ALTER TABLE "InviteCode" ADD COLUMN IF NOT EXISTS "active" boolean NOT NULL DEFAULT true;
ALTER TABLE "InviteCode" ADD COLUMN IF NOT EXISTS "compDurationDays" integer;
ALTER TABLE "InviteCode" ADD COLUMN IF NOT EXISTS "createdByClerkId" text;
ALTER TABLE "InviteCode" ADD COLUMN IF NOT EXISTS "note" text;
ALTER TABLE "InviteCode" ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT now();
ALTER TABLE "InviteCode" ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now();

-- ── InviteCodeRedemption (the ledger) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "InviteCodeRedemption" (
  "id"           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "inviteCodeId" text NOT NULL REFERENCES "InviteCode"(id) ON DELETE CASCADE,
  "spaceId"      text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  -- Clerk id of the redeemer (attribution).
  "userClerkId"  text,
  "redeemedAt"   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "InviteCodeRedemption" ADD COLUMN IF NOT EXISTS "inviteCodeId" text;
ALTER TABLE "InviteCodeRedemption" ADD COLUMN IF NOT EXISTS "spaceId" text;
ALTER TABLE "InviteCodeRedemption" ADD COLUMN IF NOT EXISTS "userClerkId" text;
ALTER TABLE "InviteCodeRedemption" ADD COLUMN IF NOT EXISTS "redeemedAt" timestamptz NOT NULL DEFAULT now();

-- A given Space can redeem a given code AT MOST ONCE — the second layer (after
-- the atomic function's explicit re-check) guaranteeing "already redeemed" is
-- impossible even under a race.
CREATE UNIQUE INDEX IF NOT EXISTS "InviteCodeRedemption_code_space_uniq"
  ON "InviteCodeRedemption" ("inviteCodeId", "spaceId");

-- Counting redemptions per code (admin listing / sanity checks).
CREATE INDEX IF NOT EXISTS "InviteCodeRedemption_code_idx"
  ON "InviteCodeRedemption" ("inviteCodeId");

-- ── Atomic redemption ───────────────────────────────────────────────────────
-- One transaction, one answer. Locks the code row (FOR UPDATE) so concurrent
-- redemptions serialize, re-validates EVERYTHING under the lock (active, expiry,
-- maxUses, not-already-redeemed-by-this-space), then — only if valid — inserts
-- the ledger row, bumps usesCount, and grants comp on the Space at the code's
-- plan/duration. Returns a status string the route maps to an HTTP response; it
-- never raises for a business rejection (so the route doesn't have to parse
-- SQLSTATEs), only for true infrastructure failure.
--
-- SECURITY: p_space_id MUST be a space the CALLER owns — the route resolves it
-- from the authed session (getSpaceForUser on the Clerk user) and passes it here,
-- never from client input; this function trusts that resolution.
--
-- Return codes:
--   ok               redeemed; comp granted
--   not_found        no such (normalized) code
--   inactive         code.active = false
--   expired          code.expiresAt has passed
--   exhausted        usesCount >= maxUses
--   already_redeemed this space already redeemed this code
CREATE OR REPLACE FUNCTION redeem_invite_code_atomic(
  p_code         text,
  p_space_id     text,
  p_user_clerk_id text
) RETURNS text AS $$
DECLARE
  v_code        "InviteCode"%ROWTYPE;
  v_comp_expiry timestamptz;
BEGIN
  -- Lock the code row for the duration of the txn. Normalize the lookup key the
  -- same way the writer does (trim + lower) so casing/whitespace can't miss.
  SELECT * INTO v_code
    FROM "InviteCode"
    WHERE "code" = lower(btrim(p_code))
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  IF v_code."active" IS NOT TRUE THEN
    RETURN 'inactive';
  END IF;

  IF v_code."expiresAt" IS NOT NULL AND v_code."expiresAt" <= now() THEN
    RETURN 'expired';
  END IF;

  -- Already redeemed by THIS space? (Idempotent: a double-submit returns a clean
  -- rejection instead of erroring on the unique index.)
  IF EXISTS (
    SELECT 1 FROM "InviteCodeRedemption"
      WHERE "inviteCodeId" = v_code."id" AND "spaceId" = p_space_id
  ) THEN
    RETURN 'already_redeemed';
  END IF;

  -- Use cap — checked under the lock, so usesCount can never pass maxUses.
  IF v_code."maxUses" IS NOT NULL AND v_code."usesCount" >= v_code."maxUses" THEN
    RETURN 'exhausted';
  END IF;

  -- Compute the comp expiry from the code's duration (NULL = no expiry).
  IF v_code."compDurationDays" IS NOT NULL THEN
    v_comp_expiry := now() + make_interval(days => v_code."compDurationDays");
  ELSE
    v_comp_expiry := NULL;
  END IF;

  -- 1) Ledger row (the unique index is the final backstop against a double-spend
  --    that somehow slipped the EXISTS check).
  INSERT INTO "InviteCodeRedemption" ("inviteCodeId", "spaceId", "userClerkId")
    VALUES (v_code."id", p_space_id, p_user_clerk_id);

  -- 2) Bump the counter (guarded by the lock + the maxUses check above).
  UPDATE "InviteCode"
    SET "usesCount" = "usesCount" + 1, "updatedAt" = now()
    WHERE "id" = v_code."id";

  -- 3) Grant comp on the Space at the code's plan/duration. This is the EXISTING
  --    Stripe-independent free-access mechanism (compAccess gate); compPlan makes
  --    the comped plan resolve to the code's plan instead of the demo default.
  UPDATE "Space"
    SET "compAccess"    = true,
        "compExpiresAt" = v_comp_expiry,
        "compNote"      = 'invite:' || v_code."code",
        "compPlan"      = v_code."plan"
    WHERE "id" = p_space_id;

  RETURN 'ok';
END;
$$ LANGUAGE plpgsql;

-- ── RLS — defense-in-depth, mirrors 20260716000000_saved_views.sql ──────────
-- All app access is via the service-role key (lib/supabase.ts), which BYPASSES
-- RLS; admin gating lives at the route layer (requirePlatformAdmin) and
-- redemption ownership at requireAuth + getSpaceForUser + the atomic function.
-- These policies
-- are least-privilege posture against a future browser/anon path and cannot break
-- the current server flow.
--
-- InviteCode: there is NO safe row-scoping for an authenticated end user (a code
-- is a secret, not user-owned data), so authenticated/anon get NOTHING. The admin
-- console reads it via the service role.
ALTER TABLE "InviteCode" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "InviteCode" FROM anon, authenticated;

-- InviteCodeRedemption: a user may SELECT only redemptions for a space they own
-- (parity with saved_view_authenticated_select). No insert/update/delete for
-- authenticated/anon — redemption happens only through the service-role function.
ALTER TABLE "InviteCodeRedemption" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invite_redemption_authenticated_select" ON "InviteCodeRedemption";
CREATE POLICY "invite_redemption_authenticated_select" ON "InviteCodeRedemption"
  FOR SELECT TO authenticated
  USING (
    "spaceId" IN (
      SELECT s.id FROM "Space" s
      JOIN "User" u ON u.id = s."ownerId"
      WHERE u."clerkId" = auth.jwt() ->> 'sub'
    )
  );
REVOKE ALL ON "InviteCodeRedemption" FROM anon, authenticated;
GRANT SELECT ON "InviteCodeRedemption" TO authenticated;
