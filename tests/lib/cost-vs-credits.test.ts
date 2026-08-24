import { describe, expect, it } from 'vitest';
import {
  costVsGrantTable,
  monthlyUsdBudgetForPlan,
  spacesOverBudget,
  windowUsdBudgetForPlan,
} from '@/lib/billing/cost-vs-credits';
import { CREDIT_COGS_BUDGET_USD } from '@/lib/plans';

describe('cost vs credit-grant budget', () => {
  it('pro-rates the monthly grant across the rollover window', () => {
    expect(monthlyUsdBudgetForPlan('solo')).toBeCloseTo(3000 * CREDIT_COGS_BUDGET_USD);
    expect(windowUsdBudgetForPlan('solo', 30)).toBeCloseTo(monthlyUsdBudgetForPlan('solo'));
    expect(windowUsdBudgetForPlan('solo', 1)).toBeCloseTo(monthlyUsdBudgetForPlan('solo') / 30);
  });

  it('flags only paid spaces whose spend exceeds N× the window budget', () => {
    const dailySolo = windowUsdBudgetForPlan('solo', 1);
    const hits = spacesOverBudget(
      [
        { spaceId: 's-ok', plan: 'solo', costUsd: dailySolo },
        { spaceId: 's-hot', plan: 'solo', costUsd: dailySolo * 3.1 },
        { spaceId: 's-free', plan: 'free', costUsd: 50 },
        { spaceId: 's-unknown', plan: null, costUsd: 50 },
      ],
      1,
      3,
    );
    expect(hits.map((h) => h.spaceId)).toEqual(['s-hot']);
    expect(hits[0]?.ratio).toBeGreaterThan(3);
  });

  it('lists every paid space for the admin table', () => {
    const rows = costVsGrantTable(
      [
        { spaceId: 's1', plan: 'pro', costUsd: 1 },
        { spaceId: 's2', plan: 'free', costUsd: 9 },
      ],
      7,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.spaceId).toBe('s1');
    expect(rows[0]?.plan).toBe('pro');
  });
});
