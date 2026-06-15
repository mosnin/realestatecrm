/**
 * Tests for brokerage per-seat billing (Fix #1).
 *
 * Pre-fix, NO code updated the Stripe subscription quantity when a brokerage
 * member was added or removed — so seats past the included count were never
 * billed. These lock in the corrected behaviour:
 *
 *   - adding members past includedUsers updates the PER-UNIT add-on line item's
 *     quantity (NOT the flat base bundle, which always stays quantity 1);
 *   - removing members back to/below the included count removes the add-on line;
 *   - it's idempotent (same count → no Stripe write) and a safe no-op when the
 *     brokerage has no active subscription;
 *   - when the per-unit add-on PRICE is not configured (the flagged Stripe
 *     price-config dependency), the seat charge is skipped + a warning logged,
 *     and the flat base item is never multiplied by the seat count.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// lib/plans reads price ids at module load — set them before any import.
vi.hoisted(() => {
  process.env.STRIPE_PRICE_TEAM = 'price_team_m';
  process.env.STRIPE_PRICE_TEAM_PLUS = 'price_team_plus_m';
  process.env.STRIPE_PRICE_TEAM_ADDON = 'price_team_addon_m';
  process.env.STRIPE_PRICE_TEAM_PLUS_ADDON = 'price_team_plus_addon_m';
});

// ── Supabase double: a configurable Brokerage row + a member count. ─────
const { dbState } = vi.hoisted(() => ({
  dbState: {
    brokerage: null as Record<string, unknown> | null,
    memberCount: 0 as number | null,
  },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from(table: string) {
      if (table === 'Brokerage') {
        const b: any = {
          select: () => b,
          eq: () => b,
          maybeSingle: async () => ({ data: dbState.brokerage, error: null }),
        };
        return b;
      }
      // BrokerageMembership count query: select(...,{count,head}).eq(...)
      const m: any = {
        select: () => m,
        eq: () => Promise.resolve({ count: dbState.memberCount, error: dbState.memberCount === null ? new Error('boom') : null }),
      };
      return m;
    },
  },
}));

const { loggerWarnMock, loggerErrorMock } = vi.hoisted(() => ({
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: loggerWarnMock, error: loggerErrorMock, info: vi.fn(), debug: vi.fn() },
}));

// ── Stripe double ───────────────────────────────────────────────────────
const { stripeState, retrieveMock, updateMock } = vi.hoisted(() => ({
  stripeState: { subscription: null as unknown },
  retrieveMock: vi.fn(async () => stripeState.subscription),
  updateMock: vi.fn(async () => ({})),
}));
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    subscriptions: { retrieve: retrieveMock, update: updateMock },
  }),
}));

import { syncBrokerageSeatBilling } from '@/lib/billing/brokerage-seat-billing';

function subWith(items: Array<{ id?: string; priceId: string; quantity?: number }>): any {
  return {
    id: 'sub_b1',
    status: 'active',
    items: {
      data: items.map((it, i) => ({
        id: it.id ?? `si_${i}`,
        quantity: it.quantity ?? 1,
        price: { id: it.priceId },
      })),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbState.brokerage = {
    id: 'br1',
    plan: 'team',
    stripeSubscriptionId: 'sub_b1',
    stripeSubscriptionStatus: 'active',
  };
  dbState.memberCount = 5;
  stripeState.subscription = subWith([{ id: 'si_base', priceId: 'price_team_m', quantity: 1 }]);
});

describe('syncBrokerageSeatBilling — per-seat add-on quantity (Fix #1)', () => {
  it('adds a per-unit add-on item when members exceed includedUsers (team=5)', async () => {
    dbState.memberCount = 7; // 2 over the included 5
    const res = await syncBrokerageSeatBilling('br1');
    expect(res.status).toBe('updated');
    expect(res.addonQuantity).toBe(2);
    expect(updateMock).toHaveBeenCalledTimes(1);
    const [subId, params] = updateMock.mock.calls[0] as any[];
    expect(subId).toBe('sub_b1');
    // The ADD-ON price gets quantity 2 — the flat base item is NOT touched.
    expect(params.items).toEqual([{ price: 'price_team_addon_m', quantity: 2 }]);
    expect(params.proration_behavior).toBe('create_prorations');
  });

  it('updates the existing add-on item quantity when more members are added', async () => {
    stripeState.subscription = subWith([
      { id: 'si_base', priceId: 'price_team_m', quantity: 1 },
      { id: 'si_addon', priceId: 'price_team_addon_m', quantity: 2 },
    ]);
    dbState.memberCount = 9; // 4 over included
    const res = await syncBrokerageSeatBilling('br1');
    expect(res.status).toBe('updated');
    expect(updateMock).toHaveBeenCalledTimes(1);
    const [, params] = updateMock.mock.calls[0] as any[];
    expect(params.items).toEqual([{ id: 'si_addon', quantity: 4 }]);
  });

  it('removes the add-on item when members drop back to the included count', async () => {
    stripeState.subscription = subWith([
      { id: 'si_base', priceId: 'price_team_m', quantity: 1 },
      { id: 'si_addon', priceId: 'price_team_addon_m', quantity: 3 },
    ]);
    dbState.memberCount = 5; // back to included → no add-on seats
    const res = await syncBrokerageSeatBilling('br1');
    expect(res.status).toBe('updated');
    const [, params] = updateMock.mock.calls[0] as any[];
    expect(params.items).toEqual([{ id: 'si_addon', deleted: true }]);
  });

  it('is idempotent: same member count → no Stripe write', async () => {
    stripeState.subscription = subWith([
      { id: 'si_base', priceId: 'price_team_m', quantity: 1 },
      { id: 'si_addon', priceId: 'price_team_addon_m', quantity: 2 },
    ]);
    dbState.memberCount = 7; // exactly the current add-on quantity (2)
    const res = await syncBrokerageSeatBilling('br1');
    expect(res.status).toBe('noop');
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('never touches Stripe when the brokerage has no subscription', async () => {
    dbState.brokerage = { id: 'br1', plan: 'team', stripeSubscriptionId: null, stripeSubscriptionStatus: 'inactive' };
    dbState.memberCount = 12;
    const res = await syncBrokerageSeatBilling('br1');
    expect(res.status).toBe('skipped');
    expect(res.reason).toBe('no-subscription');
    expect(retrieveMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('FLAG: with no add-on price configured it skips the charge + warns (never multiplies the flat base)', async () => {
    // Drop the add-on price ids for this case only.
    vi.stubEnv('STRIPE_PRICE_TEAM_ADDON', '');
    vi.resetModules();
    const mod = await import('@/lib/billing/brokerage-seat-billing');
    dbState.memberCount = 8; // 3 over included
    const res = await mod.syncBrokerageSeatBilling('br1');
    expect(res.status).toBe('skipped');
    expect(res.reason).toBe('addon-price-not-configured');
    expect(updateMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
