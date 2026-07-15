/**
 * Behavioral tests for GET /api/broker/mentions — the broker chat's
 * brokerage-scoped @ mention search. Focus: the permission gate and that the
 * reads are bounded to the brokerage's member spaceIds (the tenant boundary).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mutable per-test state ────────────────────────────────────────────────
let isBroker = true;
let memberSpaceIds: string[] = ['space_a', 'space_b'];
let contactRows: Array<Record<string, unknown>> = [];
let dealRows: Array<Record<string, unknown>> = [];

// Capture the `.in('spaceId', …)` scope applied to each table.
const scopeByTable: Record<string, unknown> = {};

vi.mock('@/lib/permissions', () => ({
  requireBroker: vi.fn(async () => {
    if (!isBroker) throw new Error('not a broker');
    return {
      membership: { id: 'm_1', role: 'broker_owner', userId: 'u_1' },
      brokerage: { id: 'brk_1', name: 'Test Brokerage', ownerId: 'owner_1' },
      dbUserId: 'u_1',
    };
  }),
}));

vi.mock('@/lib/brokerage-members', () => ({
  getBrokerageMembers: vi.fn(async () =>
    memberSpaceIds.map((id) => ({ Space: { id }, User: { name: 'Agent', email: 'a@x.com' } })),
  ),
}));

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const rows = table === 'Contact' ? contactRows : table === 'Deal' ? dealRows : [];
    const chain: Record<string, unknown> = {};
    const pass = () => chain;
    chain.select = vi.fn(pass);
    chain.eq = vi.fn(pass);
    chain.limit = vi.fn(pass);
    chain.or = vi.fn(pass);
    chain.ilike = vi.fn(pass);
    chain.in = vi.fn((col: string, vals: unknown) => {
      if (col === 'spaceId') scopeByTable[table] = vals;
      return chain;
    });
    chain.then = (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(r, e);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

import { GET } from '@/app/api/broker/mentions/route';

function req(search?: string): import('next/server').NextRequest {
  const url = new URL('http://t.test/api/broker/mentions');
  if (search != null) url.searchParams.set('search', search);
  return { nextUrl: url } as unknown as import('next/server').NextRequest;
}

beforeEach(() => {
  isBroker = true;
  memberSpaceIds = ['space_a', 'space_b'];
  contactRows = [];
  dealRows = [];
  for (const k of Object.keys(scopeByTable)) delete scopeByTable[k];
});

describe('GET /api/broker/mentions', () => {
  it('403s a non-broker caller before any read', async () => {
    isBroker = false;
    const res = await GET(req('maria'));
    expect(res.status).toBe(403);
  });

  it('returns brokerage contacts + deals as MentionItems', async () => {
    contactRows = [{ id: 'c1', name: 'Maria Diaz', email: 'maria@x.com', phone: null }];
    dealRows = [{ id: 'd1', title: '123 Oak St', value: 500000, address: '123 Oak St' }];
    const res = await GET(req('m'));
    expect(res.status).toBe(200);
    const items = await res.json();
    expect(items).toEqual([
      { id: 'c1', type: 'contact', label: 'Maria Diaz', subtitle: 'maria@x.com' },
      { id: 'd1', type: 'deal', label: '123 Oak St', subtitle: '$500,000' },
    ]);
  });

  it('scopes both reads to the brokerage member spaceIds (tenant boundary)', async () => {
    contactRows = [{ id: 'c1', name: 'X', email: null, phone: null }];
    dealRows = [{ id: 'd1', title: 'Y', value: null, address: null }];
    await GET(req('x'));
    expect(scopeByTable['Contact']).toEqual(['space_a', 'space_b']);
    expect(scopeByTable['Deal']).toEqual(['space_a', 'space_b']);
  });

  it('returns [] when the brokerage has no member spaces', async () => {
    memberSpaceIds = [];
    // owner-space fallback also resolves to none in this mock (Space read → [])
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});
