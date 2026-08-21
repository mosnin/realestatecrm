/**
 * Behavioral lock: broker lead-note reads/writes stay inside the brokerage
 * binding. Replaces a source-grep contract that broke when Contact lookups
 * were wrapped with tenantTable().
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/permissions', () => ({
  requireBroker: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
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
  const passthrough = ['select', 'order', 'limit', 'in', 'insert', 'upsert', 'is', 'not'];
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

import { GET, POST } from '@/app/api/broker/lead-note/route';
import { requireBroker } from '@/lib/permissions';

const mockRequireBroker = vi.mocked(requireBroker);

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(tableQueues)) delete tableQueues[k];
  eqCalls.length = 0;
  updateCalls.length = 0;
  mockRequireBroker.mockResolvedValue({
    membership: { role: 'broker_owner' },
    brokerage: { id: 'bk_1', ownerId: 'owner_1' },
    dbUserId: 'user_1',
  } as never);
});

function eqOn(table: string, column: string) {
  return eqCalls.filter((c) => c.table === table && c.column === column);
}

describe('POST /api/broker/lead-note', () => {
  it('404s a contact outside the brokerage and does not update notes', async () => {
    seed('User', { data: { name: 'Broker', email: 'b@x.com' } });
    seed('Space', { data: { id: 'space_broker' } });
    seed('Contact', { data: null }); // broker space
    seed('Contact', { data: null }); // brokerageId
    seed('Contact', { data: { id: 'c_victim', notes: 'VICTIM 555-0100', spaceId: 'space_victim' } });
    seed('Space', { data: { ownerId: 'owner_victim' } });
    seed('BrokerageMembership', { data: null });

    const res = await POST(
      new NextRequest('http://localhost/api/broker/lead-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: '00000000-0000-4000-8000-000000000001', note: 'hello' }),
      }),
    );

    expect(res.status).toBe(404);
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain('VICTIM');
    expect(body).not.toContain('555-0100');
    expect(body).not.toContain('Forbidden');
    expect(updateCalls.filter((c) => c.table === 'Contact')).toHaveLength(0);
    expect(eqOn('Contact', 'spaceId').map((c) => c.value)).toContain('space_broker');
  });

  it('updates a broker-space contact through spaceId', async () => {
    seed('User', { data: { name: 'Broker', email: 'b@x.com' } });
    seed('Space', { data: { id: 'space_broker' } });
    seed('Contact', {
      data: {
        id: '00000000-0000-4000-8000-000000000002',
        notes: 'old',
        spaceId: 'space_broker',
        brokerageId: null,
      },
    });
    seed('Contact', { data: null }); // update thenable

    const res = await POST(
      new NextRequest('http://localhost/api/broker/lead-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: '00000000-0000-4000-8000-000000000002', note: 'follow up' }),
      }),
    );

    expect(res.status).toBe(200);
    expect(updateCalls.filter((c) => c.table === 'Contact').length).toBeGreaterThan(0);
    expect(eqOn('Contact', 'spaceId').map((c) => c.value)).toContain('space_broker');
    expect(eqOn('Contact', 'id').map((c) => c.value)).toContain('00000000-0000-4000-8000-000000000002');
  });
});

describe('GET /api/broker/lead-note', () => {
  it('404s a contact the brokerage cannot access', async () => {
    seed('Space', { data: { id: 'space_broker' } });
    seed('Contact', { data: null });
    seed('Contact', { data: null });
    seed('Contact', { data: null });

    const res = await GET(
      new NextRequest('http://localhost/api/broker/lead-note?contactId=00000000-0000-4000-8000-000000000001'),
    );
    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).not.toContain('Forbidden');
  });
});
