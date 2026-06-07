/**
 * Credit grants — turning a plan/top-up into credit lots (docs/PRICING_V2_PLAN.md
 * §4.3). Thin layer over `grantCredits` that knows the plan amounts + expiry
 * rules, so the webhook, the free-signup path, and the admin tools all grant the
 * same way.
 */

import { grantCredits, type BillingAccount } from '@/lib/billing/credits';
import { PLANS, TOPUPS, CREDIT_ROLLOVER_DAYS, type PlanId, type TopupId } from '@/lib/plans';

/** Credits expire 30 days after grant (rollover); Free's one-time grant never does. */
function rolloverExpiry(): Date {
  return new Date(Date.now() + CREDIT_ROLLOVER_DAYS * 86400_000);
}

/** Pure: how many credits a plan grants per month, including per-user add-ons. */
export function monthlyGrantAmount(plan: PlanId, addonUsers = 0): number {
  const def = PLANS[plan];
  const addon = def.addUser && addonUsers > 0 ? def.addUser.credits * addonUsers : 0;
  return def.monthlyCredits + addon;
}

/** Grant a plan's recurring monthly credits (30-day rollover). No-op for Free. */
export async function grantMonthlyCredits(
  account: BillingAccount,
  plan: PlanId,
  addonUsers = 0,
): Promise<number> {
  const amount = monthlyGrantAmount(plan, addonUsers);
  if (amount <= 0) return 0;
  await grantCredits(account, amount, 'monthly_grant', rolloverExpiry());
  return amount;
}

/** One-time Free-tier signup grant (never expires, per spec). */
export async function grantFreeSignup(account: BillingAccount): Promise<number> {
  const amount = PLANS.free.oneTimeCredits ?? 0;
  if (amount <= 0) return 0;
  await grantCredits(account, amount, 'free_signup', null);
  return amount;
}

/** A purchased top-up pack (30-day rollover). */
export async function grantTopup(account: BillingAccount, topup: TopupId): Promise<number> {
  const amount = TOPUPS[topup].credits;
  await grantCredits(account, amount, 'topup', rolloverExpiry());
  return amount;
}

/** Plan tiers that carry a recurring monthly credit grant. */
const GRANTABLE_PLANS = new Set<PlanId>(['solo', 'pro', 'team', 'team_plus']);

/**
 * Grant a plan's monthly credits when an invoice is paid. Tolerant of the raw
 * plan string stored on Space/Brokerage (legacy `starter`/`enterprise` carry no
 * defined monthly grant → no-op). Returns the credits granted (0 if none).
 */
export async function grantPlanMonthly(account: BillingAccount, planRaw: string): Promise<number> {
  if (!GRANTABLE_PLANS.has(planRaw as PlanId)) return 0;
  return grantMonthlyCredits(account, planRaw as PlanId);
}
