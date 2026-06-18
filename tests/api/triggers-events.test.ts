/**
 * Route-level test for `GET /api/triggers/events` — the activity feed's
 * data source.
 *
 * What we guard:
 *   - Auth + space gate (401, 403) — and no DB read happens on failure.
 *   - Space scoping: listEvents is called with the CALLER's space.id, never a
 *     client-supplied id. This is the privilege boundary — a realtor must only
 *     ever read their own space's events.
 *   - Response shape: `{ events: [...] }`, projecting exactly what the feed
 *     renders (no raw payload leak).
 *   - Query params: limit clamping (1..100, default 50) + before/toolkit/
 *     connectionId pass-through.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/space', () => ({
  getSpaceForUser: vi.fn(),
}));

const { listEventsMock } = vi.hoisted(() => ({ listEventsMock: vi.fn() }));
vi.mock('@/lib/integrations/events', () => ({
  listEvents: listEventsMock,
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { GET } from '@/app/api/triggers/events/route';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

const mockRequireAuth = vi.mocked(requireAuth);
const mockGetSpaceForUser = vi.mocked(getSpaceForUser);

const SPACE = {
  id: 'space_1',
  slug: 'jane',
  name: 'Jane Realty',
  emoji: null,
  ownerId: 'user_db_1',
  brokerageId: null,
  createdAt: '2026-04-01T00:00:00.000Z',
  stripeSubscriptionStatus: 'active',
} as unknown as NonNullable<Awaited<ReturnType<typeof getSpaceForUser>>>;

const SAMPLE_EVENT = {
  id: 'evt_1',
  connectionId: 'conn_1',
  toolkit: 'gmail',
  eventType: 'GMAIL_NEW_GMAIL_MESSAGE',
  title: 'Re: 123 Main St offer',
  actor: 'buyer@example.com',
  snippet: 'Sounds great, when can we tour?',
  occurredAt: '2026-06-16T12:00:00.000Z',
  status: 'captured' as const,
  deliveryId: 'delivery_abc',
};

function makeReq(query = '') {
  return new NextRequest(`http://localhost/api/triggers/events${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue({ userId: 'user_1' });
  mockGetSpaceForUser.mockResolvedValue(SPACE);
  listEventsMock.mockResolvedValue([]);
});

describe('GET /api/triggers/events', () => {
  it('401 when unauthenticated and never touches the DB', async () => {
    const unauth = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    mockRequireAuth.mockResolvedValue(unauth);

    const res = await GET(makeReq());

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(listEventsMock).not.toHaveBeenCalled();
  });

  it('403 when the caller has no space', async () => {
    mockGetSpaceForUser.mockResolvedValue(null);
    const res = await GET(makeReq());
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body).toEqual({ error: 'Forbidden' });
    expect(listEventsMock).not.toHaveBeenCalled();
  });

  it('reads events scoped to the caller\'s space, not a client-supplied id', async () => {
    // Privilege boundary: even if a client tried to smuggle a spaceId in the
    // query, the route only ever passes the resolved space.id.
    await GET(makeReq('?spaceId=someone_elses_space'));
    expect(listEventsMock).toHaveBeenCalledTimes(1);
    expect(listEventsMock.mock.calls[0][0]).toMatchObject({ spaceId: SPACE.id });
  });

  it('returns { events } with the feed-facing shape', async () => {
    listEventsMock.mockResolvedValue([SAMPLE_EVENT]);
    const res = await GET(makeReq());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ events: [SAMPLE_EVENT] });
    // The row carries the fields the feed renders — and no raw payload blob.
    const row = body.events[0];
    expect(row).not.toHaveProperty('payload');
    expect(row).not.toHaveProperty('spaceId');
    expect(row.toolkit).toBe('gmail');
    expect(row.status).toBe('captured');
  });

  it('defaults limit to 50 when omitted', async () => {
    await GET(makeReq());
    expect(listEventsMock.mock.calls[0][0]).toMatchObject({ limit: 50 });
  });

  it('clamps limit to a max of 100', async () => {
    await GET(makeReq('?limit=5000'));
    expect(listEventsMock.mock.calls[0][0]).toMatchObject({ limit: 100 });
  });

  it('falls back to the default limit on a garbage limit value', async () => {
    await GET(makeReq('?limit=notanumber'));
    expect(listEventsMock.mock.calls[0][0]).toMatchObject({ limit: 50 });
  });

  it('passes before / toolkit / connectionId filters through to listEvents', async () => {
    await GET(
      makeReq('?before=2026-06-16T00:00:00.000Z&toolkit=slack&connectionId=conn_9&limit=25'),
    );
    expect(listEventsMock.mock.calls[0][0]).toMatchObject({
      spaceId: SPACE.id,
      limit: 25,
      before: '2026-06-16T00:00:00.000Z',
      toolkit: 'slack',
      connectionId: 'conn_9',
    });
  });

  it('omits optional filters when not provided', async () => {
    await GET(makeReq());
    const arg = listEventsMock.mock.calls[0][0];
    expect(arg.before).toBeUndefined();
    expect(arg.toolkit).toBeUndefined();
    expect(arg.connectionId).toBeUndefined();
  });
});
