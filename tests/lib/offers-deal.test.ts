/**
 * Behavioral tests for lib/offers.ts's `listOffersForDeal` — the deal-scoped
 * offer read added in Track 18 (deal detail page's Offers section).
 *
 * Contract under test:
 *   - The query chains BOTH .eq('spaceId', spaceId) AND .eq('dealId', dealId)
 *     — the tenant boundary (CLAUDE.md: ".eq IS the security boundary").
 *   - A dealId that belongs to another tenant never leaks that tenant's
 *     offers: the spaceId filter is always the caller's own space,
 *     regardless of what dealId is passed, so a guessed/foreign dealId
 *     simply yields an empty list.
 *   - Rows are ordered newest-first (createdAt desc), matching listOffers.
 *
 * Same mocked-supabase-client pattern as tests/lib/offers.test.ts — executes
 * the real function and asserts on the query chain built, never on source
 * text.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Terminal = { data?: unknown; error?: unknown };
type Call = { table: string; chain: Array<[string, unknown[]]> };

let queues: Record<string, Terminal[]> = {};
let calls: Call[] = [];

function queue(table: string, terminal: Terminal) {
  (queues[table] ??= []).push(terminal);
}

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const chainCalls: Array<[string, unknown[]]> = [];
    const record: Call = { table, chain: chainCalls };
    calls.push(record);

    const next = (): Promise<Terminal> => {
      const q = queues[table];
      const t = q?.shift() ?? { data: null, error: null };
      return Promise.resolve(t);
    };

    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'limit']) {
      chain[m] = vi.fn((...args: unknown[]) => {
        chainCalls.push([m, args]);
        return chain;
      });
    }
    chain.maybeSingle = vi.fn(() => {
      chainCalls.push(['maybeSingle', []]);
      return next();
    });
    chain.single = vi.fn(() => {
      chainCalls.push(['single', []]);
      return next();
    });
    chain.then = (resolve: (v: Terminal) => unknown, reject?: (e: unknown) => unknown) =>
      next().then(resolve, reject);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

import { listOffersForDeal } from '@/lib/offers';

function offerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'offer-1',
    spaceId: 'space-1',
    dealId: 'deal-1',
    propertyAddress: '123 Elm St',
    buyerName: 'Dana Whitfield',
    amount: 450000,
    status: 'submitted',
    expiresAt: null,
    terms: {},
    notes: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  queues = {};
  calls = [];
});

describe('listOffersForDeal', () => {
  it('scopes the read by BOTH spaceId and dealId', async () => {
    queue('Offer', { data: [offerRow()], error: null });

    const rows = await listOffersForDeal('space-1', 'deal-1');
    expect(rows).toHaveLength(1);

    const call = calls.find((c) => c.table === 'Offer');
    expect(call?.chain).toContainEqual(['eq', ['spaceId', 'space-1']]);
    expect(call?.chain).toContainEqual(['eq', ['dealId', 'deal-1']]);
  });

  it('orders newest first', async () => {
    queue('Offer', { data: [offerRow()], error: null });
    await listOffersForDeal('space-1', 'deal-1');

    const call = calls.find((c) => c.table === 'Offer');
    expect(call?.chain).toContainEqual(['order', ['createdAt', { ascending: false }]]);
  });

  it('a dealId belonging to another tenant returns empty, never that tenant\'s offers', async () => {
    // The mocked chain can't simulate real row filtering, but the spaceId
    // eq is always the caller's own space regardless of the dealId passed —
    // that's what makes a foreign dealId resolve to "nothing found" instead
    // of a leak. Simulate the DB honoring that scoping by returning no rows.
    queue('Offer', { data: [], error: null });

    const rows = await listOffersForDeal('space-1', 'deal-in-another-space');
    expect(rows).toEqual([]);

    const call = calls.find((c) => c.table === 'Offer');
    // The caller's OWN spaceId is what's enforced, not anything derived
    // from the (potentially foreign) dealId.
    expect(call?.chain).toContainEqual(['eq', ['spaceId', 'space-1']]);
    expect(call?.chain).toContainEqual(['eq', ['dealId', 'deal-in-another-space']]);
  });

  it('propagates a query error', async () => {
    queue('Offer', { data: null, error: new Error('boom') });
    await expect(listOffersForDeal('space-1', 'deal-1')).rejects.toThrow('boom');
  });
});
