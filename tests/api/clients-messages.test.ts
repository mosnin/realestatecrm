/**
 * Client-portal messaging — ownership and fail-closed writes.
 *
 * A verified client can list/send messages only for a Contact they own
 * (clientOwnsContact). A foreign contactId must 404 (not 403) so the route
 * is not an existence oracle, and must not insert a ClientMessage.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { getClientUser, clientOwnsContact, checkRateLimit, sendClientNotification } = vi.hoisted(
  () => ({
    getClientUser: vi.fn(),
    clientOwnsContact: vi.fn(),
    checkRateLimit: vi.fn(),
    sendClientNotification: vi.fn(),
  }),
);

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
  chain.maybeSingle = vi.fn(() => next());
  chain.single = vi.fn(() => next());
  (chain as { then: unknown }).then = (
    resolve: (v: Terminal) => unknown,
    reject?: (e: unknown) => unknown,
  ) => next().then(resolve, reject);
  return chain;
}

vi.mock('@/lib/client-auth', () => ({ getClientUser }));
vi.mock('@/lib/client-portal-data', () => ({ clientOwnsContact }));
vi.mock('@/lib/client-email', () => ({ sendClientNotification }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit,
  getClientIp: vi.fn(() => '127.0.0.1'),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn((table: string) => makeChain(table)) },
}));

import { GET, POST } from '@/app/api/clients/messages/route';

const VERIFIED = {
  id: 'cu_1',
  email: 'owner@example.com',
  name: 'Pat',
  emailVerifiedAt: '2026-01-01T00:00:00Z',
};

function getReq(contactId?: string) {
  const url = contactId
    ? `http://localhost/api/clients/messages?contactId=${contactId}`
    : 'http://localhost/api/clients/messages';
  return new NextRequest(url);
}

function postReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/clients/messages', {
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
  getClientUser.mockResolvedValue(VERIFIED);
  clientOwnsContact.mockResolvedValue(true);
  checkRateLimit.mockResolvedValue({ allowed: true });
  sendClientNotification.mockResolvedValue(undefined);
});

describe('GET /api/clients/messages', () => {
  it('401s when the portal session is missing or unverified', async () => {
    getClientUser.mockResolvedValue(null);
    expect((await GET(getReq('c1'))).status).toBe(401);

    getClientUser.mockResolvedValue({ ...VERIFIED, emailVerifiedAt: null });
    expect((await GET(getReq('c1'))).status).toBe(401);
    expect(clientOwnsContact).not.toHaveBeenCalled();
  });

  it('400s without contactId', async () => {
    const res = await GET(getReq());
    expect(res.status).toBe(400);
    expect(clientOwnsContact).not.toHaveBeenCalled();
  });

  it('404s a foreign contact and does not list or mark-read', async () => {
    clientOwnsContact.mockResolvedValue(false);
    const res = await GET(getReq('foreign'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
    expect(clientOwnsContact).toHaveBeenCalledWith('owner@example.com', 'foreign');
    expect(filterCalls.some((c) => c.table === 'ClientMessage')).toBe(false);
    expect(writes).toHaveLength(0);
  });

  it('lists the owned thread and marks realtor messages read in that space', async () => {
    queueFor('Contact').push({ data: { spaceId: 's1' } });
    queueFor('ClientMessage').push({
      data: [{ id: 'm1', senderType: 'realtor', body: 'hi', createdAt: '2026-01-01T00:00:00Z' }],
    });
    queueFor('ClientMessage').push({ data: null });

    const res = await GET(getReq('c1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      messages: [{ id: 'm1', senderType: 'realtor', body: 'hi', createdAt: '2026-01-01T00:00:00Z' }],
    });
    expect(filterCalls).toContainEqual({
      table: 'ClientMessage',
      method: 'eq',
      column: 'spaceId',
      value: 's1',
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
      value: 'realtor',
    });
  });
});

describe('POST /api/clients/messages', () => {
  it('does not insert when the contact is missing or owned by someone else', async () => {
    const missingFields = await POST(postReq({ body: 'hello' }));
    expect(missingFields.status).toBe(400);
    expect(inserts).toHaveLength(0);
    expect(clientOwnsContact).not.toHaveBeenCalled();

    clientOwnsContact.mockResolvedValue(false);
    const foreign = await POST(postReq({ contactId: 'c-other', body: 'hello' }));
    expect(foreign.status).toBe(404);
    expect(await foreign.json()).toEqual({ error: 'Not found' });
    expect(inserts).toHaveLength(0);
    expect(sendClientNotification).not.toHaveBeenCalled();
  });

  it('400s an over-long body before any write', async () => {
    const res = await POST(postReq({ contactId: 'c1', body: 'x'.repeat(2001) }));
    expect(res.status).toBe(400);
    expect(inserts).toHaveLength(0);
    expect(clientOwnsContact).not.toHaveBeenCalled();
  });

  it('inserts senderType client scoped to the contact spaceId', async () => {
    queueFor('Contact').push({
      data: { spaceId: 's1', Space: { ownerId: 'u1' } },
    });
    queueFor('ClientMessage').push({
      data: { id: 'm2', senderType: 'client', body: 'hello', createdAt: '2026-01-01T00:00:00Z' },
      error: null,
    });
    queueFor('User').push({ data: { email: 'realtor@example.com' } });

    const res = await POST(postReq({ contactId: 'c1', body: '  hello  ' }));
    expect(res.status).toBe(201);
    expect(inserts).toEqual([
      {
        table: 'ClientMessage',
        values: {
          contactId: 'c1',
          spaceId: 's1',
          senderType: 'client',
          body: 'hello',
        },
      },
    ]);
    expect(sendClientNotification).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'realtor@example.com' }),
    );
  });
});
