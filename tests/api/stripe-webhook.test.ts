/**
 * Lifecycle test for `POST /api/webhooks/stripe`.
 *
 * The money paths that matter and were previously untested at the route level:
 *   - a renewal invoice (`subscription_cycle`) grants the monthly credits ONCE;
 *   - a retried identical event does NOT double-grant (Redis fast-path dedupe,
 *     backed by DB-level sourceId idempotency);
 *   - a proration / mid-cycle invoice (`subscription_update`) does NOT grant;
 *   - `checkout.session.completed` whose session customer doesn't match the
 *     target account's stored customer is rejected (metadata-poisoning guard);
 *   - `customer.subscription.deleted` for a brokerage whose customer doesn't
 *     match is rejected (poisoning guard) — no cancel write.
 *
 * We mock the Stripe SDK (constructEvent + subscriptions.retrieve), Supabase,
 * Redis, and the grant helpers (grants.test.ts already proves the grant helpers
 * forward sourceId; here we assert the ROUTE calls them — or doesn't). The same
 * vi.hoisted + vi.mock pattern as tests/lib/grants.test.ts / dead-letter.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Stripe SDK ──────────────────────────────────────────────────────────────
// constructEvent returns whatever the test stuffs into `eventBox.event`;
// subscriptions.retrieve returns `subBox.sub`. Both are per-test overridable.
const { constructEventMock, retrieveMock, eventBox, subBox } = vi.hoisted(() => ({
  constructEventMock: vi.fn(),
  retrieveMock: vi.fn(),
  eventBox: { event: undefined as unknown },
  subBox: { sub: undefined as unknown },
}));
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    webhooks: { constructEvent: constructEventMock },
    subscriptions: { retrieve: retrieveMock },
  }),
}));

// ── Supabase ──────────────────────────────────────────────────────────────
// A chainable mock. `.select().eq().maybeSingle()` resolves to a row keyed by
// table name (selectBox). `.update().eq()` is awaitable and records the table +
// payload it was asked to write (updateCalls) so a test can assert a write
// happened — or, for the poisoning cases, that it did NOT.
const { selectBox, updateCalls, fromMock } = vi.hoisted(() => {
  const selectBox: Record<string, unknown> = {};
  const updateCalls: Array<{ table: string; data: Record<string, unknown> }> = [];
  const fromMock = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {};
    let pendingUpdate: Record<string, unknown> | null = null;
    for (const m of ['select', 'eq']) chain[m] = vi.fn(() => chain);
    chain.update = vi.fn((data: Record<string, unknown>) => {
      pendingUpdate = data;
      // .update(...).eq(...) — the terminal eq resolves the write. Supports the
      // double-.eq() legacy match path too by returning a thenable chain.
      const writeChain: Record<string, unknown> = {};
      writeChain.eq = vi.fn(() => {
        updateCalls.push({ table, data: pendingUpdate as Record<string, unknown> });
        const thenable = Promise.resolve({ error: null }) as unknown as Record<string, unknown>;
        // allow a second .eq() (customer-bound updates) to chain off the first.
        (thenable as { eq?: unknown }).eq = vi.fn(() => Promise.resolve({ error: null }));
        return thenable;
      });
      return writeChain;
    });
    chain.maybeSingle = vi.fn(() =>
      Promise.resolve({ data: (selectBox[table] as unknown) ?? null }),
    );
    return chain;
  });
  return { selectBox, updateCalls, fromMock };
});
vi.mock('@/lib/supabase', () => ({ supabase: { from: fromMock } }));

// ── Redis (event-id dedupe) ──────────────────────────────────────────────
// redisStore models the persisted set: get returns '1' for a key already
// processed, set records it. A test simulates a Stripe retry by replaying the
// SAME event id after the first call set the key.
const { redisStore, redisGetMock, redisSetMock } = vi.hoisted(() => {
  const redisStore = new Map<string, string>();
  return {
    redisStore,
    redisGetMock: vi.fn(async (k: string) => redisStore.get(k) ?? null),
    redisSetMock: vi.fn(async (k: string, v: string) => {
      redisStore.set(k, v);
      return 'OK';
    }),
  };
});
vi.mock('@/lib/redis', () => ({ redis: { get: redisGetMock, set: redisSetMock } }));

// ── Grant helpers — assert the route's grant/no-grant decisions ───────────
const { grantPlanMonthlyMock, grantTopupMock } = vi.hoisted(() => ({
  grantPlanMonthlyMock: vi.fn(async () => 1500),
  grantTopupMock: vi.fn(async () => 1000),
}));
vi.mock('@/lib/billing/grants', () => ({
  grantPlanMonthly: grantPlanMonthlyMock,
  grantTopup: grantTopupMock,
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Import AFTER the mocks.
import { POST } from '@/app/api/webhooks/stripe/route';

const ORIGINAL_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  redisStore.clear();
  for (const k of Object.keys(selectBox)) delete selectBox[k];
  updateCalls.length = 0;
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  constructEventMock.mockImplementation(() => eventBox.event);
  retrieveMock.mockImplementation(async () => subBox.sub);
  grantPlanMonthlyMock.mockResolvedValue(1500);
  grantTopupMock.mockResolvedValue(1000);
});

function makeReq(body = '{}') {
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': 'sig_test', 'Content-Type': 'application/json' },
    body,
  }) as unknown as Parameters<typeof POST>[0];
}

/** A live subscription shape sufficient for the handler (items + status + metadata). */
function makeSub(over: Record<string, unknown> = {}) {
  return {
    id: 'sub_1',
    status: 'active',
    customer: 'cus_match',
    start_date: 1_700_000_000,
    metadata: {},
    items: { data: [{ current_period_end: 1_800_000_000, price: { id: 'price_unknown' } }] },
    ...over,
  };
}

