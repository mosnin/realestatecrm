/**
 * Tests for brokerage checkout billing cadence (monthly vs annual).
 *
 * Money-critical: choosing 'annual' MUST charge the annual Stripe price ids
 * (base AND the per-seat add-on) — never silently fall back to monthly. And if
 * the required annual price isn't configured, checkout MUST refuse (409
 * annual-not-available) rather than charge monthly under an "annual" label.
 *
 * These lock in:
 *   - cadence:'annual' selects stripePriceAnnual for base + add-on line items;
 *   - cadence:'monthly' (and an absent cadence) selects the monthly ids;
 *   - cadence:'annual' with the annual price unset → 409, no Stripe session.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Team has full monthly + annual prices (base + add-on). Team Plus has ONLY
// monthly (no annual) so we can assert the annual-not-available refusal.
vi.hoisted(() => {
  process.env.STRIPE_PRICE_TEAM = 'price_team_m';
  process.env.STRIPE_PRICE_TEAM_ANNUAL = 'price_team_a';
  process.env.STRIPE_PRICE_TEAM_ADDON = 'price_team_addon_m';
  process.env.STRIPE_PRICE_TEAM_ADDON_ANNUAL = 'price_team_addon_a';
  process.env.STRIPE_PRICE_TEAM_PLUS = 'price_team_plus_m';
  // intentionally NO STRIPE_PRICE_TEAM_PLUS_ANNUAL / _ADDON_ANNUAL
});

const { getBrokerContextMock } = vi.hoisted(() => ({ getBrokerContextMock: vi.fn() }));
vi.mock('@/lib/permissions', () => ({ getBrokerContext: getBrokerContextMock }));

const { checkRateLimitMock } = vi.hoisted(() => ({
  checkRateLimitMock: vi.fn(async () => ({ allowed: true })),
}));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: checkRateLimitMock }));

const { sessionsCreateMock } = vi.hoisted(() => ({
  sessionsCreateMock: vi.fn(async (_params: Record<string, unknown>) => ({
    id: 'cs_b',
    url: 'https://stripe/checkout/cs_b',
  })),
}));
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({ checkout: { sessions: { create: sessionsCreateMock } } }),
  pickSpacePriceId: () => null,
}));

const { dbState } = vi.hoisted(() => ({ dbState: { memberCount: 1 } }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from(table: string) {
      if (table === 'Brokerage') {
        const b: any = {
          select: () => b,
          eq: () => b,
          single: async () => ({
            data: {
              id: 'br1',
              name: 'Acme',
              ownerId: 'u1',
              stripeCustomerId: 'cus_b',
              stripeSubscriptionId: null,
              stripeSubscriptionStatus: 'inactive',
            },
            error: null,
          }),
        };
        return b;
      }
      const m: any = {
        select: () => m,
        eq: () => Promise.resolve({ count: dbState.memberCount, error: null }),
      };
      return m;
    },
  },
}));

import { POST } from '@/app/api/billing/checkout/route';

function req(body: unknown): NextRequest {
  return new NextRequest('https://example.com/api/billing/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimitMock.mockResolvedValue({ allowed: true });
  sessionsCreateMock.mockResolvedValue({ id: 'cs_b', url: 'https://stripe/checkout/cs_b' });
  getBrokerContextMock.mockResolvedValue({
    brokerage: { id: 'br1', name: 'Acme' },
    membership: { role: 'broker_owner' },
    dbUserId: 'u1',
  });
  dbState.memberCount = 1;
});

describe('POST /api/billing/checkout (brokerage) — billing cadence', () => {
  it('annual selects the annual base AND annual add-on price ids', async () => {
    dbState.memberCount = 8; // team includes 5 → 3 add-on seats
    const res = await POST(req({ scope: 'brokerage', plan: 'team', cadence: 'annual' }));
    expect(res.status).toBe(200);
    const params = sessionsCreateMock.mock.calls[0]![0] as any;
    expect(params.line_items).toEqual([
      { price: 'price_team_a', quantity: 1 },
      { price: 'price_team_addon_a', quantity: 3 },
    ]);
    expect(params.metadata.cadence).toBe('annual');
  });

  it('monthly (explicit) selects the monthly price ids', async () => {
    dbState.memberCount = 8;
    const res = await POST(req({ scope: 'brokerage', plan: 'team', cadence: 'monthly' }));
    expect(res.status).toBe(200);
    const params = sessionsCreateMock.mock.calls[0]![0] as any;
    expect(params.line_items).toEqual([
      { price: 'price_team_m', quantity: 1 },
      { price: 'price_team_addon_m', quantity: 3 },
    ]);
    expect(params.metadata.cadence).toBe('monthly');
  });

  it('an absent cadence defaults to monthly', async () => {
    const res = await POST(req({ scope: 'brokerage', plan: 'team' }));
    expect(res.status).toBe(200);
    const params = sessionsCreateMock.mock.calls[0]![0] as any;
    expect(params.line_items[0]).toEqual({ price: 'price_team_m', quantity: 1 });
    expect(params.metadata.cadence).toBe('monthly');
  });

  it('refuses annual with 409 and NO Stripe session when the annual price is unset', async () => {
    // team_plus has no annual price configured in this env.
    const res = await POST(req({ scope: 'brokerage', plan: 'team_plus', cadence: 'annual' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('annual-not-available');
    expect(sessionsCreateMock).not.toHaveBeenCalled();
  });

  it('still allows team_plus MONTHLY (annual-only gap must not block monthly)', async () => {
    const res = await POST(req({ scope: 'brokerage', plan: 'team_plus', cadence: 'monthly' }));
    expect(res.status).toBe(200);
    const params = sessionsCreateMock.mock.calls[0]![0] as any;
    expect(params.line_items[0]).toEqual({ price: 'price_team_plus_m', quantity: 1 });
  });
});
