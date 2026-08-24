/**
 * Client-portal info-request — ownership and fail-closed answers.
 *
 * A verified client can list/answer requests only for a Contact they own.
 * A foreign contact or request id must 404 (not 403) so the route is not an
 * existence oracle, and an already-answered row must not be overwritten.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  getClientUser,
  clientOwnsContact,
  checkRateLimit,
  sendClientNotification,
} = vi.hoisted(() => ({
  getClientUser: vi.fn(),
  clientOwnsContact: vi.fn(),
  checkRateLimit: vi.fn(),
  sendClientNotification: vi.fn(),
}));

type Terminal = { data?: unknown; error?: unknown };
const queues: Record<string, Terminal[]> = {};
const filterCalls: { table: string; method: string; column: string; value: unknown }[] = [];
const writes: { table: string; values: Record<string, unknown> }[] = [];

function queueFor(table: string): Terminal[] {
  if (!queues[table]) queues[table] = [];
  return queues[table];
}

function makeChain(table: string) {
  const chain: Record<string, unknown> = {};
  const next = (): Promise<Terminal> => Promise.resolve(queueFor(table).shift() ?? { data: null });
  chain.select = vi.fn(() => chain);
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
  chain.order = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(() => next());
  (chain as { then: unknown }).then = (resolve: (v: Terminal) => unknown, reject?: (e: unknown) => unknown) =>
    next().then(resolve, reject);
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

import { GET, POST } from '@/app/api/clients/info-request/route';

const VERIFIED = {
  id: 'cu_1',
  email: 'owner@example.com',
  name: 'Pat',
  emailVerifiedAt: '2026-01-01T00:00:00Z',
};

function getReq(contactId?: string) {
  const url = contactId
    ? `http://localhost/api/clients/info-request?contactId=${contactId}`
    : 'http://localhost/api/clients/info-request';
  return new NextRequest(url);
}

function postReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/clients/info-request', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(queues)) delete queues[k];
  filterCalls.length = 0;
  writes.length = 0;
  getClientUser.mockResolvedValue(VERIFIED);
  clientOwnsContact.mockResolvedValue(true);
  checkRateLimit.mockResolvedValue({ allowed: true });
  sendClientNotification.mockResolvedValue(undefined);
});

describe('GET /api/clients/info-request', () => {
  it('401s when the portal session is missing or unverified', async () => {
    getClientUser.mockResolvedValue(null);
    expect((await GET(getReq('c1'))).status).toBe(401);

    getClientUser.mockResolvedValue({ ...VERIFIED, emailVerifiedAt: null });
    expect((await GET(getReq('c1'))).status).toBe(401);
    expect(clientOwnsContact).not.toHaveBeenCalled();
  });

  it('404s a foreign contact and does not list requests', async () => {
    clientOwnsContact.mockResolvedValue(false);
    const res = await GET(getReq('foreign'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
    expect(clientOwnsContact).toHaveBeenCalledWith('owner@example.com', 'foreign');
    expect(filterCalls.some((c) => c.table === 'ClientInfoRequest')).toBe(false);
  });

  it('lists only non-dismissed requests for a contact the client owns', async () => {
    queueFor('ClientInfoRequest').push({
      data: [{ id: 'r1', message: 'W2', status: 'pending', response: null }],
    });
    const res = await GET(getReq('c1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      requests: [{ id: 'r1', message: 'W2', status: 'pending', response: null }],
    });
    expect(filterCalls).toContainEqual({
      table: 'ClientInfoRequest',
      method: 'eq',
      column: 'contactId',
      value: 'c1',
    });
    expect(filterCalls).toContainEqual({
      table: 'ClientInfoRequest',
      method: 'neq',
      column: 'status',
      value: 'dismissed',
    });
  });
});

describe('POST /api/clients/info-request', () => {
  it('does not write when the request is missing or owned by someone else', async () => {
    queueFor('ClientInfoRequest').push({ data: null });
    const missing = await POST(postReq({ id: 'r-missing', response: 'here' }));
    expect(missing.status).toBe(404);
    expect(writes).toHaveLength(0);

    queueFor('ClientInfoRequest').push({
      data: { id: 'r-foreign', contactId: 'c-other', status: 'pending', spaceId: 's1' },
    });
    clientOwnsContact.mockResolvedValue(false);
    const foreign = await POST(postReq({ id: 'r-foreign', response: 'here' }));
    expect(foreign.status).toBe(404);
    expect(await foreign.json()).toEqual({ error: 'Not found' });
    expect(writes).toHaveLength(0);
    expect(sendClientNotification).not.toHaveBeenCalled();
  });

  it('409s an already-answered row and leaves it untouched', async () => {
    queueFor('ClientInfoRequest').push({
      data: { id: 'r1', contactId: 'c1', status: 'fulfilled', spaceId: 's1' },
    });
    const res = await POST(postReq({ id: 'r1', response: 'second answer' }));
    expect(res.status).toBe(409);
    expect(writes).toHaveLength(0);
  });

  it('fulfills a pending request scoped to the row spaceId', async () => {
    queueFor('ClientInfoRequest').push({
      data: { id: 'r1', contactId: 'c1', status: 'pending', spaceId: 's1' },
    });
    queueFor('ClientInfoRequest').push({ data: null, error: null });
    queueFor('Space').push({ data: { ownerId: 'u1' } });
    queueFor('User').push({ data: { email: 'realtor@example.com' } });

    const res = await POST(postReq({ id: 'r1', response: '  W2 attached  ' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(writes).toHaveLength(1);
    expect(writes[0]?.table).toBe('ClientInfoRequest');
    expect(writes[0]?.values).toMatchObject({
      response: 'W2 attached',
      status: 'fulfilled',
    });
    expect(filterCalls).toContainEqual({
      table: 'ClientInfoRequest',
      method: 'eq',
      column: 'spaceId',
      value: 's1',
    });
    expect(filterCalls).toContainEqual({
      table: 'ClientInfoRequest',
      method: 'eq',
      column: 'id',
      value: 'r1',
    });
  });
});
