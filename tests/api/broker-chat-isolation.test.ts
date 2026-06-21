/**
 * Broker Chippi isolation regressions.
 *
 * A broker conversation id is only valid inside the caller's brokerage. These
 * tests cross that boundary with a foreign BrokerConversation and assert that
 * broker-gated routes do not leak, rename, or delete another brokerage's chat.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 99 })),
}));

const BROKER_CTX = {
  brokerage: { id: 'bk_own', ownerId: 'u_owner', name: 'Own Brokerage' },
  membership: { id: 'mem_1', brokerageId: 'bk_own', userId: 'u_1', role: 'broker_owner' },
  dbUserId: 'u_1',
  brokerRole: 'broker_owner',
};

vi.mock('@/lib/agent/broker-context', () => ({
  resolveBrokerContext: vi.fn(async () => BROKER_CTX),
}));

type TableResult = { data?: unknown; error?: unknown };
const tableQueues: Record<string, TableResult[]> = {};
const eqCalls: { table: string; column: string; value: unknown }[] = [];
const updateCalls: { table: string; payload: unknown }[] = [];
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
  for (const method of ['select', 'order', 'limit', 'insert', 'in']) {
    chain[method] = vi.fn(() => chain);
  }
  chain.eq = vi.fn((column: string, value: unknown) => {
    eqCalls.push({ table, column, value });
    return chain;
  });
  chain.update = vi.fn((payload: unknown) => {
    updateCalls.push({ table, payload });
    return chain;
  });
  chain.delete = vi.fn(() => {
    deleteCalls.push({ table });
    return chain;
  });
  chain.maybeSingle = vi.fn(() => Promise.resolve(nextResult(table)));
  chain.single = vi.fn(() => Promise.resolve(nextResult(table)));
  (chain as { then: unknown }).then = (resolve: (v: TableResult) => unknown) =>
    Promise.resolve(nextResult(table)).then(resolve);
  return chain;
}

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn((table: string) => makeChain(table)) },
}));

import { GET as getBrokerMessages } from '@/app/api/ai/broker-messages/route';
import { GET as getBrokerConversations } from '@/app/api/ai/broker-conversations/route';
import {
  PATCH as patchBrokerConversation,
  DELETE as deleteBrokerConversation,
} from '@/app/api/ai/broker-conversations/[id]/route';

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(tableQueues)) delete tableQueues[key];
  eqCalls.length = 0;
  updateCalls.length = 0;
  deleteCalls.length = 0;
});

function request(url: string, body?: Record<string, unknown>) {
  return {
    nextUrl: new URL(url),
    json: async () => body ?? {},
  };
}

function messagesRequest(conversationId: string) {
  return request(
    `http://localhost/api/ai/broker-messages?conversationId=${encodeURIComponent(conversationId)}`,
  ) as unknown as Parameters<typeof getBrokerMessages>[0];
}

function idRequest(body?: Record<string, unknown>) {
  return request(
    'http://localhost/api/ai/broker-conversations/c_foreign',
    body,
  ) as unknown as Parameters<typeof patchBrokerConversation>[0];
}

const foreignParams = { params: Promise.resolve({ id: 'c_foreign' }) };
const ownParams = { params: Promise.resolve({ id: 'c_own' }) };


describe('GET /api/ai/broker-conversations', () => {
  it('scopes sidebar preview message reads by brokerageId', async () => {
    seed('BrokerConversation', {
      data: [{ id: 'c_own', brokerageId: 'bk_own', title: 'Pipeline', updatedAt: '2026-01-02' }],
    });
    seed('BrokerMessage', {
      data: [{ conversationId: 'c_own', content: 'latest brokerage-scoped preview' }],
    });

    const res = await getBrokerConversations(
      request('http://localhost/api/ai/broker-conversations') as Parameters<
        typeof getBrokerConversations
      >[0],
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      expect.objectContaining({ id: 'c_own', preview: 'latest brokerage-scoped preview' }),
    ]);
    expect(eqCalls).toContainEqual({ table: 'BrokerConversation', column: 'brokerageId', value: 'bk_own' });
    expect(eqCalls).toContainEqual({ table: 'BrokerMessage', column: 'brokerageId', value: 'bk_own' });
  });
});

describe('GET /api/ai/broker-messages', () => {
  it('404s a BrokerConversation from another brokerage and returns no messages', async () => {
    seed('BrokerConversation', { data: { id: 'c_foreign', brokerageId: 'bk_other' } });
    seed('BrokerMessage', { data: [{ id: 'm_secret', content: 'foreign secret' }] });

    const res = await getBrokerMessages(messagesRequest('c_foreign'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain('foreign secret');
  });

  it('serves own brokerage messages and scopes the child read by brokerageId', async () => {
    seed('BrokerConversation', { data: { id: 'c_own', brokerageId: 'bk_own' } });
    seed('BrokerMessage', {
      data: [{ id: 'm_1', role: 'assistant', content: 'ok', blocks: null, createdAt: '2026-01-01' }],
    });

    const res = await getBrokerMessages(messagesRequest('c_own'));
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(1);
    expect(eqCalls).toContainEqual({ table: 'BrokerMessage', column: 'brokerageId', value: 'bk_own' });
  });
});

describe('PATCH /api/ai/broker-conversations/[id]', () => {
  it('404s renaming a foreign brokerage conversation', async () => {
    seed('BrokerConversation', { data: { id: 'c_foreign', brokerageId: 'bk_other' } });

    const res = await patchBrokerConversation(idRequest({ title: 'hijacked' }), foreignParams);
    expect(res.status).toBe(404);
    expect(updateCalls).toHaveLength(0);
  });

  it('renames an own brokerage conversation with brokerageId scope', async () => {
    seed('BrokerConversation', { data: { id: 'c_own', brokerageId: 'bk_own' } });
    seed('BrokerConversation', { data: { id: 'c_own', brokerageId: 'bk_own', title: 'Renamed' } });

    const res = await patchBrokerConversation(idRequest({ title: 'Renamed' }), ownParams);
    expect(res.status).toBe(200);
    expect(eqCalls).toContainEqual({ table: 'BrokerConversation', column: 'brokerageId', value: 'bk_own' });
  });
});

describe('DELETE /api/ai/broker-conversations/[id]', () => {
  it('404s deleting a foreign brokerage conversation', async () => {
    seed('BrokerConversation', { data: { id: 'c_foreign', brokerageId: 'bk_other' } });

    const res = await deleteBrokerConversation(idRequest(), foreignParams);
    expect(res.status).toBe(404);
    expect(deleteCalls).toHaveLength(0);
  });

  it('deletes an own brokerage conversation with brokerageId scope', async () => {
    seed('BrokerConversation', { data: { id: 'c_own', brokerageId: 'bk_own' } });
    seed('BrokerConversation', { data: null });

    const res = await deleteBrokerConversation(idRequest(), ownParams);
    expect(res.status).toBe(200);
    expect(deleteCalls).toContainEqual({ table: 'BrokerConversation' });
    expect(eqCalls).toContainEqual({ table: 'BrokerConversation', column: 'brokerageId', value: 'bk_own' });
  });
});
