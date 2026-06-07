import { describe, it, expect } from 'vitest';
import { monthlyGrantAmount } from '@/lib/billing/grants';

describe('monthlyGrantAmount', () => {
  it('returns the plan base credits', () => {
    expect(monthlyGrantAmount('free')).toBe(0);
    expect(monthlyGrantAmount('solo')).toBe(1500);
    expect(monthlyGrantAmount('pro')).toBe(4000);
    expect(monthlyGrantAmount('team')).toBe(12000);
    expect(monthlyGrantAmount('team_plus')).toBe(25000);
  });

  it('adds per-user add-on credits for team tiers', () => {
    expect(monthlyGrantAmount('team', 2)).toBe(12000 + 2 * 1500);
    expect(monthlyGrantAmount('team_plus', 3)).toBe(25000 + 3 * 2000);
  });

  it('ignores add-on users on plans without an add-on path', () => {
    expect(monthlyGrantAmount('solo', 5)).toBe(1500);
    expect(monthlyGrantAmount('free', 5)).toBe(0);
  });
});
