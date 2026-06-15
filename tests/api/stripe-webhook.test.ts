/**
 * Tests for the Stripe webhook receiver — the real-money subscription &
 * top-up lifecycle. These lock in the billing-lifecycle fixes:
 *
 *   #3 checkout.session.completed sets Space.plan immediately + the first
 *      invoice.payment_succeeded can find the Space by metadata.spaceId before
 *      stripeSubscriptionId is written (first-invoice race).
 *   #4 cancellation / hard payment-failure downgrades Space.plan to 'free';
 *      past_due keeps the plan but flips status (grace window).
 *   #5 an unmapped Stripe price id with no metadata.plan does NOT default to
 *      'solo' — the grant is skipped and a CRITICAL error is logged.
 *   #6 trial-end + plan-change invoices are grantable (with per-invoice
 *      idempotency via sourceId).
 *   #7 a top-up grant that throws is caught — the webhook still returns 200 so
 *      Stripe stops retrying, and a CRITICAL (charged-but-not-credited) is
 *      logged.
 *
 * The webhook leans on the Supabase query builder + the Stripe SDK, so we mock
 * both: a small chainable Supabase double that captures writes and serves
 * configurable reads, and a Stripe double whose constructEvent returns the
 * event we hand it and whose subscriptions.retrieve serves a configurable sub.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// lib/plans.ts reads price ids from env at MODULE LOAD, so set them before any
// import that transitively loads it (the route does). Real-ish ids so
// planIdForStripePrice resolves a live subscription price back to its plan.
process.env.STRIPE_PRICE_SOLO = 'price_solo_m';
process.env.STRIPE_PRICE_PRO = 'price_pro_m';
process.env.STRIPE_PRICE_TEAM = 'price_team_m';

// ── Supabase double ───────────────────────────────────────────────────
// reads: a handler keyed off (table, filters) -> row | null
// writes: every .update(...).eq(...)... is recorded for assertions.

type Filters = Record<string, unknown>;
interface WriteCall {
  table: string;
  payload: Record<string, unknown>;
  filters: Filters;
}

const { supabaseState } = vi.hoisted(() => ({
  supabaseState: {
    reads: [] as Array<{ table: string; filters: Filters }>,
    writes: [] as WriteCall[],
    // (table, filters) -> row. Default: null (not found).
    readHandler: (_table: string, _filters: Filters): unknown => null,
  },
}));

function makeSelectBuilder(table: string) {
  const filters: Filters = {};
  const builder: any = {
    eq(col: string, val: unknown) {
      filters[col] = val;
      return builder;
    },
    gt() {
      return builder;
    },
    is(col: string, val: unknown) {
      filters[col] = val;
      return builder;
    },
    maybeSingle() {
      supabaseState.reads.push({ table, filters: { ...filters } });
      return Promise.resolve({ data: supabaseState.readHandler(table, { ...filters }), error: null });
    },
    single() {
      supabaseState.reads.push({ table, filters: { ...filters } });
      return Promise.resolve({ data: supabaseState.readHandler(table, { ...filters }), error: null });
    },
  };
  return builder;
}

function makeUpdateBuilder(table: string, payload: Record<string, unknown>) {
  const filters: Filters = {};
  const call: WriteCall = { table, payload, filters };
  // Thenable so `await supabase.from(t).update(p).eq(...)` resolves.
  const builder: any = {
    eq(col: string, val: unknown) {
      filters[col] = val;
      return builder;
    },
    is(col: string, val: unknown) {
      filters[col] = val;
      return builder;
    },
    select() {
      return builder;
    },
    single() {
      supabaseState.writes.push(call);
      return Promise.resolve({ data: payload, error: null });
    },
    then(resolve: (v: { data: null; error: null }) => unknown) {
      supabaseState.writes.push(call);
      return Promise.resolve({ data: null, error: null }).then(resolve);
    },
  };
  return builder;
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from(table: string) {
      return {
        select: () => makeSelectBuilder(table),
        update: (payload: Record<string, unknown>) => makeUpdateBuilder(table, payload),
      };
    },
  },
}));

// ── Redis double (idempotency fast-path; correctness is DB-level) ──────
const { redisGetMock, redisSetMock } = vi.hoisted(() => ({
  redisGetMock: vi.fn(async () => null),
  redisSetMock: vi.fn(async () => 'OK'),
}));
vi.mock('@/lib/redis', () => ({
  redis: { get: redisGetMock, set: redisSetMock },
}));

// ── logger double ──────────────────────────────────────────────────────
const { loggerErrorMock, loggerWarnMock, loggerInfoMock } = vi.hoisted(() => ({
  loggerErrorMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerInfoMock: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: loggerErrorMock, warn: loggerWarnMock, info: loggerInfoMock, debug: vi.fn() },
}));

// ── grants double — assert which grant ran with what plan/sourceId ─────
const { grantTopupMock, grantPlanMonthlyMock } = vi.hoisted(() => ({
  grantTopupMock: vi.fn(async () => 0),
  grantPlanMonthlyMock: vi.fn(async () => 0),
}));
vi.mock('@/lib/billing/grants', () => ({
  grantTopup: grantTopupMock,
  grantPlanMonthly: grantPlanMonthlyMock,
}));

// ── observability passthrough ──────────────────────────────────────────
vi.mock('@/lib/with-observability', () => ({
  withObservability: (fn: unknown) => fn,
}));

// ── Stripe double ──────────────────────────────────────────────────────
// constructEvent returns whatever event we stash; subscriptions.retrieve
// returns the configured live subscription.
const { stripeState } = vi.hoisted(() => ({
  stripeState: {
    event: null as unknown,
    subscription: null as unknown,
  },
}));
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    webhooks: { constructEvent: () => stripeState.event },
    subscriptions: { retrieve: async () => stripeState.subscription },
  }),
}));

import { POST } from '@/app/api/webhooks/stripe/route';

// Real plan price ids so planIdForStripePrice resolves in-test.
beforeEach(() => {
  vi.clearAllMocks();
  supabaseState.reads = [];
  supabaseState.writes = [];
  supabaseState.readHandler = () => null;
  stripeState.event = null;
  stripeState.subscription = null;
  redisGetMock.mockResolvedValue(null);
  redisSetMock.mockResolvedValue('OK');
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
});

function req(): NextRequest {
  return new NextRequest('https://example.com/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': 't=1,v1=sig' },
    body: '{}',
  });
}

function fireEvent(event: unknown, subscription?: unknown) {
  stripeState.event = event;
  if (subscription !== undefined) stripeState.subscription = subscription;
  return POST(req());
}

function sub(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'sub_1',
    status: 'active',
    customer: 'cus_1',
    start_date: 1_700_000_000,
    metadata: {},
    items: { data: [{ price: { id: 'price_solo_m' }, current_period_end: 1_800_000_000 }] },
    ...overrides,
  };
}

function writesTo(table: string): WriteCall[] {
  return supabaseState.writes.filter((w) => w.table === table);
}

// ── Fix #3 ─────────────────────────────────────────────────────────────
describe('Fix #3 — checkout sets Space.plan + first-invoice race', () => {
  it('checkout.session.completed sets Space.plan from the live price (not free)', async () => {
    supabaseState.readHandler = (table) => (table === 'Space' ? { stripeCustomerId: null } : null);
    const subscription = sub({ status: 'trialing', metadata: { spaceId: 'sp1', plan: 'pro' } });
    const res = await fireEvent(
      {
        id: 'evt_checkout',
        type: 'checkout.session.completed',
        data: { object: { metadata: { spaceId: 'sp1', plan: 'pro' }, customer: 'cus_1', subscription: 'sub_1' } },
      },
      subscription,
    );
    expect(res.status).toBe(200);
    const spaceWrite = writesTo('Space').find((w) => 'plan' in w.payload);
    expect(spaceWrite).toBeTruthy();
    // Live price 'price_pro_m' -> 'pro' (NOT the old 'free'-until-first-invoice).
    expect(spaceWrite!.payload.plan).toBe('pro');
    expect(spaceWrite!.payload.stripeSubscriptionId).toBe('sub_1');
  });

  it('invoice.payment_succeeded finds the Space by metadata.spaceId when stripeSubscriptionId is not set yet', async () => {
    // Lookup by stripeSubscriptionId misses (race); only the id-based read hits.
    supabaseState.readHandler = (table, filters) => {
      if (table !== 'Space') return null;
      if (filters.stripeSubscriptionId) return null; // race: not written yet
      if (filters.id === 'sp1') return { id: 'sp1', plan: 'free', stripeCustomerId: 'cus_1' };
      return null;
    };
    const subscription = sub({ metadata: { spaceId: 'sp1', plan: 'solo' } });
    const res = await fireEvent(
      {
        id: 'evt_inv',
        type: 'invoice.payment_succeeded',
        data: { object: { id: 'in_1', billing_reason: 'subscription_create', subscription: 'sub_1' } },
      },
      subscription,
    );
    expect(res.status).toBe(200);
    // The grant ran for the space found via metadata fallback (not skipped).
    expect(grantPlanMonthlyMock).toHaveBeenCalledWith(
      { type: 'space', id: 'sp1' },
      'solo',
      'in_1',
    );
    // And stripeSubscriptionId was backfilled, closing the race for next time.
    const backfill = writesTo('Space').find((w) => w.payload.stripeSubscriptionId === 'sub_1');
    expect(backfill).toBeTruthy();
  });
});

// ── Fix #4 ─────────────────────────────────────────────────────────────
describe('Fix #4 — cancellation downgrades; payment failure gates without wiping plan', () => {
  it('customer.subscription.deleted downgrades the Space to free', async () => {
    const subscription = sub({ status: 'canceled', metadata: {} });
    const res = await fireEvent(
      { id: 'evt_del', type: 'customer.subscription.deleted', data: { object: subscription } },
      subscription,
    );
    expect(res.status).toBe(200);
    const w = writesTo('Space')[0];
    expect(w.payload.plan).toBe('free');
    expect(w.payload.stripeSubscriptionStatus).toBe('canceled');
  });

  it('customer.subscription.deleted downgrades a brokerage to starter (free is space-only / would fail the CHECK)', async () => {
    // Ownership guard reads the Brokerage row first; make customer match.
    supabaseState.readHandler = (table) =>
      table === 'Brokerage' ? { id: 'br1', stripeCustomerId: 'cus_1' } : null;
    const subscription = sub({ status: 'canceled', metadata: { brokerageId: 'br1' } });
    const res = await fireEvent(
      { id: 'evt_del_b', type: 'customer.subscription.deleted', data: { object: subscription } },
      subscription,
    );
    expect(res.status).toBe(200);
    const w = writesTo('Brokerage')[0];
    expect(w.payload.plan).toBe('starter');
    expect(w.payload.stripeSubscriptionStatus).toBe('canceled');
    // seatLimit intentionally preserved (no key in payload).
    expect('seatLimit' in w.payload).toBe(false);
  });

  it('invoice.payment_failed sets past_due but does NOT change the plan (grace window)', async () => {
    const subscription = sub({ status: 'past_due', metadata: {} });
    const res = await fireEvent(
      {
        id: 'evt_fail',
        type: 'invoice.payment_failed',
        data: { object: { id: 'in_f', subscription: 'sub_1' } },
      },
      subscription,
    );
    expect(res.status).toBe(200);
    const w = writesTo('Space')[0];
    expect(w.payload.stripeSubscriptionStatus).toBe('past_due');
    expect('plan' in w.payload).toBe(false); // plan NOT wiped — recovery restores access
  });
});
