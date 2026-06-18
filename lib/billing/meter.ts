/**
 * Workflow metering (docs/PRICING_V2_PLAN.md §4.4).
 *
 * Two small guards the workflow entry points call: `assertCanSpend` up front
 * (refuse when the account can't afford it) and `chargeWorkflow` on success
 * (debit). Split so we only charge for work that actually completed.
 *
 * Gated by CREDITS_ENFORCED, now ON by default — Stripe products are created,
 * monthly grants flow, and existing accounts are backfilled, so enforcement is
 * live. `CREDITS_ENFORCED=false` is the kill switch: set it to disable the gate
 * entirely (workflows run free, nobody is blocked for a zero balance) if a grant
 * regression ever needs an emergency rollback. Any other value (or unset) = ON.
 */

import { resolveBillingAccount } from '@/lib/billing/account';
import { getCreditBalance, spendCredits, workflowCost } from '@/lib/billing/credits';
import { isPlatformAdmin } from '@/lib/permissions';
import { isSubscriptionDelinquent } from '@/lib/api-auth';
import { logger } from '@/lib/logger';
import type { Workflow } from '@/lib/plans';

// ON unless explicitly disabled. `=== 'true'` would have left enforcement OFF on
// any deploy that simply forgot to set the var; the kill-switch form keeps it ON
// by default and only stands down on the exact opt-out string 'false'.
export const CREDITS_ENFORCED = process.env.CREDITS_ENFORCED !== 'false';

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
 *
 * Fails OPEN on infrastructure trouble: the two DOMAIN refusals
 * (CreditsExhaustedError / SubscriptionDelinquentError) always propagate so the
 * gate does its job, but any UNEXPECTED error in the lookups (a DB hiccup in the
 * admin / account / balance reads) is logged and swallowed — it returns rather
 * than throwing, so a transient blip can't 500 the request or lock out a paying
 * customer mid-workflow. Same fail-open posture the chat dunning gate and the
 * swarm budget check already take (a metering miss is cheaper than a false block
 * now that enforcement is ON by default).
 */
export async function assertCanSpend(spaceId: string, workflow: Workflow, units = 1): Promise<void> {
  if (!CREDITS_ENFORCED) return;
  try {
    // Platform admins (the team with /admin dashboard access) get unlimited usage
    // for app testing — never blocked by the credit gate. Usage is still recorded;
    // only the up-front gate is skipped. Checked after the enforcement guard so it
    // adds zero overhead while CREDITS_ENFORCED is off.
    if (await isPlatformAdmin()) return;
    const { account, subscriptionStatus, isComped } = await resolveBillingAccount(spaceId);
    // Complimentary (admin-granted) accounts get unlimited usage — never blocked
    // by the delinquency or credit gate, same posture as the platform-admin
    // exemption above. Demos must never hit a wall.
    if (isComped) return;
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
  } catch (err) {
    // Re-raise the deliberate refusals; callers map these to a 402 / billing CTA.
    if (err instanceof CreditsExhaustedError || err instanceof SubscriptionDelinquentError) {
      throw err;
    }
    // Anything else is infrastructure trouble, not "you can't afford it" — fail
    // open so the workflow proceeds. The balance is still debited best-effort by
    // chargeWorkflow on success, so we don't silently give work away forever.
    logger.warn('[billing.meter] assertCanSpend check failed — allowing workflow', { spaceId, workflow }, err);
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
    const { account, isComped } = await resolveBillingAccount(spaceId);
    // Comp accounts are free — never debited.
    if (isComped) return;
    await spendCredits(account, workflow, {
      units: opts?.units,
      spaceId,
      userId: opts?.userId,
    });
  } catch (err) {
    /* metering must never break the workflow — log and swallow */
    logger.error('[meter] chargeWorkflow failed silently', { spaceId, workflow }, err);
  }
}
