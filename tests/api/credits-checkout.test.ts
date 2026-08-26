/**
 * Tests for the top-up checkout route — the server-side plan gate (Fix #7).
 *
 * Top-ups are paid-tier only. A Free funding account must be refused BEFORE a
 * Stripe session is created (otherwise a customer with no plan could be charged
 * for credits the product doesn't intend to sell pay-as-you-go). Paid tiers
 * proceed to a Stripe session.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// price ids set before lib/plans loads (see stripe-webhook.test for rationale).
vi.hoisted(() => {
  process.env.STRIPE_PRICE_TOPUP_STARTER = 'price_topup_starter';
});

const { requireSpaceOwnerMock } = vi.hoisted(() => ({ requireSpaceOwnerMock: vi.fn() }));
vi.mock('@/lib/api-auth', () => ({
  requireSpaceOwner: requireSpaceOwnerMock,
  requireSpaceAccountOwner: requireSpaceOwnerMock,
}));

const { checkRateLimitMock } = vi.hoisted(() => ({ checkRateLimitMock: vi.fn(async () => ({ allowed: true })) }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: checkRateLimitMock }));

const { resolveBillingAccountMock } = vi.hoisted(() => ({ resolveBillingAccountMock: vi.fn() }));
vi.mock('@/lib/billing/account', () => ({ resolveBillingAccount: resolveBillingAccountMock }));

const { sessionsCreateMock } = vi.hoisted(() => ({
  sessionsCreateMock: vi.fn(async () => ({ id: 'cs_1', url: 'https://stripe/checkout/cs_1' })),
}));
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({ checkout: { sessions: { create: sessionsCreateMock } } }),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { stripeCustomerId: 'cus_1' } }) }) }),
    }),
  },
}));

import { POST } from '@/app/api/billing/credits/checkout/route';

function req(body: unknown): NextRequest {
  return new NextRequest('https://example.com/api/billing/credits/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimitMock.mockResolvedValue({ allowed: true });
  sessionsCreateMock.mockResolvedValue({ id: 'cs_1', url: 'https://stripe/checkout/cs_1' });
  requireSpaceOwnerMock.mockResolvedValue({ userId: 'u1', space: { id: 'sp1', slug: 'acme' } });
});

describe('POST /api/billing/credits/checkout — plan gating (Fix #7)', () => {
  it('rejects a Free funding account with 400 and never creates a Stripe session', async () => {
    resolveBillingAccountMock.mockResolvedValue({ account: { type: 'space', id: 'sp1' }, plan: 'free' });
    const res = await POST(req({ slug: 'acme', topup: 'starter' }));
    expect(res.status).toBe(400);
    expect(sessionsCreateMock).not.toHaveBeenCalled();
    const body = await res.json();
    expect(String(body.error)).toMatch(/paid plan/i);
  });

  it('allows a paid (solo) funding account through to a Stripe session', async () => {
    resolveBillingAccountMock.mockResolvedValue({ account: { type: 'space', id: 'sp1' }, plan: 'solo' });
    const res = await POST(req({ slug: 'acme', topup: 'starter' }));
    expect(res.status).toBe(200);
    expect(sessionsCreateMock).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.url).toContain('stripe');
  });

  it('allows a Team funding account (brokerage pool) to buy top-ups', async () => {
    resolveBillingAccountMock.mockResolvedValue({ account: { type: 'brokerage', id: 'br1' }, plan: 'team' });
    const res = await POST(req({ slug: 'acme', topup: 'starter' }));
    expect(res.status).toBe(200);
    expect(sessionsCreateMock).toHaveBeenCalledTimes(1);
  });
});
