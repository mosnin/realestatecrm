import { describe, expect, it } from 'vitest';
import { monthlyPriceForPlan, mrrFromPlans } from '@/lib/billing/mrr';

describe('mrrFromPlans', () => {
  it('uses each plan list price, not a hardcoded Solo rate', () => {
    expect(monthlyPriceForPlan('solo')).toBe(97);
    expect(monthlyPriceForPlan('pro')).toBe(197);
    expect(monthlyPriceForPlan('team')).toBe(497);
    expect(
      mrrFromPlans([
        { plan: 'solo', status: 'active', current: true },
        { plan: 'pro', status: 'active', current: true },
      ]),
    ).toBe(294);
  });

  it('ignores trials, lapsed, and unknown plans', () => {
    expect(
      mrrFromPlans([
        { plan: 'solo', status: 'trialing', current: true },
        { plan: 'pro', status: 'active', current: false },
        { plan: 'mystery', status: 'active', current: true },
      ]),
    ).toBe(0);
  });
});
