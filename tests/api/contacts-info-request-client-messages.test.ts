/**
 * Realtor-side client-portal writes — requireContactAccess + tenant insert.
 *
 * POST /api/contacts/[id]/info-request and GET/POST
 * /api/contacts/[id]/client-messages sit behind requireContactAccess. A
 * realtor who does not own the contact must get a 4xx and must not insert
 * a ClientInfoRequest / ClientMessage into any tenant. Allowed writes must
 * carry the caller's spaceId (tenantTable rejects a mismatched payload).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const { requireContactAccess, checkRateLimit, sendClientNotification } = vi.hoisted(() => ({
  requireContactAccess: vi.fn(),
  checkRateLimit: vi.fn(),
  sendClientNotification: vi.fn(),
}));

type Terminal = { data?: unknown; error?: unknown };
const queues: Record<string, Terminal[]> = {};
const filterCalls: { table: string; method: string; column: string; value: unknown }[] = [];
const inserts: { table: string; values: Record<string, unknown> }[] = [];
const writes: { table: string; values: Record<string, unknown> }[] = [];

function queueFor(table: string): Terminal[] {
  if (!queues[table]) queues[table] = [];
  return queues[table];
}

function makeChain(table: string) {
  const chain: Record<string, unknown> = {};
  const next = (): Promise<Terminal> => Promise.resolve(queueFor(table).shift() ?? { data: null });
  chain.select = vi.fn(() => chain);
  chain.insert = vi.fn((values: Record<string, unknown>) => {
    inserts.push({ table, values });
    return chain;
  });
  chain.update = vi.fn((values: Record<string, unknown>) => {
    writes.push({ table, values });
    return chain;
  });
  for (const method of ['eq', 'neq', 'ilike'] as const) {
    chain[method] = vi.fn((column: string, value: unknown) => {
      filterCalls.push({ table, method, column, value });
      return chain;
    });
  }
  chain.is = vi.fn((column: string, value: unknown) => {
    filterCalls.push({ table, method: 'is', column, value });
    return chain;
  });
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(() => next());
  chain.single = vi.fn(() => next());
  (chain as { then: unknown }).then = (
    resolve: (v: Terminal) => unknown,
    reject?: (e: unknown) => unknown,
  ) => next().then(resolve, reject);
  return chain;
}

vi.mock('@/lib/api-auth', () => ({ requireContactAccess }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit,
  getClientIp: vi.fn(() => '127.0.0.1'),
}));
vi.mock('@/lib/client-email', () => ({ sendClientNotification }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn((table: string) => makeChain(table)) },
}));

import { POST as postInfoRequest } from '@/app/api/contacts/[id]/info-request/route';
import {
  GET as getClientMessages,
  POST as postClientMessages,
} from '@/app/api/contacts/[id]/client-messages/route';

const SPACE = { id: 'space_1', name: 'Acme Realty', slug: 'acme', ownerId: 'u1' };
const AUTH = { userId: 'clerk_1', space: SPACE };
const DENIED = NextResponse.json({ error: 'Not found' }, { status: 404 });

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function jsonReq(url: string, body: Record<string, unknown>) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(queues)) delete queues[k];
  filterCalls.length = 0;
  inserts.length = 0;
  writes.length = 0;
  requireContactAccess.mockResolvedValue(AUTH);
  checkRateLimit.mockResolvedValue({ allowed: true });
  sendClientNotification.mockResolvedValue(undefined);
});

describe('POST /api/contacts/[id]/info-request', () => {
  it('does not insert when requireContactAccess denies the contact', async () => {
    requireContactAccess.mockResolvedValue(DENIED);
    const res = await postInfoRequest(
      jsonReq('http://localhost/api/contacts/c_foreign/info-request', { message: 'Need W2' }),
      params('c_foreign'),
    );
    expect(res.status).toBe(404);
    expect(inserts).toHaveLength(0);
    expect(sendClientNotification).not.toHaveBeenCalled();
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it('400s an empty or over-long message and does not write', async () => {
    const empty = await postInfoRequest(
      jsonReq('http://localhost/api/contacts/c1/info-request', { message: '   ' }),
      params('c1'),
    );
    expect(empty.status).toBe(400);
    expect(inserts).toHaveLength(0);

    const tooLong = await postInfoRequest(
      jsonReq('http://localhost/api/contacts/c1/info-request', { message: 'x'.repeat(1001) }),
      params('c1'),
    );
    expect(tooLong.status).toBe(400);
    expect(inserts).toHaveLength(0);
  });

  it('429s when rate-limited and does not insert', async () => {
    checkRateLimit.mockResolvedValue({ allowed: false });
    const res = await postInfoRequest(
      jsonReq('http://localhost/api/contacts/c1/info-request', { message: 'Need W2' }),
      params('c1'),
    );
    expect(res.status).toBe(429);
    expect(inserts).toHaveLength(0);
  });

  it('inserts a pending request scoped to the caller spaceId', async () => {
    queueFor('ClientInfoRequest').push({
      data: { id: 'r1', message: 'Need W2', status: 'pending', response: null },
      error: null,
    });
    queueFor('Contact').push({ data: { email: 'client@example.com' } });

    const res = await postInfoRequest(
      jsonReq('http://localhost/api/contacts/c1/info-request', { message: '  Need W2  ' }),
      params('c1'),
    );
    expect(res.status).toBe(201);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toEqual({
      table: 'ClientInfoRequest',
      values: {
        contactId: 'c1',
        spaceId: 'space_1',
        message: 'Need W2',
        status: 'pending',
      },
    });
    expect(filterCalls).toContainEqual({
      table: 'Contact',
      method: 'eq',
      column: 'spaceId',
      value: 'space_1',
    });
    expect(sendClientNotification).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'client@example.com' }),
    );
  });
});

describe('GET/POST /api/contacts/[id]/client-messages', () => {
  it('GET does not list or mark-read when the contact is not owned', async () => {
    requireContactAccess.mockResolvedValue(DENIED);
    const res = await getClientMessages(
      new NextRequest('http://localhost/api/contacts/c_foreign/client-messages'),
      params('c_foreign'),
    );
    expect(res.status).toBe(404);
    expect(filterCalls.some((c) => c.table === 'ClientMessage')).toBe(false);
    expect(writes).toHaveLength(0);
  });

  it('GET lists the thread scoped to spaceId + contactId and marks client messages read', async () => {
    queueFor('ClientMessage').push({
      data: [{ id: 'm1', senderType: 'client', body: 'hi', createdAt: '2026-01-01T00:00:00Z' }],
    });
    queueFor('ClientMessage').push({ data: null });

    const res = await getClientMessages(
      new NextRequest('http://localhost/api/contacts/c1/client-messages'),
      params('c1'),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      messages: [{ id: 'm1', senderType: 'client', body: 'hi', createdAt: '2026-01-01T00:00:00Z' }],
    });
    expect(filterCalls).toContainEqual({
      table: 'ClientMessage',
      method: 'eq',
      column: 'spaceId',
      value: 'space_1',
    });
    expect(filterCalls).toContainEqual({
      table: 'ClientMessage',
      method: 'eq',
      column: 'contactId',
      value: 'c1',
    });
    expect(writes).toHaveLength(1);
    expect(writes[0]?.table).toBe('ClientMessage');
    expect(writes[0]?.values).toMatchObject({ readAt: expect.any(String) });
    expect(filterCalls).toContainEqual({
      table: 'ClientMessage',
      method: 'eq',
      column: 'senderType',
      value: 'client',
    });
  });

  it('POST does not insert when requireContactAccess denies the contact', async () => {
    requireContactAccess.mockResolvedValue(DENIED);
    const res = await postClientMessages(
      jsonReq('http://localhost/api/contacts/c_foreign/client-messages', { body: 'hello' }),
      params('c_foreign'),
    );
    expect(res.status).toBe(404);
    expect(inserts).toHaveLength(0);
    expect(sendClientNotification).not.toHaveBeenCalled();
  });

  it('POST 400s an empty or over-long body and does not write', async () => {
    const empty = await postClientMessages(
      jsonReq('http://localhost/api/contacts/c1/client-messages', { body: '  ' }),
      params('c1'),
    );
    expect(empty.status).toBe(400);
    expect(inserts).toHaveLength(0);

    const tooLong = await postClientMessages(
      jsonReq('http://localhost/api/contacts/c1/client-messages', { body: 'x'.repeat(2001) }),
      params('c1'),
    );
    expect(tooLong.status).toBe(400);
    expect(inserts).toHaveLength(0);
  });

  it('POST inserts senderType realtor scoped to the caller spaceId', async () => {
    queueFor('ClientMessage').push({
      data: { id: 'm2', senderType: 'realtor', body: 'hello', createdAt: '2026-01-01T00:00:00Z' },
      error: null,
    });
    queueFor('Contact').push({ data: { email: null } });

    const res = await postClientMessages(
      jsonReq('http://localhost/api/contacts/c1/client-messages', { body: '  hello  ' }),
      params('c1'),
    );
    expect(res.status).toBe(201);
    expect(inserts).toEqual([
      {
        table: 'ClientMessage',
        values: {
          contactId: 'c1',
          spaceId: 'space_1',
          senderType: 'realtor',
          body: 'hello',
        },
      },
    ]);
    expect(sendClientNotification).not.toHaveBeenCalled();
  });
});
