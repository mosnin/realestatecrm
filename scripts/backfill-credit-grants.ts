/**
 * backfill-credit-grants — the required pre-step before flipping CREDITS_ENFORCED on.
 *
 * Enforcement (the app gate, lib/billing/meter.ts) refuses any account whose
 * spendable balance is below a workflow's cost. Accounts that predate the credit
 * system — or paid accounts that haven't hit a renewal since grants started —
 * have ZERO lots, so turning enforcement on would lock them out of Chippi until
 * their next invoice. This grants each existing account its current allotment so
 * the switch is a no-op for everyone who's paid up.
 *
 * What it grants (mirrors lib/billing/grants.ts — same amounts, same expiry):
 *   • Space on solo/pro       → that plan's monthlyCredits (30-day rollover)
 *   • Brokerage on team/team+ → that plan's base monthlyCredits (30-day rollover)
 *   • Space on free           → the 100 one-time signup credits, only if missing
 *
 * IDEMPOTENT. Plan grants use a fixed per-account sourceId, and the DB's
 * uq_creditlot_source unique index (reason, sourceId) makes a re-run a no-op —
 * you can run it twice safely. Free grants are guarded by grantFreeSignup's own
 * one-per-account check. Re-running after a real renewal will NOT stack: the
 * renewal lot has the invoice id as sourceId, this one has BACKFILL_SOURCE — they
 * are different keys, so a paid account briefly holds both. That's intended (a
 * one-time make-whole), not a double monthly grant.
 *
 * SAFETY: dry-run by default — prints exactly what it WOULD grant and exits.
 * Pass --apply to write. Service role bypasses RLS (we grant for every tenant).
 *
 *   Preview:  pnpm dlx tsx scripts/backfill-credit-grants.ts
 *   Execute:  pnpm dlx tsx scripts/backfill-credit-grants.ts --apply
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (read by
 * lib/supabase.ts). Read-only on everything except CreditLot (via grant_credits).
 */

import { supabase } from '@/lib/supabase';
import { grantMonthlyCredits, grantFreeSignup, monthlyGrantAmount } from '@/lib/billing/grants';
import type { BillingAccount } from '@/lib/billing/credits';
import type { PlanId } from '@/lib/plans';

const APPLY = process.argv.includes('--apply');
const BACKFILL_SOURCE = 'backfill-enforcement-2026-06';

const SPACE_PAID_PLANS: PlanId[] = ['solo', 'pro'];
const BROKERAGE_PLANS: PlanId[] = ['team', 'team_plus'];

function log(...a: unknown[]) {
  console.log(...a);
}

async function run() {
  log(`\nbackfill-credit-grants — ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes)'}\n`);

  let granted = 0;
  let credits = 0;
  let skippedFree = 0;

  // ── Paid spaces (solo/pro) ────────────────────────────────────────────────
  const { data: paidSpaces, error: sErr } = await supabase
    .from('Space')
    .select('id, plan')
    .in('plan', SPACE_PAID_PLANS);
  if (sErr) throw sErr;

  for (const s of paidSpaces ?? []) {
    const plan = s.plan as PlanId;
    const amount = monthlyGrantAmount(plan);
    const account: BillingAccount = { type: 'space', id: s.id as string };
    log(`  space ${s.id}  ${plan}  +${amount}`);
    if (APPLY) {
      await grantMonthlyCredits(account, plan, 0, `${BACKFILL_SOURCE}:space:${s.id}`);
    }
    granted++;
    credits += amount;
  }

  // ── Team brokerages (team/team_plus) — base allotment ─────────────────────
  const { data: teamBrks, error: bErr } = await supabase
    .from('Brokerage')
    .select('id, plan')
    .in('plan', BROKERAGE_PLANS);
  if (bErr) throw bErr;

  for (const b of teamBrks ?? []) {
    const plan = b.plan as PlanId;
    const amount = monthlyGrantAmount(plan); // base seats; add-on seats reconcile at next renewal
    const account: BillingAccount = { type: 'brokerage', id: b.id as string };
    log(`  brokerage ${b.id}  ${plan}  +${amount} (base)`);
    if (APPLY) {
      await grantMonthlyCredits(account, plan, 0, `${BACKFILL_SOURCE}:brokerage:${b.id}`);
    }
    granted++;
    credits += amount;
  }

  // ── Free spaces missing their one-time signup grant ───────────────────────
  const { data: freeSpaces, error: fErr } = await supabase
    .from('Space')
    .select('id')
    .eq('plan', 'free');
  if (fErr) throw fErr;

  for (const s of freeSpaces ?? []) {
    const account: BillingAccount = { type: 'space', id: s.id as string };
    if (APPLY) {
      const got = await grantFreeSignup(account); // 0 if already granted
      if (got > 0) {
        log(`  space ${s.id}  free  +${got} (signup)`);
        granted++;
        credits += got;
      } else {
        skippedFree++;
      }
    } else {
      // Dry run: check whether a signup lot already exists so the preview is honest.
      const { data: existing } = await supabase
        .from('CreditLot')
        .select('id')
        .eq('accountType', 'space')
        .eq('accountId', s.id)
        .eq('reason', 'free_signup')
        .maybeSingle();
      if (existing) {
        skippedFree++;
      } else {
        log(`  space ${s.id}  free  +100 (signup)`);
        granted++;
        credits += 100;
      }
    }
  }

  log(`\n${APPLY ? 'Granted' : 'Would grant'}: ${granted} accounts, ${credits} credits total.`);
  log(`Free spaces already granted (skipped): ${skippedFree}.`);
  if (!APPLY) log('\nRe-run with --apply to write.\n');
}

run().catch((err) => {
  console.error('backfill-credit-grants FAILED:', err);
  process.exit(1);
});
