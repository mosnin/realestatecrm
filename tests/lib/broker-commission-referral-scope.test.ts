/**
 * Behavioral lock: referralUserId is validated through this brokerage's
 * membership roster, never a global User lookup. Replaces a source-grep
 * contract that broke when the route moved onto tenantTable().
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

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
const fromCalls: string[] = [];

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
  const passthrough = ['select', 'in', 'order', 'limit', 'insert', 'upsert', 'update'];
  for (const m of passthrough) chain[m] = vi.fn(() => chain);
  chain.eq = vi.fn((column: string, value: unknown) => {
    eqCalls.push({ table, column, value });
    return chain;
  });
  chain.maybeSingle = vi.fn(() => Promise.resolve(nextResult(table)));
  chain.single = vi.fn(() => Promise.resolve(nextResult(table)));
  (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(nextResult(table)).then(resolve);
  return chain;
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      fromCalls.push(table);
      return makeChain(table);
    }),
  },
}));

import { PATCH } from '@/app/api/broker/commissions/ledger/[id]/route';
import { requireBroker } from '@/lib/permissions';

const mockRequireBroker = vi.mocked(requireBroker);

const EXISTING_LEDGER = {
  id: 'led_1',
  brokerageId: 'bk_1',
  agentUserId: 'agent_1',
  dealId: 'deal_1',
  closedAt: '2026-01-01T00:00:00.000Z',
  dealValue: 500000,
  agentRate: 50,
  brokerRate: 50,
  referralRate: 0,
  referralUserId: null,
  agentAmount: 250000,
  brokerAmount: 250000,
  referralAmount: 0,
  status: 'pending',
  payoutAt: null,
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(tableQueues)) delete tableQueues[k];
  eqCalls.length = 0;
  fromCalls.length = 0;
  mockRequireBroker.mockResolvedValue({
    membership: { id: 'mem_1', role: 'broker_owner' },
    brokerage: { id: 'bk_1', ownerId: 'owner_1' },
    dbUserId: 'user_1',
  } as never);
});

describe('broker commission referral scope', () => {
  it('validates referral users through brokerage membership, not a global User lookup', async () => {
    seed('CommissionLedger', { data: EXISTING_LEDGER });
    seed('BrokerageMembership', { data: null });

    const req = new NextRequest('http://localhost/api/broker/commissions/ledger/led_1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referralUserId: 'user_other_brokerage' }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'led_1' }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found in brokerage/i);
    expect(JSON.stringify(body)).not.toMatch(/ssn|555-|VICTIM|user_other_brokerage@/i);

    expect(fromCalls).toContain('BrokerageMembership');
    expect(fromCalls).not.toContain('User');
    expect(
      eqCalls.some((c) => c.table === 'BrokerageMembership' && c.column === 'brokerageId' && c.value === 'bk_1'),
    ).toBe(true);
    expect(
      eqCalls.some(
        (c) => c.table === 'BrokerageMembership' && c.column === 'userId' && c.value === 'user_other_brokerage',
      ),
    ).toBe(true);
  });
});
