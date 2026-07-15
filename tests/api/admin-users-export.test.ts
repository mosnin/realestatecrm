/**
 * Route-level tests for GET /api/admin/users/[id]/export — the admin DSAR
 * export.
 *
 *   - authz: capability-gated on 'users:export'. super_admin allowed;
 *     a role lacking the capability (e.g. admin_readonly) → 403, no read.
 *   - audit: a successful export is logged via logAdminAction(action='dsar_export').
 *   - tenant correctness: the target user's OWN space is resolved and handed to
 *     the shared reader; a wrong/missing user → 404; a user with no workspace → 404.
 *
 * The shared reader (lib/data-export) is mocked here — it has its own coverage;
 * this test proves the route's auth / resolution / audit wiring.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { requireMock } = vi.hoisted(() => ({
  requireMock: vi.fn(async () => ({ clerkUserId: 'admin_clerk', adminRole: 'super_admin' })),
}));
vi.mock('@/lib/permissions', () => ({ requireAdminCapability: requireMock }));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({ userId: 'admin_clerk' })),
}));

const { logAdminActionMock } = vi.hoisted(() => ({
  logAdminActionMock: vi.fn(async (..._a: any[]) => undefined),
}));
vi.mock('@/lib/admin', () => ({ logAdminAction: logAdminActionMock }));

const { rateLimitMock } = vi.hoisted(() => ({
  rateLimitMock: vi.fn(async () => ({ allowed: true })),
}));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: rateLimitMock }));

const { exportSpaceDataMock } = vi.hoisted(() => ({
  exportSpaceDataMock: vi.fn(async (..._a: any[]) => ({ Contact: [{ id: 'c1' }], DealContact: [] })),
}));
vi.mock('@/lib/data-export', () => ({ exportSpaceData: exportSpaceDataMock }));

// ── Supabase double — User + Space single-row reads ─────────────────────────
const { dbState } = vi.hoisted(() => ({
  dbState: { rows: {} as Record<string, Record<string, unknown> | null> },
}));
vi.mock('@/lib/supabase', () => {
  function chain(table: string): any {
    const c: any = {
      select: () => c,
      eq: () => c,
      limit: () => c,
      maybeSingle: async () => ({ data: dbState.rows[table] ?? null, error: null }),
    };
    return c;
  }
  return { supabase: { from: (t: string) => chain(t) } };
});

import { GET } from '@/app/api/admin/users/[id]/export/route';

const UID = '11111111-1111-1111-1111-111111111111';

function call(id: string = UID) {
  const req = new Request(`http://localhost/api/admin/users/${id}/export`, { method: 'GET' });
  return GET(req as any, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  dbState.rows = {};
  requireMock.mockResolvedValue({ clerkUserId: 'admin_clerk', adminRole: 'super_admin' } as any);
  rateLimitMock.mockResolvedValue({ allowed: true } as any);
  exportSpaceDataMock.mockResolvedValue({ Contact: [{ id: 'c1' }], DealContact: [] } as any);
});

describe('authz', () => {
  it('allows a super_admin (users:export capability) → 200', async () => {
    dbState.rows['User'] = { id: UID, clerkId: 'u_clerk', email: 'r@b.com', name: 'R', createdAt: 't' };
    dbState.rows['Space'] = { id: 'sp1', slug: 'acme', name: 'Acme', ownerId: UID, createdAt: 't' };
    const res = await call();
    expect(res.status).toBe(200);
    expect(exportSpaceDataMock).toHaveBeenCalledWith('sp1');
  });

  it('403s when the admin role lacks the users:export capability', async () => {
    // admin_readonly → requireAdminCapability throws.
    requireMock.mockRejectedValueOnce(new Error("Forbidden: capability 'users:export'"));
    dbState.rows['User'] = { id: UID, clerkId: 'u_clerk', email: 'r@b.com' };
    const res = await call();
    expect(res.status).toBe(403);
    expect(exportSpaceDataMock).not.toHaveBeenCalled();
    expect(logAdminActionMock).not.toHaveBeenCalled();
  });
});

describe('audit', () => {
  it('logs the export as dsar_export with the target + space', async () => {
    dbState.rows['User'] = { id: UID, clerkId: 'u_clerk', email: 'r@b.com', name: 'R', createdAt: 't' };
    dbState.rows['Space'] = { id: 'sp1', slug: 'acme', name: 'Acme', ownerId: UID, createdAt: 't' };
    await call();
    expect(logAdminActionMock).toHaveBeenCalledTimes(1);
    expect(logAdminActionMock.mock.calls[0][0]).toMatchObject({
      actor: 'admin_clerk',
      action: 'dsar_export',
      target: UID,
    });
    expect(logAdminActionMock.mock.calls[0][0].details).toMatchObject({
      spaceId: 'sp1',
      email: 'r@b.com',
    });
  });

  it('returns a downloadable JSON blob scoped to the resolved space', async () => {
    dbState.rows['User'] = { id: UID, clerkId: 'u_clerk', email: 'r@b.com', name: 'R', createdAt: 't' };
    dbState.rows['Space'] = { id: 'sp1', slug: 'acme', name: 'Acme', ownerId: UID, createdAt: 't' };
    const res = await call();
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(res.headers.get('Content-Disposition')).toContain('attachment');
    const body = JSON.parse(await res.text());
    expect(body.exportKind).toBe('admin-dsar');
    expect(body.spaceId).toBe('sp1');
    expect(body.subject.userId).toBe(UID);
    expect(body.data.Contact).toEqual([{ id: 'c1' }]);
  });
});

describe('tenant resolution', () => {
  it('404s an unknown user (no read, no audit)', async () => {
    dbState.rows['User'] = null;
    const res = await call();
    expect(res.status).toBe(404);
    expect(exportSpaceDataMock).not.toHaveBeenCalled();
    expect(logAdminActionMock).not.toHaveBeenCalled();
  });

  it('404s a user with no workspace to export', async () => {
    dbState.rows['User'] = { id: UID, clerkId: 'u_clerk', email: 'r@b.com', name: 'R', createdAt: 't' };
    dbState.rows['Space'] = null;
    const res = await call();
    expect(res.status).toBe(404);
    expect(exportSpaceDataMock).not.toHaveBeenCalled();
  });

  it('400s an invalid (non-UUID) id', async () => {
    const res = await call('not-a-uuid');
    expect(res.status).toBe(400);
  });

  it('429s when rate-limited', async () => {
    rateLimitMock.mockResolvedValueOnce({ allowed: false } as any);
    const res = await call();
    expect(res.status).toBe(429);
    expect(exportSpaceDataMock).not.toHaveBeenCalled();
  });
});
