/**
 * Tests for brokerage checkout per-seat seeding (Fix #1).
 *
 * Pre-fix, the brokerage checkout ALWAYS sent line_items: [{ price, quantity:1 }]
 * with no per-seat line, so a brokerage that already had agents past the plan's
 * included seats was undercharged on its first invoice. These lock in:
 *   - a SECOND per-unit add-on line item is added when members > includedUsers,
 *     with quantity = members − includedUsers (the flat base stays quantity 1);
 *   - exactly one base line (quantity 1) when members are within the included
 *     count.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.hoisted(() => {
  process.env.STRIPE_PRICE_TEAM = 'price_team_m';
  process.env.STRIPE_PRICE_TEAM_PLUS = 'price_team_plus_m';
  process.env.STRIPE_PRICE_TEAM_ADDON = 'price_team_addon_m';
  process.env.STRIPE_PRICE_TEAM_PLUS_ADDON = 'price_team_plus_addon_m';
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
  // pickSpacePriceId unused in the brokerage path, but the route imports it.
  pickSpacePriceId: () => null,
}));

// Supabase double: Brokerage row read returns a customer; the
// BrokerageMembership count query resolves to dbState.memberCount.
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
      // BrokerageMembership: select(...,{count,head}).eq(...) -> resolves count.
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

describe('POST /api/billing/checkout (brokerage) — per-seat seeding (Fix #1)', () => {
  it('adds a per-unit add-on line when members exceed the included count', async () => {
    dbState.memberCount = 8; // team includes 5 → 3 add-on seats
    const res = await POST(req({ scope: 'brokerage', plan: 'team' }));
    expect(res.status).toBe(200);
    expect(sessionsCreateMock).toHaveBeenCalledTimes(1);
    const params = sessionsCreateMock.mock.calls[0]![0] as any;
    expect(params.line_items).toEqual([
      { price: 'price_team_m', quantity: 1 },
      { price: 'price_team_addon_m', quantity: 3 },
    ]);
  });

  it('sends only the flat base line (quantity 1) when within the included seats', async () => {
    dbState.memberCount = 4; // within team's 5
    const res = await POST(req({ scope: 'brokerage', plan: 'team' }));
    expect(res.status).toBe(200);
    const params = sessionsCreateMock.mock.calls[0]![0] as any;
    expect(params.line_items).toEqual([{ price: 'price_team_m', quantity: 1 }]);
  });
});
