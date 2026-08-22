/**
 * Behavioral lock: broker profile writes are self-scoped to the caller's
 * membership (id + brokerageId + userId). Replaces a source-grep contract
 * that broke when the route moved onto tenantTable().
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/permissions', () => ({
  requireBroker: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({ userId: 'clerk_1' })),
}));

vi.mock('@/lib/audit', () => ({
  audit: vi.fn(),
}));

type TableResult = { data?: unknown; error?: unknown };
const tableQueues: Record<string, TableResult[]> = {};
const eqCalls: { table: string; column: string; value: unknown }[] = [];
const updateCalls: { table: string; payload: unknown }[] = [];

function seed(table: string, ...results: TableResult[]) {
  tableQueues[table] = (tableQueues[table] ?? []).concat(results);
}

function nextResult(table: string): TableResult {
  const q = tableQueues[table];
  if (q && q.length > 0) return q.shift() as TableResult;
  return { data: null };
}

function makeChain(table: string) {
  const chain: Record<string, unknown> = {};
  const passthrough = ['select', 'in', 'order', 'limit', 'insert', 'upsert'];
  for (const m of passthrough) chain[m] = vi.fn(() => chain);
  chain.eq = vi.fn((column: string, value: unknown) => {
    eqCalls.push({ table, column, value });
    return chain;
  });
  chain.update = vi.fn((payload: unknown) => {
    updateCalls.push({ table, payload });
    return chain;
  });
  chain.maybeSingle = vi.fn(() => Promise.resolve(nextResult(table)));
  chain.single = vi.fn(() => Promise.resolve(nextResult(table)));
  (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(nextResult(table)).then(resolve);
  return chain;
}

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn((table: string) => makeChain(table)) },
}));

import { PATCH } from '@/app/api/broker/profile/route';
import { requireBroker } from '@/lib/permissions';

const mockRequireBroker = vi.mocked(requireBroker);

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(tableQueues)) delete tableQueues[k];
  eqCalls.length = 0;
  updateCalls.length = 0;
  mockRequireBroker.mockResolvedValue({
    membership: { id: 'mem_1', role: 'broker_owner' },
    brokerage: { id: 'bk_1', ownerId: 'owner_1' },
    dbUserId: 'user_1',
  } as never);
});

describe('broker profile update scoping', () => {
  it('scopes the write to membership id, brokerage, and resolved user id', async () => {
    seed('BrokerageMembership', { data: { id: 'mem_1' } });

    const req = new Request('http://localhost/api/broker/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Ada Broker' }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(200);

    const scoped = eqCalls.filter((c) => c.table === 'BrokerageMembership');
    expect(scoped.some((c) => c.column === 'brokerageId' && c.value === 'bk_1')).toBe(true);
    expect(scoped.some((c) => c.column === 'id' && c.value === 'mem_1')).toBe(true);
    expect(scoped.some((c) => c.column === 'userId' && c.value === 'user_1')).toBe(true);
    expect(updateCalls).toHaveLength(1);
  });

  it('409s when the membership row is gone and does not invent success', async () => {
    seed('BrokerageMembership', { data: null });

    const req = new Request('http://localhost/api/broker/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Ada Broker' }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/membership changed/i);
    expect(JSON.stringify(body)).not.toMatch(/ssn|555-|VICTIM/i);
  });
});
