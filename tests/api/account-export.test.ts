/**
 * Route-level tests for GET /api/account/export — self-service GDPR portability.
 *
 * lib/data-export is already covered. This file proves the route:
 *   - derives spaceId from the session (there is no body to spoof)
 *   - rate-limits before the heavy fan-out
 *   - 404s without a workspace (no export, no audit)
 *   - returns an attachment with Cache-Control: no-store
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const {
  requireAuthMock,
  getSpaceForUserMock,
  checkRateLimitMock,
  auditMock,
  exportSpaceDataMock,
  dbState,
} = vi.hoisted(() => ({
  requireAuthMock: vi.fn(async () => ({ userId: 'clerk_1' })),
  getSpaceForUserMock: vi.fn(async () => ({
    id: 'sp_session',
    slug: 'acme',
    name: 'Acme Realty',
    emoji: null,
    ownerId: 'user_db_1',
    createdAt: '2026-01-01T00:00:00.000Z',
    brokerageId: null,
  })),
  checkRateLimitMock: vi.fn(async () => ({ allowed: true })),
  auditMock: vi.fn(async () => undefined),
  exportSpaceDataMock: vi.fn(async () => ({ Contact: [{ id: 'c1', email: 'a@b.com' }] })),
  dbState: {
    ownerRow: {
      id: 'user_db_1',
      email: 'owner@acme.com',
      name: 'Owner',
    } as Record<string, unknown> | null,
  },
}));

vi.mock('@/lib/api-auth', () => ({ requireAuth: requireAuthMock }));
vi.mock('@/lib/space', () => ({ getSpaceForUser: getSpaceForUserMock }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: checkRateLimitMock }));
vi.mock('@/lib/audit', () => ({ audit: auditMock }));
vi.mock('@/lib/data-export', () => ({ exportSpaceData: exportSpaceDataMock }));
vi.mock('@/lib/supabase', () => {
  function chain(): Record<string, unknown> {
    const c: Record<string, unknown> = {};
    c.select = () => c;
    c.eq = () => c;
    c.maybeSingle = async () => ({ data: dbState.ownerRow, error: null });
    return c;
  }
  return { supabase: { from: () => chain() } };
});

import { GET } from '@/app/api/account/export/route';

function call() {
  return GET(new Request('http://localhost/api/account/export') as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthMock.mockResolvedValue({ userId: 'clerk_1' });
  getSpaceForUserMock.mockResolvedValue({
    id: 'sp_session',
    slug: 'acme',
    name: 'Acme Realty',
    emoji: null,
    ownerId: 'user_db_1',
    createdAt: '2026-01-01T00:00:00.000Z',
    brokerageId: null,
  });
  checkRateLimitMock.mockResolvedValue({ allowed: true });
  exportSpaceDataMock.mockResolvedValue({ Contact: [{ id: 'c1', email: 'a@b.com' }] });
  dbState.ownerRow = { id: 'user_db_1', email: 'owner@acme.com', name: 'Owner' };
});

describe('GET /api/account/export', () => {
  it('returns the auth response and does not export', async () => {
    requireAuthMock.mockResolvedValueOnce(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    );

    const res = await call();

    expect(res.status).toBe(401);
    expect(checkRateLimitMock).not.toHaveBeenCalled();
    expect(exportSpaceDataMock).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('429s on rate-limit before resolving the space or reading tenant tables', async () => {
    checkRateLimitMock.mockResolvedValueOnce({ allowed: false });

    const res = await call();

    expect(res.status).toBe(429);
    expect(checkRateLimitMock).toHaveBeenCalledWith('account:export:clerk_1', 5, 3600);
    expect(getSpaceForUserMock).not.toHaveBeenCalled();
    expect(exportSpaceDataMock).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('404s without a workspace and does not export', async () => {
    getSpaceForUserMock.mockResolvedValueOnce(null);

    const res = await call();

    expect(res.status).toBe(404);
    expect(exportSpaceDataMock).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('exports the session space and returns a no-store attachment', async () => {
    const res = await call();
    const payload = (await res.json()) as {
      spaceId: string;
      data: { space: { id: string }; account: { email: string }; Contact: unknown[] };
    };

    expect(res.status).toBe(200);
    expect(exportSpaceDataMock).toHaveBeenCalledTimes(1);
    expect(exportSpaceDataMock).toHaveBeenCalledWith('sp_session');
    expect(payload.spaceId).toBe('sp_session');
    expect(payload.data.space.id).toBe('sp_session');
    expect(payload.data.account.email).toBe('owner@acme.com');
    expect(payload.data.Contact).toEqual([{ id: 'c1', email: 'a@b.com' }]);

    expect(res.headers.get('Content-Type')).toMatch(/application\/json/);
    expect(res.headers.get('Content-Disposition')).toMatch(
      /attachment; filename="chippi-export-acme-\d{4}-\d{2}-\d{2}\.json"/,
    );
    expect(res.headers.get('Cache-Control')).toBe('no-store');

    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorClerkId: 'clerk_1',
        action: 'ACCESS',
        resource: 'Space',
        resourceId: 'sp_session',
        spaceId: 'sp_session',
        metadata: { kind: 'data-export' },
      }),
    );
  });
});
