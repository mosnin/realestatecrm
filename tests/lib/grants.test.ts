import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the credit-lot writer so we can assert how the grant helpers call it —
// specifically that they forward the Stripe `sourceId` that makes a retried
// webhook idempotent at the DB level. Dropping that arg is a silent money bug.
const { grantCreditsMock } = vi.hoisted(() => ({
  grantCreditsMock: vi.fn(async (..._args: unknown[]) => {}),
}));
vi.mock('@/lib/billing/credits', () => ({
  grantCredits: grantCreditsMock,
}));

import { monthlyGrantAmount, grantPlanMonthly, grantTopup } from '@/lib/billing/grants';
import { TOPUPS } from '@/lib/plans';

describe('monthlyGrantAmount', () => {
  it('returns the plan base credits', () => {
    expect(monthlyGrantAmount('free')).toBe(0);
    expect(monthlyGrantAmount('solo')).toBe(3000);
    expect(monthlyGrantAmount('pro')).toBe(8000);
    expect(monthlyGrantAmount('team')).toBe(24000);
    expect(monthlyGrantAmount('team_plus')).toBe(50000);
  });

  it('adds per-user add-on credits for team tiers', () => {
    expect(monthlyGrantAmount('team', 2)).toBe(24000 + 2 * 3000);
    expect(monthlyGrantAmount('team_plus', 3)).toBe(50000 + 3 * 4000);
  });

  it('ignores add-on users on plans without an add-on path', () => {
    expect(monthlyGrantAmount('solo', 5)).toBe(3000);
    expect(monthlyGrantAmount('free', 5)).toBe(0);
  });
});

describe('grant idempotency — sourceId threading', () => {
  const acct = { type: 'space' as const, id: 'sp1' };
  beforeEach(() => grantCreditsMock.mockClear());

  it('grantPlanMonthly forwards the invoice id as sourceId to grantCredits', async () => {
    await grantPlanMonthly(acct, 'solo', 'inv_123');
    expect(grantCreditsMock).toHaveBeenCalledWith(
      acct, 3000, 'monthly_grant', expect.any(Date), 'inv_123',
    );
  });

  it('grantTopup forwards the checkout-session id as sourceId', async () => {
    await grantTopup(acct, 'starter', 'cs_abc');
    expect(grantCreditsMock).toHaveBeenCalledWith(
      acct, TOPUPS.starter.credits, 'topup', expect.any(Date), 'cs_abc',
    );
  });

  it('does not grant (or call the writer) for a non-grantable plan', async () => {
    await grantPlanMonthly(acct, 'free', 'inv_x');
    expect(grantCreditsMock).not.toHaveBeenCalled();
  });
});
