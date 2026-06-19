/**
 * Route-level tests for /api/saved-views (GET / POST / DELETE).
 *
 * Focus: space-scoping. Create, load, and delete are all scoped to the caller's
 * space via requireSpaceOwner + a `.eq('spaceId', space.id)` filter, so a view
 * from another workspace can never be read or deleted.
 *
 * Mirrors the supabase + auth mocking conventions of
 * tests/api/agent-drafts-batch-approve.test.ts.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/api-auth', () => ({
  requireSpaceOwner: vi.fn(),
}));

// ── Supabase mock — table-aware queue + recorded calls ──────────────────────
type Terminal = { data?: unknown; error?: unknown; count?: number };
const queues: Record<string, Terminal[]> = {};
// Records every terminal operation so tests can assert the spaceId scope.
const insertCalls: Array<{ table: string; values: unknown }> = [];
const deleteCalls: Array<{ table: string; eq: Array<[string, unknown]> }> = [];
const eqCalls: Array<{ table: string; column: string; value: unknown }> = [];

function queueFor(table: string) {
  if (!queues[table]) queues[table] = [];
  return queues[table];
}

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const q = queueFor(table);
    const terminal = q.shift() ?? { data: null, error: null };
    let isDelete = false;
    const eqs: Array<[string, unknown]> = [];

    const chain: Record<string, unknown> = {};
    // select() is both a passthrough (list/insert.select) and a terminal for
    // head:true count queries — make it thenable so `await supabase...select(...)`
    // resolves with the terminal ({ count }), while chained calls keep the chain.
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn((col: string, val: unknown) => {
      eqs.push([col, val]);
      eqCalls.push({ table, column: col, value: val });
      return chain;
    });
    chain.order = vi.fn(() => chain);
    chain.insert = vi.fn((values: unknown) => {
      insertCalls.push({ table, values });
      return chain;
    });
    chain.delete = vi.fn(() => {
      isDelete = true;
      return chain;
    });
    chain.single = vi.fn(() => Promise.resolve(terminal));
    chain.maybeSingle = vi.fn(() => Promise.resolve(terminal));
    chain.then = (resolve: (v: Terminal) => unknown, reject?: (e: unknown) => unknown) => {
      if (isDelete) deleteCalls.push({ table, eq: eqs });
      return Promise.resolve(terminal).then(resolve, reject);
    };
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

// Import AFTER mocks.
import { GET, POST, DELETE } from '@/app/api/saved-views/route';
import { requireSpaceOwner } from '@/lib/api-auth';

const mockRequireSpaceOwner = vi.mocked(requireSpaceOwner);

const SPACE = { id: 'space_1', slug: 'acme', name: 'Acme', ownerId: 'owner_1' };

function getReq(qs: string): NextRequest {
  return new NextRequest(`http://localhost/api/saved-views?${qs}`);
}
function postReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/saved-views', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function delReq(qs: string): NextRequest {
  return new NextRequest(`http://localhost/api/saved-views?${qs}`, { method: 'DELETE' });
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(queues)) delete queues[k];
  insertCalls.length = 0;
  deleteCalls.length = 0;
  eqCalls.length = 0;
  mockRequireSpaceOwner.mockResolvedValue({ userId: 'user_1', space: SPACE } as never);
});

describe('GET /api/saved-views', () => {
  it('400s without slug', async () => {
    const res = await GET(getReq('entity=contact'));
    expect(res.status).toBe(400);
  });

  it('400s with an invalid entity', async () => {
    const res = await GET(getReq('slug=acme&entity=widget'));
    expect(res.status).toBe(400);
  });

  it('401s when not authorized for the space', async () => {
    mockRequireSpaceOwner.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    );
    const res = await GET(getReq('slug=acme&entity=contact'));
    expect(res.status).toBe(401);
  });

  it('returns the space + entity views, scoped to the caller space', async () => {
    queueFor('SavedView').push({
      data: [{ id: 'v1', spaceId: 'space_1', entity: 'contact', name: 'Hot buyers', filters: {} }],
      error: null,
    });
    const res = await GET(getReq('slug=acme&entity=contact'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(json[0].name).toBe('Hot buyers');
    // The list query is scoped to the caller's space + entity.
    expect(eqCalls).toContainEqual({ table: 'SavedView', column: 'spaceId', value: 'space_1' });
    expect(eqCalls).toContainEqual({ table: 'SavedView', column: 'entity', value: 'contact' });
  });
});

describe('POST /api/saved-views', () => {
  it('400s on a missing name', async () => {
    const res = await POST(postReq({ slug: 'acme', entity: 'contact', filters: {} }));
    expect(res.status).toBe(400);
  });

  it('400s on an invalid entity', async () => {
    const res = await POST(postReq({ slug: 'acme', entity: 'nope', name: 'X' }));
    expect(res.status).toBe(400);
  });

  it('400s when filters is not an object', async () => {
    const res = await POST(postReq({ slug: 'acme', entity: 'deal', name: 'X', filters: [1, 2] }));
    expect(res.status).toBe(400);
  });

  it('creates a view stamped with the caller space id', async () => {
    // First the cap-count query (head:true) → count 0, then the insert.select.single.
    queueFor('SavedView').push({ count: 0, error: null });
    queueFor('SavedView').push({
      data: { id: 'v_new', spaceId: 'space_1', entity: 'contact', name: 'My view', filters: { typeFilter: 'TOUR' } },
      error: null,
    });
    const res = await POST(
      postReq({ slug: 'acme', entity: 'contact', name: '  My view  ', filters: { typeFilter: 'TOUR' } }),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe('v_new');
    // The inserted row carries THIS space + the trimmed name + creator.
    const ins = insertCalls.find((c) => c.table === 'SavedView');
    expect(ins).toBeDefined();
    const v = ins!.values as { spaceId: string; name: string; entity: string; userId: string };
    expect(v.spaceId).toBe('space_1');
    expect(v.name).toBe('My view');
    expect(v.entity).toBe('contact');
    expect(v.userId).toBe('user_1');
  });

  it('400s when the per-bucket cap is already reached', async () => {
    queueFor('SavedView').push({ count: 100, error: null });
    const res = await POST(postReq({ slug: 'acme', entity: 'contact', name: 'one more', filters: {} }));
    expect(res.status).toBe(400);
    // Cap hit BEFORE any insert.
    expect(insertCalls).toHaveLength(0);
  });
});

describe('DELETE /api/saved-views', () => {
  it('400s without an id', async () => {
    const res = await DELETE(delReq('slug=acme'));
    expect(res.status).toBe(400);
  });

  it('deletes a view scoped to the caller space', async () => {
    queueFor('SavedView').push({ data: [{ id: 'v1' }], error: null });
    const res = await DELETE(delReq('slug=acme&id=v1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    // The delete was filtered by both id AND spaceId — never an unscoped delete.
    const del = deleteCalls.find((d) => d.table === 'SavedView');
    expect(del).toBeDefined();
    expect(del!.eq).toContainEqual(['id', 'v1']);
    expect(del!.eq).toContainEqual(['spaceId', 'space_1']);
  });

  it('404s a view id from another space (scoped delete affects 0 rows)', async () => {
    // The `.eq('spaceId', space_1)` filter matches nothing for a foreign id →
    // empty `select` result → 404, never a cross-space delete.
    queueFor('SavedView').push({ data: [], error: null });
    const res = await DELETE(delReq('slug=acme&id=foreign_view'));
    expect(res.status).toBe(404);
    const del = deleteCalls.find((d) => d.table === 'SavedView');
    expect(del!.eq).toContainEqual(['spaceId', 'space_1']);
  });
});
