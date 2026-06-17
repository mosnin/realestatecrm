import { describe, it, expect, vi, afterEach } from 'vitest';

// PLANS reads price ids from env at module load, so stub them and re-import.
afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe('planIdForStripePrice', () => {
  it('maps a live Stripe price id back to its plan (monthly + annual)', async () => {
    vi.stubEnv('STRIPE_PRICE_SOLO', 'price_solo_m');
    vi.stubEnv('STRIPE_PRICE_SOLO_ANNUAL', 'price_solo_y');
    vi.stubEnv('STRIPE_PRICE_PRO', 'price_pro_m');
    vi.stubEnv('STRIPE_PRICE_TEAM', 'price_team_m');
    const { planIdForStripePrice } = await import('@/lib/plans');
    expect(planIdForStripePrice('price_solo_m')).toBe('solo');
    expect(planIdForStripePrice('price_solo_y')).toBe('solo'); // annual maps too
    expect(planIdForStripePrice('price_pro_m')).toBe('pro');
    expect(planIdForStripePrice('price_team_m')).toBe('team');
  });

  it('returns null for an unknown id or when price ids are unset (caller falls back)', async () => {
    const { planIdForStripePrice } = await import('@/lib/plans');
    expect(planIdForStripePrice('price_nope')).toBeNull();
    expect(planIdForStripePrice(null)).toBeNull();
    expect(planIdForStripePrice(undefined)).toBeNull();
  });
});

describe('planFromPriceId (cadence-aware, used by the webhook reconcile)', () => {
  it('maps a base price id to its plan AND billing cadence', async () => {
    vi.stubEnv('STRIPE_PRICE_SOLO', 'price_solo_m');
    vi.stubEnv('STRIPE_PRICE_SOLO_ANNUAL', 'price_solo_y');
    vi.stubEnv('STRIPE_PRICE_TEAM', 'price_team_m');
    vi.stubEnv('STRIPE_PRICE_TEAM_PLUS_ANNUAL', 'price_tp_y');
    const { planFromPriceId } = await import('@/lib/plans');
    expect(planFromPriceId('price_solo_m')).toEqual({ plan: 'solo', cadence: 'monthly' });
    expect(planFromPriceId('price_solo_y')).toEqual({ plan: 'solo', cadence: 'annual' });
    expect(planFromPriceId('price_team_m')).toEqual({ plan: 'team', cadence: 'monthly' });
    expect(planFromPriceId('price_tp_y')).toEqual({ plan: 'team_plus', cadence: 'annual' });
  });

  it('returns null for the per-seat ADD-ON prices, so the webhook resolves the base item not the add-on', async () => {
    vi.stubEnv('STRIPE_PRICE_TEAM', 'price_team_m');
    vi.stubEnv('STRIPE_PRICE_TEAM_ADDON', 'price_team_addon_m');
    vi.stubEnv('STRIPE_PRICE_TEAM_ADDON_ANNUAL', 'price_team_addon_y');
    const { planFromPriceId } = await import('@/lib/plans');
    // Base resolves; the add-on (configured here) must still map to null — it's
    // not a tier, and scanning a brokerage sub's items must skip it.
    expect(planFromPriceId('price_team_m')).toEqual({ plan: 'team', cadence: 'monthly' });
    expect(planFromPriceId('price_team_addon_m')).toBeNull();
    expect(planFromPriceId('price_team_addon_y')).toBeNull();
  });

  it('returns null for unknown/empty ids and never matches an unconfigured (null) price', async () => {
    // No price envs stubbed → every PLANS price id is null; a null priceId arg
    // must NOT match a null env price (the guard the webhook relies on).
    const { planFromPriceId } = await import('@/lib/plans');
    expect(planFromPriceId('price_whatever')).toBeNull();
    expect(planFromPriceId(null)).toBeNull();
    expect(planFromPriceId(undefined)).toBeNull();
    expect(planFromPriceId('')).toBeNull();
  });
});

describe('canBuyTopups', () => {
  it('allows every paid tier', async () => {
    const { canBuyTopups } = await import('@/lib/plans');
    for (const p of ['solo', 'pro', 'team', 'team_plus']) {
      expect(canBuyTopups(p)).toBe(true);
    }
  });

  it('blocks Free and any unknown/empty plan (no paid relationship)', async () => {
    const { canBuyTopups } = await import('@/lib/plans');
    for (const p of ['free', '', null, undefined, 'starter', 'enterprise', 'bogus']) {
      expect(canBuyTopups(p)).toBe(false);
    }
  });
});

describe('resolveSelfServePlan', () => {
  it('keeps an explicit pro selection', async () => {
    const { resolveSelfServePlan } = await import('@/lib/plans');
    expect(resolveSelfServePlan('pro')).toBe('pro');
  });

  it('resolves solo for the explicit solo value', async () => {
    const { resolveSelfServePlan } = await import('@/lib/plans');
    expect(resolveSelfServePlan('solo')).toBe('solo');
  });

  it('defaults to solo for anything that is not pro (the historical default)', async () => {
    const { resolveSelfServePlan } = await import('@/lib/plans');
    // Missing / unknown / non-self-serve hints all fall back to solo so a lost
    // selection never charges the wrong (higher) tier or a brokerage tier.
    for (const v of [undefined, null, '', 'free', 'team', 'team_plus', 'PRO', 'enterprise', 42, {}]) {
      expect(resolveSelfServePlan(v)).toBe('solo');
    }
  });
});
