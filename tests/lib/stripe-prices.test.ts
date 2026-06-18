/**
 * getStripe() startup validation (Fix #5, part 2).
 *
 * Every PAID plan tier must have its monthly Stripe price id configured —
 * otherwise a real customer's invoice webhook can't map the price back to a
 * plan and the credit grant is silently skipped. getStripe() validates this
 * once and logs CRITICAL if any priced tier is missing. We assert the loud log
 * fires when a price is absent and stays quiet when all are present.
 *
 * PLANS reads price ids from env at MODULE LOAD, so each case stubs env then
 * re-imports lib/stripe (which also re-reads its memo flags).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { loggerErrorMock } = vi.hoisted(() => ({ loggerErrorMock: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { error: loggerErrorMock, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

async function loadStripe() {
  vi.resetModules();
  return import('@/lib/stripe');
}

beforeEach(() => {
  loggerErrorMock.mockReset();
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_x');
});
afterEach(() => vi.unstubAllEnvs());

describe('getStripe price validation', () => {
  it('logs CRITICAL listing the tiers missing a monthly price id', async () => {
    // Only Solo wired; Pro/Team/Team Plus missing.
    vi.stubEnv('STRIPE_PRICE_SOLO', 'price_solo_m');
    vi.stubEnv('STRIPE_PRICE_PRO', '');
    vi.stubEnv('STRIPE_PRICE_TEAM', '');
    vi.stubEnv('STRIPE_PRICE_TEAM_PLUS', '');
    const { getStripe } = await loadStripe();
    getStripe();
    const critical = loggerErrorMock.mock.calls.find((c) => String(c[0]).includes('CRITICAL'));
    expect(critical).toBeTruthy();
    const ctx = critical![1] as { missingTiers: string[] };
    expect(ctx.missingTiers).toEqual(expect.arrayContaining(['pro', 'team', 'team_plus']));
    expect(ctx.missingTiers).not.toContain('solo');
  });

  it('stays quiet when every paid tier has a monthly price id', async () => {
    vi.stubEnv('STRIPE_PRICE_SOLO', 'price_solo_m');
    vi.stubEnv('STRIPE_PRICE_PRO', 'price_pro_m');
    vi.stubEnv('STRIPE_PRICE_TEAM', 'price_team_m');
    vi.stubEnv('STRIPE_PRICE_TEAM_PLUS', 'price_team_plus_m');
    const { getStripe } = await loadStripe();
    getStripe();
    const critical = loggerErrorMock.mock.calls.find((c) => String(c[0]).includes('CRITICAL'));
    expect(critical).toBeFalsy();
  });

  it('validates only once even across repeated getStripe() calls', async () => {
    vi.stubEnv('STRIPE_PRICE_SOLO', '');
    vi.stubEnv('STRIPE_PRICE_PRO', '');
    vi.stubEnv('STRIPE_PRICE_TEAM', '');
    vi.stubEnv('STRIPE_PRICE_TEAM_PLUS', '');
    const { getStripe } = await loadStripe();
    getStripe();
    getStripe();
    getStripe();
    const criticals = loggerErrorMock.mock.calls.filter((c) => String(c[0]).includes('CRITICAL'));
    expect(criticals).toHaveLength(1);
  });
});
