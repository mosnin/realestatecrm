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
import { isPlatformAdminByClerkId } from '@/lib/permissions';
import type { Workflow } from '@/lib/plans';

/**
 * Credit enforcement switch. Explicit env wins (CREDITS_ENFORCED=true|false is
 * the kill switch / instant rollback); otherwise ON in production, OFF in dev
 * and test so the suite and local work run free. Flipping prod on requires the
 * existing-account credit backfill first (scripts/backfill-credit-grants.ts) —
 * otherwise un-granted accounts get refused for having a zero balance.
 */
export const CREDITS_ENFORCED =
  process.env.CREDITS_ENFORCED === 'true'
    ? true
    : process.env.CREDITS_ENFORCED === 'false'
      ? false
      : process.env.NODE_ENV === 'production';

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
 * Refuse a workflow up front when the funding account can't afford it.
 * No-op unless enforcement is on. Throws CreditsExhaustedError when short —
 * callers translate that to a 402 / an "out of credits" result.
 *
 * Pass `userId` (the acting Clerk id) so platform admins are never refused —
 * application admins have unlimited usage. Mirrors the same bypass in the
 * charge_credits_for_chat_usage DB trigger.
 */
export async function assertCanSpend(
  spaceId: string,
  workflow: Workflow,
  opts?: { units?: number; userId?: string },
): Promise<void> {
  if (!CREDITS_ENFORCED) return;
  if (await isPlatformAdminByClerkId(opts?.userId)) return; // admins: unlimited
  const { account } = await resolveBillingAccount(spaceId);
  const balance = await getCreditBalance(account);
  if (balance < workflowCost(workflow, opts?.units ?? 1)) {
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
  if (await isPlatformAdminByClerkId(opts?.userId)) return; // admins: unlimited
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
