/**
 * Route-level tests for POST /api/contacts/bulk.
 *
 * Covers the contract called out in the task:
 *   - the action applies to ALL selected ids
 *   - it REFUSES cross-space ids (per-id not_found, never a foreign write)
 *   - it RESPECTS the batch cap (400 over MAX_BULK)
 *   - reassign is broker-gated (403 for a non-broker)
 *
 * Supabase + auth mocking mirrors tests/api/agent-drafts-batch-approve.test.ts.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/api-auth', () => ({
  requireSpaceOwner: vi.fn(),
}));
vi.mock('@/lib/permissions', () => ({
  getBrokerContext: vi.fn(),
  canManageLeads: (role: string) => role === 'broker_owner' || role === 'broker_admin',
}));
vi.mock('@/lib/broker-assign-lead', () => ({
  assignLeadToRealtor: vi.fn(),
}));
vi.mock('@/lib/audit', () => ({ audit: vi.fn(async () => undefined) }));
vi.mock('@/lib/vectorize', () => ({ syncContact: vi.fn(async () => undefined) }));

// ── Supabase mock ───────────────────────────────────────────────────────────
// The route does: one `.select().eq('spaceId').in('id', ids)` load, then per id
// an `.update().eq('id').eq('spaceId').select().maybeSingle()`.
//   - The LOAD is the first terminal pushed to the 'Contact' queue (resolved via
//     the chain's thenable — `.in()` returns the chain, then it's awaited).
//   - Each UPDATE resolves via `.maybeSingle()` consuming the next terminal.
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

// Import AFTER mocks.
import { POST } from '@/app/api/contacts/bulk/route';
import { MAX_CONTACT_BULK as MAX_BULK } from '@/lib/api-limits';
import { requireSpaceOwner } from '@/lib/api-auth';
import { getBrokerContext } from '@/lib/permissions';
import { assignLeadToRealtor } from '@/lib/broker-assign-lead';

const mockRequireSpaceOwner = vi.mocked(requireSpaceOwner);
const mockGetBrokerContext = vi.mocked(getBrokerContext);
const mockAssign = vi.mocked(assignLeadToRealtor);

const SPACE = { id: 'space_1', slug: 'acme', name: 'Acme', ownerId: 'owner_1' };

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/contacts/bulk', {
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

describe('POST /api/contacts/bulk — validation', () => {
  it('400s on a missing slug', async () => {
    const res = await POST(makeReq({ ids: ['a'], action: 'archive' }));
    expect(res.status).toBe(400);
  });

  it('400s when ids is empty', async () => {
    const res = await POST(makeReq({ slug: 'acme', ids: [], action: 'archive' }));
    expect(res.status).toBe(400);
  });

  it('400s on an unknown action', async () => {
    const res = await POST(makeReq({ slug: 'acme', ids: ['a'], action: 'frobnicate' }));
    expect(res.status).toBe(400);
  });

  it('400s when ids exceeds the cap', async () => {
    const ids = Array.from({ length: MAX_BULK + 1 }, (_, i) => `id_${i}`);
    const res = await POST(makeReq({ slug: 'acme', ids, action: 'archive' }));
    expect(res.status).toBe(400);
  });

  it('400s on tag-add without a tag', async () => {
    const res = await POST(makeReq({ slug: 'acme', ids: ['a'], action: 'tag-add' }));
    expect(res.status).toBe(400);
  });

  it('401s when unauthorized for the space', async () => {
    mockRequireSpaceOwner.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    );
    const res = await POST(makeReq({ slug: 'acme', ids: ['a'], action: 'archive' }));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/contacts/bulk — applies to all selected', () => {
  it('tags every in-space contact and reports per-id ok', async () => {
    // LOAD terminal: both ids are in the space.
    queueFor('Contact').push({
      data: [
        { id: 'c1', type: 'QUALIFICATION', tags: [] },
        { id: 'c2', type: 'TOUR', tags: ['vip'] },
      ],
      error: null,
    });
    // Two UPDATE terminals (one per contact).
    queueFor('Contact').push({ data: { id: 'c1' }, error: null });
    queueFor('Contact').push({ data: { id: 'c2' }, error: null });

    const res = await POST(makeReq({ slug: 'acme', ids: ['c1', 'c2'], action: 'tag-add', tag: 'hot' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.applied).toBe(2);
    expect(json.results).toEqual([
      { id: 'c1', ok: true },
      { id: 'c2', ok: true },
    ]);
    // Each update added the tag AND was scoped by spaceId.
    expect(updateCalls).toHaveLength(2);
    for (const u of updateCalls) {
      expect(u.eq).toContainEqual(['spaceId', 'space_1']);
      expect((u.values as { tags: string[] }).tags).toContain('hot');
    }
  });

  it('set-stage moves every selected contact', async () => {
    queueFor('Contact').push({
      data: [
        { id: 'c1', type: 'QUALIFICATION', tags: [] },
        { id: 'c2', type: 'QUALIFICATION', tags: [] },
      ],
      error: null,
    });
    queueFor('Contact').push({ data: { id: 'c1' }, error: null });
    queueFor('Contact').push({ data: { id: 'c2' }, error: null });

    const res = await POST(makeReq({ slug: 'acme', ids: ['c1', 'c2'], action: 'set-stage', stage: 'TOUR' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.applied).toBe(2);
    for (const u of updateCalls) {
      expect((u.values as { type: string }).type).toBe('TOUR');
    }
  });

  it('archive sets a snooze on every selected contact', async () => {
    queueFor('Contact').push({
      data: [{ id: 'c1', type: 'TOUR', tags: [] }],
      error: null,
    });
    queueFor('Contact').push({ data: { id: 'c1' }, error: null });

    const res = await POST(makeReq({ slug: 'acme', ids: ['c1'], action: 'archive' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.applied).toBe(1);
    expect((updateCalls[0].values as { snoozedUntil: string }).snoozedUntil).toBeTruthy();
  });
});

describe('POST /api/contacts/bulk — refuses cross-space ids', () => {
  it('returns not_found for an id not in the caller space and never updates it', async () => {
    // LOAD only returns c1 — c_foreign is filtered out by `.eq('spaceId', ...)`.
    queueFor('Contact').push({
      data: [{ id: 'c1', type: 'QUALIFICATION', tags: [] }],
      error: null,
    });
    // One UPDATE terminal for the legitimate c1 only.
    queueFor('Contact').push({ data: { id: 'c1' }, error: null });

    const res = await POST(
      makeReq({ slug: 'acme', ids: ['c1', 'c_foreign'], action: 'tag-add', tag: 'x' }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.applied).toBe(1);
    expect(json.results).toEqual([
      { id: 'c1', ok: true },
      { id: 'c_foreign', ok: false, error: 'not_found' },
    ]);
    // Exactly ONE update ran — the foreign id was never written.
    expect(updateCalls).toHaveLength(1);
  });
});

describe('POST /api/contacts/bulk — reassign is broker-gated', () => {
  it('403s when the caller is not a broker who can manage leads', async () => {
    mockGetBrokerContext.mockResolvedValue(null);
    const res = await POST(
      makeReq({ slug: 'acme', ids: ['c1'], action: 'reassign', realtorUserId: 'u_realtor' }),
    );
    expect(res.status).toBe(403);
    expect(mockAssign).not.toHaveBeenCalled();
  });

  it('clones each lead via assignLeadToRealtor for a broker owner', async () => {
    mockGetBrokerContext.mockResolvedValue({
      brokerage: { id: 'b1', ownerId: 'owner_1', name: 'Acme Realty' },
      membership: { role: 'broker_owner' },
      dbUserId: 'dbuser_1',
    } as never);
    mockAssign.mockResolvedValue({ ok: true, newContactId: 'new_1', assignedToSpaceId: 'space_2' });

    const res = await POST(
      makeReq({ slug: 'acme', ids: ['c1', 'c2'], action: 'reassign', realtorUserId: 'u_realtor' }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.applied).toBe(2);
    expect(mockAssign).toHaveBeenCalledTimes(2);
  });
});
