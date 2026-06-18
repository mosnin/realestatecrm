/**
 * Route-level tests for the platform-admin billing actions
 * (POST /api/admin/actions): the money-moving paths fixed in this branch.
 *
 *   comp_free_month (Fix #1) — pushes the subscription's trial_end to a REAL
 *     future date in Stripe (asserted call shape) and ONLY mirrors the
 *     far-future period to the DB when Stripe accepted it. A canceled sub with
 *     no live Stripe subscription is REFUSED (no fabricated DB period → the
 *     old surprise-rebill desync can't happen).
 *
 *   change_plan (Fix #2) — moves the Stripe subscription item's base price to
 *     the target plan's price (asserted), then mirrors plan + planActivatedAt
 *     (+ seatLimit for brokerages) in the DB with the webhook's mapping.
 *
 *   cancel_subscription (Fix #3) — immediate → stripe.subscriptions.cancel +
 *     DB downgrade now; end_of_period → update(cancel_at_period_end:true) and
 *     the plan is left for the webhook.
 *
 * Stripe (getStripe), Supabase, Clerk, rate-limit + audit are all mocked.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Stripe price ids must exist before lib/plans loads (module-load env read).
vi.hoisted(() => {
  process.env.STRIPE_PRICE_SOLO = 'price_solo_m';
  process.env.STRIPE_PRICE_PRO = 'price_pro_m';
  process.env.STRIPE_PRICE_PRO_ANNUAL = 'price_pro_y';
  process.env.STRIPE_PRICE_TEAM = 'price_team_m';
  process.env.STRIPE_PRICE_TEAM_PLUS = 'price_team_plus_m';
  process.env.CLERK_SECRET_KEY = 'sk_test_x';
});

// ── Auth / admin / rate-limit / audit ──────────────────────────────────────
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({ userId: 'admin_clerk' })),
  createClerkClient: () => ({ users: {}, sessions: {}, signInTokens: {} }),
}));
const { logAdminActionMock } = vi.hoisted(() => ({ logAdminActionMock: vi.fn(async () => undefined) }));
vi.mock('@/lib/admin', () => ({
  requireAdmin: vi.fn(async () => ({ userId: 'admin_clerk' })),
  logAdminAction: logAdminActionMock,
}));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true })) }));
vi.mock('@/lib/onboarding', () => ({ shouldBackfillOnboardFromSpace: () => false }));

// ── Supabase double — table-aware reads + recorded writes ───────────────────
const { dbState } = vi.hoisted(() => ({
  dbState: {
    // (table) -> row returned by maybeSingle()
    rows: {} as Record<string, Record<string, unknown> | null>,
    writes: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  },
}));

vi.mock('@/lib/supabase', () => {
  function chain(table: string): any {
    const c: any = {
      _payload: undefined as Record<string, unknown> | undefined,
      select: () => c,
      eq: () => c,
      update(payload: Record<string, unknown>) {
        c._payload = payload;
        dbState.writes.push({ table, payload });
        return c;
      },
      maybeSingle: async () => ({ data: dbState.rows[table] ?? null, error: null }),
    };
    return c;
  }
  return { supabase: { from: (t: string) => chain(t) } };
});

// ── Stripe double ───────────────────────────────────────────────────────────
const { stripeState, subUpdateMock, subCancelMock, subRetrieveMock } = vi.hoisted(() => ({
  stripeState: { subscription: null as unknown, updatedStatus: 'trialing' as string },
  subUpdateMock: vi.fn(async () => ({ status: 'trialing' })),
  subCancelMock: vi.fn(async () => ({ status: 'canceled' })),
  subRetrieveMock: vi.fn(async () => stripeState.subscription),
}));
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    subscriptions: { update: subUpdateMock, cancel: subCancelMock, retrieve: subRetrieveMock },
  }),
}));

import { POST } from '@/app/api/admin/actions/route';

function req(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/admin/actions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  dbState.rows = {};
  dbState.writes = [];
  subUpdateMock.mockResolvedValue({ status: 'trialing' } as any);
  subCancelMock.mockResolvedValue({ status: 'canceled' } as any);
});

describe('comp_free_month (Fix #1) — real Stripe trial_end, DB mirrors only on success', () => {
  it('pushes trial_end to a future unix ts on a past_due sub and mirrors the DB', async () => {
    dbState.rows['Space'] = { id: 'sp1', stripeSubscriptionStatus: 'past_due', stripeSubscriptionId: 'sub_1' };
    const before = Math.floor(Date.now() / 1000);
    const res = await POST(req({ action: 'comp_free_month', userId: 'u1', days: 30 }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);

    // Stripe was called with trial_end ~30 days out + no proration.
    expect(subUpdateMock).toHaveBeenCalledTimes(1);
    const [subId, params] = subUpdateMock.mock.calls[0] as any[];
    expect(subId).toBe('sub_1');
    expect(params.proration_behavior).toBe('none');
    expect(params.trial_end).toBeGreaterThanOrEqual(before + 29 * 86400);
    expect(params.trial_end).toBeLessThanOrEqual(before + 31 * 86400);

    // DB mirrored the period (Stripe accepted) — status trialing, period set.
    const spaceWrite = dbState.writes.find((w) => w.table === 'Space');
    expect(spaceWrite).toBeTruthy();
    expect(spaceWrite!.payload.stripeSubscriptionStatus).toBe('trialing');
    expect(typeof spaceWrite!.payload.stripePeriodEnd).toBe('string');
  });

  it('supports a 1-year comp (days: 365)', async () => {
    dbState.rows['Space'] = { id: 'sp1', stripeSubscriptionStatus: 'past_due', stripeSubscriptionId: 'sub_1' };
    const before = Math.floor(Date.now() / 1000);
    await POST(req({ action: 'comp_free_month', userId: 'u1', days: 365 }));
    const [, params] = subUpdateMock.mock.calls[0] as any[];
    expect(params.trial_end).toBeGreaterThanOrEqual(before + 364 * 86400);
  });

  it('REFUSES a canceled sub with no live Stripe subscription (no fabricated DB period)', async () => {
    dbState.rows['Space'] = { id: 'sp1', stripeSubscriptionStatus: 'canceled', stripeSubscriptionId: null };
    const res = await POST(req({ action: 'comp_free_month', userId: 'u1', days: 30 }));
    expect(res.status).toBe(400);
    // Neither Stripe nor the DB period was touched — this is the desync fix.
    expect(subUpdateMock).not.toHaveBeenCalled();
    expect(dbState.writes.some((w) => w.table === 'Space')).toBe(false);
  });

  it('does NOT write the DB period when the Stripe call fails (502)', async () => {
    dbState.rows['Space'] = { id: 'sp1', stripeSubscriptionStatus: 'unpaid', stripeSubscriptionId: 'sub_1' };
    subUpdateMock.mockRejectedValueOnce(new Error('stripe boom'));
    const res = await POST(req({ action: 'comp_free_month', userId: 'u1', days: 30 }));
    expect(res.status).toBe(502);
    expect(dbState.writes.some((w) => w.table === 'Space')).toBe(false);
  });
});

describe('change_plan (Fix #2) — moves the Stripe item price, mirrors the DB', () => {
  it('space solo → pro: swaps the base item price + mirrors plan/planActivatedAt', async () => {
    dbState.rows['Space'] = { id: 'sp1', plan: 'solo', stripeSubscriptionId: 'sub_1', stripeSubscriptionStatus: 'active' };
    stripeState.subscription = {
      id: 'sub_1',
      items: { data: [{ id: 'si_base', price: { id: 'price_solo_m' } }] },
    };
    const res = await POST(req({ action: 'change_plan', accountType: 'space', accountId: 'sp1', plan: 'pro' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.toPlan).toBe('pro');

    // Stripe update swapped ONLY the base item to the pro price.
    expect(subUpdateMock).toHaveBeenCalledTimes(1);
    const [subId, params] = subUpdateMock.mock.calls[0] as any[];
    expect(subId).toBe('sub_1');
    expect(params.items).toEqual([{ id: 'si_base', price: 'price_pro_m' }]);
    expect(params.proration_behavior).toBe('create_prorations');

    // DB mirrored: plan pro + planActivatedAt set.
    const w = dbState.writes.find((x) => x.table === 'Space');
    expect(w!.payload.plan).toBe('pro');
    expect(typeof w!.payload.planActivatedAt).toBe('string');
  });

  it('brokerage team → team_plus: mirrors plan + seatLimit (10)', async () => {
    dbState.rows['Brokerage'] = { id: 'br1', plan: 'team', stripeSubscriptionId: 'sub_b', stripeSubscriptionStatus: 'active' };
    stripeState.subscription = {
      id: 'sub_b',
      items: { data: [{ id: 'si_base', price: { id: 'price_team_m' } }] },
    };
    const res = await POST(req({ action: 'change_plan', accountType: 'brokerage', accountId: 'br1', plan: 'team_plus' }));
    expect(res.status).toBe(200);
    const [, params] = subUpdateMock.mock.calls[0] as any[];
    expect(params.items).toEqual([{ id: 'si_base', price: 'price_team_plus_m' }]);
    const w = dbState.writes.find((x) => x.table === 'Brokerage');
    expect(w!.payload.plan).toBe('team_plus');
    expect(w!.payload.seatLimit).toBe(10);
  });

  it('rejects an invalid plan for the account kind', async () => {
    const res = await POST(req({ action: 'change_plan', accountType: 'space', accountId: 'sp1', plan: 'team' }));
    expect(res.status).toBe(400);
    expect(subUpdateMock).not.toHaveBeenCalled();
  });

  it('400s when there is no subscription to move', async () => {
    dbState.rows['Space'] = { id: 'sp1', plan: 'solo', stripeSubscriptionId: null, stripeSubscriptionStatus: 'inactive' };
    const res = await POST(req({ action: 'change_plan', accountType: 'space', accountId: 'sp1', plan: 'pro' }));
    expect(res.status).toBe(400);
  });

  it('400s when the subscription is already on the target plan', async () => {
    dbState.rows['Space'] = { id: 'sp1', plan: 'pro', stripeSubscriptionId: 'sub_1', stripeSubscriptionStatus: 'active' };
    stripeState.subscription = { id: 'sub_1', items: { data: [{ id: 'si_base', price: { id: 'price_pro_m' } }] } };
    const res = await POST(req({ action: 'change_plan', accountType: 'space', accountId: 'sp1', plan: 'pro' }));
    expect(res.status).toBe(400);
    expect(subUpdateMock).not.toHaveBeenCalled();
  });
});

describe('cancel_subscription (Fix #3)', () => {
  it('immediate: cancels in Stripe + downgrades plan now', async () => {
    dbState.rows['Space'] = { id: 'sp1', stripeSubscriptionId: 'sub_1' };
    const res = await POST(req({ action: 'cancel_subscription', accountType: 'space', accountId: 'sp1', mode: 'immediate' }));
    expect(res.status).toBe(200);
    expect(subCancelMock).toHaveBeenCalledWith('sub_1');
    const w = dbState.writes.find((x) => x.table === 'Space');
    expect(w!.payload.stripeSubscriptionStatus).toBe('canceled');
    expect(w!.payload.plan).toBe('free');
  });

  it('end_of_period: sets cancel_at_period_end + does NOT downgrade plan yet', async () => {
    dbState.rows['Space'] = { id: 'sp1', stripeSubscriptionId: 'sub_1' };
    const res = await POST(req({ action: 'cancel_subscription', accountType: 'space', accountId: 'sp1', mode: 'end_of_period' }));
    expect(res.status).toBe(200);
    expect(subUpdateMock).toHaveBeenCalledWith('sub_1', { cancel_at_period_end: true });
    // No plan downgrade write for end-of-period.
    expect(dbState.writes.some((x) => x.table === 'Space')).toBe(false);
  });

  it('brokerage immediate downgrades to starter (not free)', async () => {
    dbState.rows['Brokerage'] = { id: 'br1', stripeSubscriptionId: 'sub_b' };
    const res = await POST(req({ action: 'cancel_subscription', accountType: 'brokerage', accountId: 'br1', mode: 'immediate' }));
    expect(res.status).toBe(200);
    const w = dbState.writes.find((x) => x.table === 'Brokerage');
    expect(w!.payload.plan).toBe('starter');
  });
});

describe('update_subscription hardening (Fix #4)', () => {
  it('rejects the removed `active` status', async () => {
    dbState.rows['Space'] = { id: 'sp1', stripeSubscriptionId: 'sub_1' };
    const res = await POST(req({ action: 'update_subscription', userId: 'u1', status: 'active' }));
    expect(res.status).toBe(400);
  });

  it('rejects a DB-only status without override:true', async () => {
    dbState.rows['Space'] = { id: 'sp1', stripeSubscriptionId: 'sub_1' };
    const res = await POST(req({ action: 'update_subscription', userId: 'u1', status: 'past_due' }));
    expect(res.status).toBe(400);
    expect(subUpdateMock).not.toHaveBeenCalled();
  });

  it('allows a DB-only override with override:true (no Stripe op)', async () => {
    dbState.rows['Space'] = { id: 'sp1', stripeSubscriptionId: 'sub_1' };
    const res = await POST(req({ action: 'update_subscription', userId: 'u1', status: 'past_due', override: true }));
    expect(res.status).toBe(200);
    expect(subUpdateMock).not.toHaveBeenCalled();
    const w = dbState.writes.find((x) => x.table === 'Space');
    expect(w!.payload.stripeSubscriptionStatus).toBe('past_due');
  });

  it('canceled maps to a real Stripe cancel', async () => {
    dbState.rows['Space'] = { id: 'sp1', stripeSubscriptionId: 'sub_1' };
    const res = await POST(req({ action: 'update_subscription', userId: 'u1', status: 'canceled' }));
    expect(res.status).toBe(200);
    expect(subCancelMock).toHaveBeenCalledWith('sub_1');
  });
});
