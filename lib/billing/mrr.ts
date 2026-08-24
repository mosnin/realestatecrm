/**
 * Admin MRR from live plan ids — not a hardcoded Solo price.
 *
 * `Space.plan` / `Brokerage.plan` is the product tier. We only count rows
 * whose Stripe status is currently paid (`active` + current period). Annual
 * subscriptions still contribute the monthly display price so the admin
 * headline stays comparable month to month.
 */

import { PLANS, type PlanId } from '@/lib/plans';

export interface MrrRow {
  plan: string | null | undefined;
  status: string | null | undefined;
  current: boolean;
}

export function monthlyPriceForPlan(plan: string | null | undefined): number {
  if (!plan || !(plan in PLANS)) return 0;
  return PLANS[plan as PlanId].priceMonthly;
}

/** Sum of monthly list prices for currently-paid rows. Pure. */
export function mrrFromPlans(rows: readonly MrrRow[]): number {
  let total = 0;
  for (const row of rows) {
    if (row.status !== 'active' || !row.current) continue;
    total += monthlyPriceForPlan(row.plan);
  }
  return total;
}
