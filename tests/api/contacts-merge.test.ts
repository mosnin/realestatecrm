/**
 * Route-level tests for POST /api/contacts/merge.
 *
 * Covers the destructive-merge contract:
 *   - PREVIEW (commit omitted) mutates nothing, returns the merged field result
 *     (survivor wins; blanks filled from dupe), tag UNION, and per-table
 *     reference counts.
 *   - COMMIT (commit:true) calls the transactional merge_contacts RPC with the
 *     survivor + present duplicate ids + space id. InboxThread / InboxMessage
 *     refs are counted on preview so the realtor sees transcript rows that
 *     the RPC will fold (UNIQUE space+contact — not a blind UPDATE).
 *   - REFUSES cross-space ids (a requested duplicate that exists in another
 *     space → 400, RPC never called).
 *   - Idempotent: a duplicate id that no longer exists anywhere is skipped; a
 *     re-run with all-gone duplicates returns alreadyMerged with no RPC call.
 *   - Caps the group size; rejects self-merge / empty lists.
 *
 * Supabase + auth mocking mirrors tests/api/deals-bulk.test.ts: a per-table
 * queue of terminal results, with .in()/.eq()/.select() chainable and the RPC
 * recorded.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/api-auth', () => ({ requireSpaceOwner: vi.fn() }));
vi.mock('@/lib/audit', () => ({ audit: vi.fn(async () => undefined) }));
vi.mock('@/lib/vectorize', () => ({ syncContact: vi.fn(async () => undefined) }));

type Terminal = { data?: unknown; error?: unknown; count?: number };

// Per-"slot" queues. A slot is `table` for normal queries; the count-head
// queries (countReferences) use the same table queue but we just default them
// to count:0 unless explicitly queued.
const queues: Record<string, Terminal[]> = {};
function queueFor(key: string): Terminal[] {
  if (!queues[key]) queues[key] = [];
  return queues[key];
}

let rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
let rpcResult: Terminal = { data: { survivorId: 's', merged: ['d1'], repointed: {}, alreadyMerged: false }, error: null };

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const q = queueFor(table);
    let headCount = false;

    const chain: Record<string, unknown> = {};
    chain.select = vi.fn((_sel?: unknown, opts?: { count?: string; head?: boolean }) => {
      if (opts?.head) headCount = true;
      return chain;
    });
    chain.eq = vi.fn(() => chain);
    chain.in = vi.fn(() => chain);
    chain.is = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.limit = vi.fn(() => chain);
    const resolveTerminal = (): Terminal => {
      // head/count queries pull from a `${table}#count` queue; default 0.
      if (headCount) {
        const cq = queueFor(`${table}#count`);
        return cq.shift() ?? { count: 0, error: null };
      }
      return q.shift() ?? { data: null, error: null };
    };
    chain.maybeSingle = vi.fn(() => Promise.resolve(resolveTerminal()));
    chain.single = vi.fn(() => Promise.resolve(resolveTerminal()));
    chain.then = (resolve: (v: Terminal) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(resolveTerminal()).then(resolve, reject);
    return chain;
  }
  return {
    supabase: {
      from: vi.fn((table: string) => makeChain(table)),
      rpc: vi.fn((fn: string, args: Record<string, unknown>) => {
        rpcCalls.push({ fn, args });
        return Promise.resolve(rpcResult);
      }),
    },
  };
});

import { POST } from '@/app/api/contacts/merge/route';
import { requireSpaceOwner } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';

const mockRequireSpaceOwner = vi.mocked(requireSpaceOwner);
const SPACE = { id: 'space_1', name: 'Acme' } as never;

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/contacts/merge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(queues)) delete queues[k];
  rpcCalls = [];
  rpcResult = { data: { survivorId: 's', merged: ['d1'], repointed: {}, alreadyMerged: false }, error: null };
  mockRequireSpaceOwner.mockResolvedValue({ userId: 'user_1', space: SPACE } as never);
});

const survivor = {
  id: 's',
  spaceId: 'space_1',
  name: 'Jane Doe',
  email: 'jane@example.com',
  phone: null,
  address: null,
  notes: 'survivor note',
  preferences: null,
  budget: null,
  tags: ['vip'],
  properties: ['123 Main'],
  createdAt: '2026-01-01',
};
const dupe = {
  id: 'd1',
  spaceId: 'space_1',
  name: 'Jane D',
  email: 'jane@example.com',
  phone: '4155550000', // fills survivor's blank phone
  address: '1 Market St', // fills blank address
  notes: 'dupe note', // survivor already has notes → must NOT overwrite
  preferences: null,
  budget: 500000, // fills blank budget
  tags: ['buyer'], // union → [vip, buyer]
  properties: ['456 Oak'],
  createdAt: '2026-02-01',
};

describe('POST /api/contacts/merge — preview', () => {
  it('previews without mutating: survivor wins, blanks filled, tags unioned, refs counted', async () => {
    // Load survivor + dupe (both in space).
    queueFor('Contact').push({ data: [survivor, dupe], error: null });
    // Reference counts: queue a couple non-zero, rest default 0.
    queueFor('DealContact#count').push({ count: 2, error: null });
    queueFor('Tour#count').push({ count: 1, error: null });
    queueFor('InboxThread#count').push({ count: 1, error: null });
    queueFor('InboxMessage#count').push({ count: 4, error: null });

    const res = await POST(makeReq({ slug: 'acme', survivorId: 's', duplicateIds: ['d1'] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.committed).toBe(false);
    expect(body.preview).toBe(true);
    // RPC must NOT be called on preview.
    expect(supabase.rpc).not.toHaveBeenCalled();

    // Field precedence: survivor's notes kept; blanks filled from dupe.
    expect(body.changes.phone.to).toBe('4155550000');
    expect(body.changes.address.to).toBe('1 Market St');
    expect(body.changes.budget.to).toBe(500000);
    expect(body.changes.notes).toBeUndefined(); // unchanged → not in changes

    // Tag union.
    expect((body.merged.tags as string[]).sort()).toEqual(['buyer', 'vip']);

    // Reference counts surfaced — including inbox threads/messages, which
    // merge_contacts folds instead of a unique-constraint-colliding UPDATE.
    expect(body.references['DealContact.contactId']).toBe(2);
    expect(body.references['Tour.contactId']).toBe(1);
    expect(body.references['InboxThread.contactId']).toBe(1);
    expect(body.references['InboxMessage.contactId']).toBe(4);
  });
});

describe('POST /api/contacts/merge — commit', () => {
  it('calls merge_contacts RPC with survivor + present dup ids + space id', async () => {
    queueFor('Contact').push({ data: [survivor, dupe], error: null }); // load
    queueFor('Contact').push({ data: { ...survivor }, error: null }); // post-merge re-read

    const res = await POST(
      makeReq({ slug: 'acme', survivorId: 's', duplicateIds: ['d1'], commit: true }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.committed).toBe(true);
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe('merge_contacts');
    expect(rpcCalls[0].args.p_survivor_id).toBe('s');
    expect(rpcCalls[0].args.p_duplicate_ids).toEqual(['d1']);
    expect(rpcCalls[0].args.p_space_id).toBe('space_1');
    expect(body.merged).toEqual(['d1']);
  });

  it('surfaces an RPC failure as 500 and reports no changes', async () => {
    queueFor('Contact').push({ data: [survivor, dupe], error: null });
    rpcResult = { data: null, error: { message: 'boom' } };
    const res = await POST(
      makeReq({ slug: 'acme', survivorId: 's', duplicateIds: ['d1'], commit: true }),
    );
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/no changes/i);
  });
});

describe('POST /api/contacts/merge — space scoping', () => {
  it('refuses when a requested duplicate exists in another space (cross-space)', async () => {
    // Load returns ONLY the survivor — the dupe is absent from this space.
    queueFor('Contact').push({ data: [survivor], error: null });
    // The follow-up existence check for the missing id finds it elsewhere.
    queueFor('Contact').push({ data: [{ id: 'd1' }], error: null });

    const res = await POST(
      makeReq({ slug: 'acme', survivorId: 's', duplicateIds: ['d1'], commit: true }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/different workspace/i);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('404s when the survivor is not in the caller space', async () => {
    queueFor('Contact').push({ data: [], error: null }); // nothing in this space
    queueFor('Contact').push({ data: [], error: null }); // missing-id existence check
    const res = await POST(
      makeReq({ slug: 'acme', survivorId: 's', duplicateIds: ['d1'], commit: true }),
    );
    expect(res.status).toBe(404);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});

describe('POST /api/contacts/merge — idempotency', () => {
  it('returns alreadyMerged (no RPC) when all duplicates are gone everywhere', async () => {
    // Survivor present; dupe absent from this space.
    queueFor('Contact').push({ data: [survivor], error: null });
    // Existence check for the missing dup finds nothing anywhere → already merged.
    queueFor('Contact').push({ data: [], error: null });

    const res = await POST(
      makeReq({ slug: 'acme', survivorId: 's', duplicateIds: ['d1'], commit: true }),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.alreadyMerged).toBe(true);
    expect(body.merged).toEqual([]);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});

describe('POST /api/contacts/merge — validation', () => {
  it('rejects an empty duplicate list', async () => {
    const res = await POST(makeReq({ slug: 'acme', survivorId: 's', duplicateIds: [] }));
    expect(res.status).toBe(400);
  });

  it('rejects self-merge (survivor in the duplicate list, nothing else)', async () => {
    const res = await POST(makeReq({ slug: 'acme', survivorId: 's', duplicateIds: ['s'] }));
    expect(res.status).toBe(400); // 's' filtered out → empty → 400
  });

  it('caps the group size', async () => {
    const many = Array.from({ length: 51 }, (_, i) => `d${i}`);
    const res = await POST(makeReq({ slug: 'acme', survivorId: 's', duplicateIds: many }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/max/i);
  });

  it('requires survivorId', async () => {
    const res = await POST(makeReq({ slug: 'acme', duplicateIds: ['d1'] }));
    expect(res.status).toBe(400);
  });
});