describe('stripe webhook — invoice.payment_succeeded grants', () => {
  it('subscription_cycle grants the monthly credits ONCE (Space path)', async () => {
    subBox.sub = makeSub({ metadata: { plan: 'solo', spaceId: 's_1' } });
    eventBox.event = {
      id: 'evt_cycle',
      type: 'invoice.payment_succeeded',
      data: {
        object: {
          id: 'inv_1',
          subscription: 'sub_1',
          billing_reason: 'subscription_cycle',
        },
      },
    };
    // The Space lookup the route does before crediting (customer matches).
    selectBox.Space = { id: 's_1', plan: 'solo', stripeCustomerId: 'cus_match' };

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(grantPlanMonthlyMock).toHaveBeenCalledTimes(1);
    expect(grantPlanMonthlyMock).toHaveBeenCalledWith(
      { type: 'space', id: 's_1' },
      'solo',
      'inv_1',
    );
  });

  it('a retried identical event does NOT double-grant (idempotency)', async () => {
    subBox.sub = makeSub({ metadata: { plan: 'solo', spaceId: 's_1' } });
    eventBox.event = {
      id: 'evt_retry',
      type: 'invoice.payment_succeeded',
      data: {
        object: { id: 'inv_2', subscription: 'sub_1', billing_reason: 'subscription_cycle' },
      },
    };
    selectBox.Space = { id: 's_1', plan: 'solo', stripeCustomerId: 'cus_match' };

    const first = await POST(makeReq());
    expect(first.status).toBe(200);
    expect(grantPlanMonthlyMock).toHaveBeenCalledTimes(1);

    // Stripe redelivers the SAME event id. The Redis key set after the first
    // success short-circuits the handler before any grant runs.
    const second = await POST(makeReq());
    expect(second.status).toBe(200);
    expect(grantPlanMonthlyMock).toHaveBeenCalledTimes(1); // still 1 — no double-grant
  });

  it('subscription_update (proration / mid-cycle) does NOT grant', async () => {
    subBox.sub = makeSub({ metadata: { plan: 'solo', spaceId: 's_1' } });
    eventBox.event = {
      id: 'evt_proration',
      type: 'invoice.payment_succeeded',
      data: {
        object: { id: 'inv_3', subscription: 'sub_1', billing_reason: 'subscription_update' },
      },
    };
    selectBox.Space = { id: 's_1', plan: 'solo', stripeCustomerId: 'cus_match' };

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(grantPlanMonthlyMock).not.toHaveBeenCalled();
  });
});

