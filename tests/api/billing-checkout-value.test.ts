/**
 * GET /api/billing/checkout-value — the success-page Purchase pixel lookup.
 *
 * Must stay authenticated, refuse garbage session ids without calling Stripe,
 * and fail open to { value: null } so a Stripe outage cannot 500 the billing
 * success page or leak a raw error.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const { requireAuth, retrieve } = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  retrieve: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({ requireAuth }));
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({ checkout: { sessions: { retrieve } } }),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { GET } from '@/app/api/billing/checkout-value/route';

function req(sessionId?: string) {
  const url = sessionId
    ? `http://localhost/api/billing/checkout-value?session_id=${sessionId}`
    : 'http://localhost/api/billing/checkout-value';
  return new NextRequest(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAuth.mockResolvedValue({ userId: 'clerk_1' });
});

describe('GET /api/billing/checkout-value', () => {
  it('requires auth and never talks to Stripe when unauthenticated', async () => {
    requireAuth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await GET(req('cs_live_abc'));
    expect(res.status).toBe(401);
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('returns a null value for missing or malformed session ids', async () => {
    const missing = await GET(req());
    expect(missing.status).toBe(200);
    expect(await missing.json()).toEqual({ value: null, currency: null });

    const garbage = await GET(req('not-a-session'));
    expect(garbage.status).toBe(200);
    expect(await garbage.json()).toEqual({ value: null, currency: null });
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('converts Stripe cents to a major-unit value and surfaces the plan', async () => {
    retrieve.mockResolvedValue({
      amount_total: 9700,
      currency: 'usd',
      metadata: { plan: 'solo' },
    });
    const res = await GET(req('cs_test_abcDEF123'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ value: 97, currency: 'USD', plan: 'solo' });
    expect(retrieve).toHaveBeenCalledWith('cs_test_abcDEF123');
  });

  it('stays 200 with a null value when Stripe lookup fails', async () => {
    retrieve.mockRejectedValue(new Error('stripe down'));
    const res = await GET(req('cs_test_abcDEF123'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ value: null, currency: null });
  });
});
