/**
 * Behavioral lock: an assigned brokerage lead must 409 BEFORE any
 * DealContact / Contact delete. Replaces a source-grep contract that
 * broke when the route wrapped lookups with unscoped().
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/permissions', () => ({
  requireBroker: vi.fn(),
  canManageLeads: vi.fn(() => true),
}));

vi.mock('@/lib/space', () => ({
  getSpaceByOwnerId: vi.fn(),
}));

vi.mock('@/lib/vectorize', () => ({
  deleteContactVector: vi.fn(async () => undefined),
}));

vi.mock('@/lib/storage', () => ({
  deleteObjectsBestEffort: vi.fn(async () => ({ ok: 0, failed: [] })),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

type TableResult = { data?: unknown; error?: unknown };
const tableQueues: Record<string, TableResult[]> = {};
const deleteCalls: { table: string }[] = [];

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
  const passthrough = ['select', 'eq', 'in', 'order', 'limit', 'insert', 'upsert'];
  for (const m of passthrough) chain[m] = vi.fn(() => chain);
  chain.delete = vi.fn(() => {
    deleteCalls.push({ table });
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

import { DELETE } from '@/app/api/broker/leads/[id]/route';
import { requireBroker } from '@/lib/permissions';
import { getSpaceByOwnerId } from '@/lib/space';

const mockRequireBroker = vi.mocked(requireBroker);
const mockGetSpaceByOwnerId = vi.mocked(getSpaceByOwnerId);

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(tableQueues)) delete tableQueues[k];
  deleteCalls.length = 0;
  mockRequireBroker.mockResolvedValue({
    membership: { role: 'broker_owner' },
    brokerage: { id: 'bk_1', ownerId: 'owner_1' },
    dbUserId: 'user_1',
  } as never);
  mockGetSpaceByOwnerId.mockResolvedValue({ id: 'space_broker' } as never);
});

describe('broker lead delete boundary', () => {
  it('refuses to delete assigned leads before destructive cleanup', async () => {
    seed('Contact', {
      data: { id: 'lead_1', spaceId: 'space_broker', tags: ['assigned', 'application-link'] },
    });

    const res = await DELETE(new NextRequest('http://localhost/api/broker/leads/lead_1', { method: 'DELETE' }), {
      params: Promise.resolve({ id: 'lead_1' }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/unassign this lead/i);
    expect(deleteCalls.filter((d) => d.table === 'DealContact')).toHaveLength(0);
    expect(deleteCalls.filter((d) => d.table === 'Contact')).toHaveLength(0);
  });
});