describe('stripe webhook — metadata-poisoning guards', () => {
  it('checkout.session.completed with a mismatched customer is rejected (top-up)', async () => {
    eventBox.event = {
      id: 'evt_poison_topup',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_1',
          customer: 'cus_attacker',
          subscription: null,
          metadata: { topup: 'starter', accountType: 'space', accountId: 's_victim' },
        },
      },
    };
    // The victim Space already belongs to a DIFFERENT customer.
    selectBox.Space = { stripeCustomerId: 'cus_victim' };

    const res = await POST(makeReq());
    expect(res.status).toBe(200); // handled (acknowledged) but...
    expect(grantTopupMock).not.toHaveBeenCalled(); // ...no credits granted
  });

  it('checkout.session.completed top-up with a matching customer DOES grant', async () => {
    eventBox.event = {
      id: 'evt_topup_ok',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_2',
          customer: 'cus_match',
          subscription: null,
          metadata: { topup: 'starter', accountType: 'space', accountId: 's_ok' },
        },
      },
    };
    selectBox.Space = { stripeCustomerId: 'cus_match' };

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(grantTopupMock).toHaveBeenCalledTimes(1);
    expect(grantTopupMock).toHaveBeenCalledWith({ type: 'space', id: 's_ok' }, 'starter', 'cs_2');
  });

  it('customer.subscription.deleted with a mismatched customer is rejected (no cancel write)', async () => {
    eventBox.event = {
      id: 'evt_del_poison',
      type: 'customer.subscription.deleted',
      data: {
        object: makeSub({
          id: 'sub_del',
          customer: 'cus_attacker',
          status: 'canceled',
          metadata: { brokerageId: 'brk_victim' },
        }),
      },
    };
    // The brokerage belongs to a different customer than the webhook's sub.
    selectBox.Brokerage = { id: 'brk_victim', stripeCustomerId: 'cus_victim' };

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    // The guard returns before any Brokerage update — assert no cancel write.
    const brokerageWrites = updateCalls.filter((c) => c.table === 'Brokerage');
    expect(brokerageWrites).toHaveLength(0);
  });

  it('customer.subscription.deleted with a matching customer DOES cancel the brokerage', async () => {
    eventBox.event = {
      id: 'evt_del_ok',
      type: 'customer.subscription.deleted',
      data: {
        object: makeSub({
          id: 'sub_del2',
          customer: 'cus_match',
          status: 'canceled',
          metadata: { brokerageId: 'brk_ok' },
        }),
      },
    };
    selectBox.Brokerage = { id: 'brk_ok', stripeCustomerId: 'cus_match' };

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const brokerageWrites = updateCalls.filter((c) => c.table === 'Brokerage');
    expect(brokerageWrites).toHaveLength(1);
    expect(brokerageWrites[0].data.stripeSubscriptionStatus).toBe('canceled');
  });
});

describe('stripe webhook — signature + config guards', () => {
  it('returns 500 when STRIPE_WEBHOOK_SECRET is missing', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const res = await POST(makeReq());
    expect(res.status).toBe(500);
    if (ORIGINAL_SECRET !== undefined) process.env.STRIPE_WEBHOOK_SECRET = ORIGINAL_SECRET;
  });

  it('returns 400 when constructEvent throws (bad signature)', async () => {
    constructEventMock.mockImplementation(() => {
      throw new Error('bad sig');
    });
    const res = await POST(makeReq());
    expect(res.status).toBe(400);
  });
});
