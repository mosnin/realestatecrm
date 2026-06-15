/**
 * Workflow metering (docs/PRICING_V2_PLAN.md §4.4).
 *
 * Two small guards the workflow entry points call: `assertCanSpend` up front
 * (refuse when the account can't afford it) and `chargeWorkflow` on success
 * (debit). Split so we only charge for work that actually completed.
 *
 * ⚠️ Gated by CREDITS_ENFORCED (default OFF). Until credits are live — Stripe
 * products created + monthly grants flowing + existing accounts backfilled —
 * enforcement stays off so workflows run free and nobody is blocked for having
 * a zero balance. Flip CREDITS_ENFORCED=true once grants are in place.
 */

import { resolveBillingAccount } from '@/lib/billing/account';
import { getCreditBalance, spendCredits, workflowCost } from '@/lib/billing/credits';
import { isPlatformAdmin } from '@/lib/permissions';
import { isSubscriptionDelinquent } from '@/lib/api-auth';
import type { Workflow } from '@/lib/plans';

export const CREDITS_ENFORCED = process.env.CREDITS_ENFORCED === 'true';

export class CreditsExhaustedError extends Error {
  readonly workflow: Workflow;
  readonly balance: number;
  constructor(workflow: Workflow, balance: number) {
    super(`Insufficient credits for ${workflow} (balance ${balance})`);
    this.name = 'CreditsExhaustedError';
    this.workflow = workflow;
    this.balance = balance;
  }
}

/**
 * Thrown when a canceled / past_due / unpaid account attempts metered work.
 * Distinct from CreditsExhaustedError (which means "buy more credits") — this
 * means "fix your subscription". Callers translate it to a 402 / billing CTA.
 */
export class SubscriptionDelinquentError extends Error {
  readonly workflow: Workflow;
  readonly status: string;
  constructor(workflow: Workflow, status: string) {
    super(`Subscription is ${status}; metered work for ${workflow} is blocked`);
    this.name = 'SubscriptionDelinquentError';
    this.workflow = workflow;
    this.status = status;
  }
}

/**
 * Refuse a workflow up front when the funding account can't afford it.
 * No-op unless enforcement is on. Throws CreditsExhaustedError when short —
 * callers translate that to a 402 / an "out of credits" result.
 */
export async function assertCanSpend(spaceId: string, workflow: Workflow, units = 1): Promise<void> {
  if (!CREDITS_ENFORCED) return;
  // Platform admins (the team with /admin dashboard access) get unlimited usage
  // for app testing — never blocked by the credit gate. Usage is still recorded;
  // only the up-front gate is skipped. Checked after the enforcement guard so it
  // adds zero overhead while CREDITS_ENFORCED is off.
  if (await isPlatformAdmin()) return;
  const { account, subscriptionStatus } = await resolveBillingAccount(spaceId);
  // Delinquency gate (Fix #4): a canceled / past_due / unpaid funding account
  // can't keep spending even if it has a leftover balance. Reuses the canonical
  // isSubscriptionDelinquent (same set the chat/broker dunning gates use) so the
  // "which statuses are delinquent" rule lives in ONE place. Runs only under
  // CREDITS_ENFORCED and after the admin exemption, matching the existing gate
  // semantics. The webhook downgrades canceled accounts' plan separately, so
  // that change still happens regardless of whether enforcement is on. (The chat
  // route also has an UNCONDITIONAL dunning gate; this extends the same
  // protection to the metered-workflow entry points, which lacked it.)
  if (isSubscriptionDelinquent(subscriptionStatus)) {
    throw new SubscriptionDelinquentError(workflow, subscriptionStatus ?? 'unknown');
  }
  const balance = await getCreditBalance(account);
  if (balance < workflowCost(workflow, units)) {
    throw new CreditsExhaustedError(workflow, balance);
  }
}

/**
 * Charge for a workflow that completed successfully. No-op unless enforcement
 * is on. Best-effort: never throws — a metering miss must not fail real work
 * (the up-front assertCanSpend is what guarantees the account could afford it).
 */
export async function chargeWorkflow(
  spaceId: string,
  workflow: Workflow,
  opts?: { units?: number; userId?: string },
): Promise<void> {
  if (!CREDITS_ENFORCED) return;
  try {
    const { account } = await resolveBillingAccount(spaceId);
    await spendCredits(account, workflow, {
      units: opts?.units,
      spaceId,
      userId: opts?.userId,
    });
  } catch {
    /* metering must never break the workflow */
  }
}
