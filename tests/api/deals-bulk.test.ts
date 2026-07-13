/**
 * Route-level tests for POST /api/deals/bulk.
 *
 * Covers:
 *   - the action applies to ALL selected ids
 *   - it REFUSES cross-space ids (per-id not_found, never a foreign write)
 *   - it RESPECTS the batch cap (400 over MAX_BULK)
 *   - 'won' is rejected (closing runs a per-deal e-sign gate, not bulkable)
 *
 * Supabase + auth mocking mirrors tests/api/agent-drafts-batch-approve.test.ts.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/api-auth', () => ({
  requireSpaceOwner: vi.fn(),
}));
vi.mock('@/lib/audit', () => ({ audit: vi.fn(async () => undefined) }));
vi.mock('@/lib/vectorize', () => ({ syncDeal: vi.fn(async () => undefined) }));

type Terminal = { data?: unknown; error?: unknown };
const queues: Record<string, Terminal[]> = {};
const updateCalls: Array<{ table: string; values: unknown; eq: Array<[string, unknown]> }> = [];

function queueFor(table: string) {
  if (!queues[table]) queues[table] = [];
  return queues[table];
}

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const q = queueFor(table);
    const terminal = q.shift() ?? { data: null, error: null };
    let isUpdate = false;
    let updateValues: unknown;
    const eqs: Array<[string, unknown]> = [];

    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn((col: string, val: unknown) => {
      eqs.push([col, val]);
      return chain;
    });
    chain.in = vi.fn(() => chain);
    chain.update = vi.fn((values: unknown) => {
      isUpdate = true;
      updateValues = values;
      return chain;
    });
    chain.maybeSingle = vi.fn(() => {
      if (isUpdate) updateCalls.push({ table, values: updateValues, eq: eqs });
      return Promise.resolve(terminal);
    });
    chain.single = vi.fn(() => Promise.resolve(terminal));
    chain.then = (resolve: (v: Terminal) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(terminal).then(resolve, reject);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

import { POST } from '@/app/api/deals/bulk/route';
import { MAX_DEAL_BULK as MAX_BULK } from '@/lib/api-limits';
import { requireSpaceOwner } from '@/lib/api-auth';

const mockRequireSpaceOwner = vi.mocked(requireSpaceOwner);

const SPACE = { id: 'space_1', slug: 'acme', name: 'Acme', ownerId: 'owner_1' };

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/deals/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(queues)) delete queues[k];
  updateCalls.length = 0;
  mockRequireSpaceOwner.mockResolvedValue({ userId: 'user_1', space: SPACE } as never);
});

describe('POST /api/deals/bulk — validation', () => {
  it('400s on a missing slug', async () => {
    const res = await POST(makeReq({ ids: ['a'], action: 'archive' }));
    expect(res.status).toBe(400);
  });

  it('400s when ids is empty', async () => {
    const res = await POST(makeReq({ slug: 'acme', ids: [], action: 'archive' }));
    expect(res.status).toBe(400);
  });

  it('400s when ids exceeds the cap', async () => {
    const ids = Array.from({ length: MAX_BULK + 1 }, (_, i) => `id_${i}`);
    const res = await POST(makeReq({ slug: 'acme', ids, action: 'archive' }));
    expect(res.status).toBe(400);
  });

  it("400s on set-status 'won' (closing is not bulkable)", async () => {
    const res = await POST(makeReq({ slug: 'acme', ids: ['d1'], action: 'set-status', status: 'won' }));
    expect(res.status).toBe(400);
  });

  it('400s on an invalid priority', async () => {
    const res = await POST(makeReq({ slug: 'acme', ids: ['d1'], action: 'set-priority', priority: 'URGENT' }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/deals/bulk — applies to all selected', () => {
  it('archives (on_hold) every in-space deal', async () => {
    queueFor('Deal').push({
      data: [
        { id: 'd1', status: 'active' },
        { id: 'd2', status: 'active' },
      ],
      error: null,
    });
    queueFor('Deal').push({ data: { id: 'd1' }, error: null });
    queueFor('Deal').push({ data: { id: 'd2' }, error: null });

    const res = await POST(makeReq({ slug: 'acme', ids: ['d1', 'd2'], action: 'archive' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.applied).toBe(2);
    for (const u of updateCalls) {
      expect((u.values as { status: string }).status).toBe('on_hold');
      expect(u.eq).toContainEqual(['spaceId', 'space_1']);
    }
  });

  it("stamps closedAt when transitioning into 'lost'", async () => {
    queueFor('Deal').push({ data: [{ id: 'd1', status: 'active' }], error: null });
    queueFor('Deal').push({ data: { id: 'd1' }, error: null });

    const res = await POST(makeReq({ slug: 'acme', ids: ['d1'], action: 'set-status', status: 'lost' }));
    expect(res.status).toBe(200);
    const v = updateCalls[0].values as { status: string; closedAt?: string };
    expect(v.status).toBe('lost');
    expect(v.closedAt).toBeTruthy();
  });

  it('set-priority updates every selected deal', async () => {
    queueFor('Deal').push({
      data: [
        { id: 'd1', status: 'active' },
        { id: 'd2', status: 'active' },
      ],
      error: null,
    });
    queueFor('Deal').push({ data: { id: 'd1' }, error: null });
    queueFor('Deal').push({ data: { id: 'd2' }, error: null });

    const res = await POST(makeReq({ slug: 'acme', ids: ['d1', 'd2'], action: 'set-priority', priority: 'HIGH' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.applied).toBe(2);
    for (const u of updateCalls) {
      expect((u.values as { priority: string }).priority).toBe('HIGH');
    }
  });
});

describe('POST /api/deals/bulk — refuses cross-space ids', () => {
  it('returns not_found for an id not in the caller space and never updates it', async () => {
    // LOAD returns only d1 — d_foreign filtered out by `.eq('spaceId', ...)`.
    queueFor('Deal').push({ data: [{ id: 'd1', status: 'active' }], error: null });
    queueFor('Deal').push({ data: { id: 'd1' }, error: null });

    const res = await POST(makeReq({ slug: 'acme', ids: ['d1', 'd_foreign'], action: 'archive' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.applied).toBe(1);
    expect(json.results).toEqual([
      { id: 'd1', ok: true },
      { id: 'd_foreign', ok: false, error: 'not_found' },
    ]);
    expect(updateCalls).toHaveLength(1);
  });
});
