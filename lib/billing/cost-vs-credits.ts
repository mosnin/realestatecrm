/**
 * Cost vs credit-grant comparison for admin and the daily Sentry alarm.
 *
 * OpenRouter `usage.cost` lands on ChatUsage.costUsd. The monthly credit grant
 * implies a USD COGS budget (`monthlyCredits * CREDIT_COGS_BUDGET_USD`). This
 * module compares spend in a window to the pro-rated grant — no new routes.
 * Pure: safe to unit-test without Supabase.
 */

import {
  CREDIT_COGS_BUDGET_USD,
  CREDIT_ROLLOVER_DAYS,
  PLANS,
  type PlanId,
} from '@/lib/plans';

export const DEFAULT_COST_ALARM_MULTIPLIER = 3;

const GRANTABLE: ReadonlySet<PlanId> = new Set(['solo', 'pro', 'team', 'team_plus']);

export function isGrantablePlan(plan: string | null | undefined): plan is PlanId {
  return !!plan && GRANTABLE.has(plan as PlanId);
}

function monthlyGrant(plan: PlanId, addonUsers = 0): number {
  const def = PLANS[plan];
  const addon = def.addUser && addonUsers > 0 ? def.addUser.credits * addonUsers : 0;
  return def.monthlyCredits + addon;
}

/** USD COGS budget implied by a plan's monthly credit grant. */
export function monthlyUsdBudgetForPlan(plan: PlanId, addonUsers = 0): number {
  return monthlyGrant(plan, addonUsers) * CREDIT_COGS_BUDGET_USD;
}

export function windowUsdBudgetForPlan(
  plan: PlanId,
  windowDays: number,
  addonUsers = 0,
): number {
  if (windowDays <= 0) return 0;
  return monthlyUsdBudgetForPlan(plan, addonUsers) * (windowDays / CREDIT_ROLLOVER_DAYS);
}

export interface SpaceCostRow {
  spaceId: string;
  plan: string | null | undefined;
  costUsd: number;
}

export interface CostVsGrantRow {
  spaceId: string;
  plan: PlanId;
  costUsd: number;
  budgetUsd: number;
  ratio: number;
}

/** Paid spaces whose spend in the window exceeds `multiplier ×` pro-rated grant. */
export function spacesOverBudget(
  rows: readonly SpaceCostRow[],
  windowDays: number,
  multiplier = DEFAULT_COST_ALARM_MULTIPLIER,
): CostVsGrantRow[] {
  const out: CostVsGrantRow[] = [];
  for (const row of rows) {
    if (!isGrantablePlan(row.plan)) continue;
    const budgetUsd = windowUsdBudgetForPlan(row.plan, windowDays);
    if (budgetUsd <= 0) continue;
    const ratio = row.costUsd / budgetUsd;
    if (ratio > multiplier) {
      out.push({
        spaceId: row.spaceId,
        plan: row.plan,
        costUsd: row.costUsd,
        budgetUsd,
        ratio,
      });
    }
  }
  return out.sort((a, b) => b.ratio - a.ratio);
}

/** All paid spaces with spend, for the admin table (includes under-budget). */
export function costVsGrantTable(
  rows: readonly SpaceCostRow[],
  windowDays: number,
): CostVsGrantRow[] {
  const out: CostVsGrantRow[] = [];
  for (const row of rows) {
    if (!isGrantablePlan(row.plan)) continue;
    const budgetUsd = windowUsdBudgetForPlan(row.plan, windowDays);
    out.push({
      spaceId: row.spaceId,
      plan: row.plan,
      costUsd: row.costUsd,
      budgetUsd,
      ratio: budgetUsd > 0 ? row.costUsd / budgetUsd : 0,
    });
  }
  return out.sort((a, b) => b.costUsd - a.costUsd);
}

export function planLabel(plan: PlanId): string {
  return PLANS[plan].label;
}
