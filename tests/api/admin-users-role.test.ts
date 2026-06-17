/**
 * Route-level tests for POST /api/admin/users/[id]/role — the account-type /
 * platformRole mutation added in this branch.
 *
 *   - authz: non-admin → 403.
 *   - platformRole promote/demote, with the two GUARDS:
 *       · cannot demote YOURSELF from admin (clear error)
 *       · cannot demote the LAST remaining admin
 *   - membership role change (broker_admin ↔ realtor_member), refusing owner rows.
 *
 * Supabase, Clerk auth, rate-limit + audit are mocked.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { requireMock } = vi.hoisted(() => ({
  requireMock: vi.fn(async () => ({ clerkUserId: 'admin_clerk' })),
}));
const { getCurrentDbUserMock } = vi.hoisted(() => ({
  getCurrentDbUserMock: vi.fn(async () => ({ id: 'admin_db', clerkId: 'admin_clerk' })),
}));
vi.mock('@/lib/permissions', () => ({
  requirePlatformAdmin: requireMock,
  getCurrentDbUser: getCurrentDbUserMock,
}));
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({ userId: 'admin_clerk' })),
}));
const { logAdminActionMock } = vi.hoisted(() => ({ logAdminActionMock: vi.fn(async (..._a: any[]) => undefined) }));
vi.mock('@/lib/admin', () => ({ logAdminAction: logAdminActionMock }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true })) }));

// ── Supabase double — per-table single rows, admin count, recorded writes ─────
const { dbState } = vi.hoisted(() => ({
  dbState: {
    rows: {} as Record<string, Record<string, unknown> | null>,
    adminCount: 2,
    writes: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  },
}));

vi.mock('@/lib/supabase', () => {
  function chain(table: string): any {
    let countMode = false;
    const c: any = {
      select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.count) countMode = true;
        return c;
      },
      eq: () => c,
      neq: () => c,
      update(payload: Record<string, unknown>) {
        dbState.writes.push({ table, payload });
        return c;
      },
      maybeSingle: async () => ({ data: dbState.rows[table] ?? null, error: null }),
      then: (resolve: (v: { data: unknown; error: null; count?: number }) => void) => {
        // count query for admins terminates as an awaited thenable
        if (countMode && table === 'User') {
          return resolve({ data: null, error: null, count: dbState.adminCount });
        }
        return resolve({ data: null, error: null });
      },
    };
    return c;
  }
  return { supabase: { from: (t: string) => chain(t) } };
});

import { POST } from '@/app/api/admin/users/[id]/role/route';

const UID = '11111111-1111-1111-1111-111111111111';
function req(body: unknown): Request {
  return new Request(`http://localhost/api/admin/users/${UID}/role`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const params = { params: Promise.resolve({ id: UID }) };

beforeEach(() => {
  vi.clearAllMocks();
  dbState.rows = {};
  dbState.adminCount = 2;
  dbState.writes = [];
  requireMock.mockResolvedValue({ clerkUserId: 'admin_clerk' } as any);
  getCurrentDbUserMock.mockResolvedValue({ id: 'admin_db', clerkId: 'admin_clerk' } as any);
});

describe('authz', () => {
  it('403s when not a platform admin', async () => {
    requireMock.mockRejectedValueOnce(new Error('Forbidden'));
    const res = await POST(req({ platformRole: 'admin' }), params);
    expect(res.status).toBe(403);
  });
});

describe('platformRole', () => {
  it('promotes a user to admin and audits', async () => {
    dbState.rows['User'] = { id: UID, clerkId: 'u_clerk', email: 'a@b.com', platformRole: 'user' };
    const res = await POST(req({ platformRole: 'admin' }), params);
    expect(res.status).toBe(200);
    const w = dbState.writes.find((x) => x.table === 'User');
    expect(w!.payload.platformRole).toBe('admin');
    expect(logAdminActionMock).toHaveBeenCalledTimes(1);
    expect(logAdminActionMock.mock.calls[0][0]).toMatchObject({ action: 'change_user_role' });
  });

  it('demotes an admin to user when more than one admin exists', async () => {
    dbState.rows['User'] = { id: UID, clerkId: 'u_clerk', email: 'a@b.com', platformRole: 'admin' };
    dbState.adminCount = 3;
    const res = await POST(req({ platformRole: 'user' }), params);
    expect(res.status).toBe(200);
    const w = dbState.writes.find((x) => x.table === 'User');
    expect(w!.payload.platformRole).toBe('user');
  });

  it('GUARD: refuses to demote yourself (clear error, no write)', async () => {
    dbState.rows['User'] = { id: UID, clerkId: 'admin_clerk', email: 'me@b.com', platformRole: 'admin' };
    dbState.adminCount = 5;
    getCurrentDbUserMock.mockResolvedValue({ id: UID, clerkId: 'admin_clerk' } as any);
    const res = await POST(req({ platformRole: 'user' }), params);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toMatch(/own admin access/i);
    expect(dbState.writes.length).toBe(0);
  });

  it('GUARD: refuses to demote the last remaining admin (no write)', async () => {
    dbState.rows['User'] = { id: UID, clerkId: 'u_clerk', email: 'last@b.com', platformRole: 'admin' };
    dbState.adminCount = 1;
    const res = await POST(req({ platformRole: 'user' }), params);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toMatch(/last platform admin/i);
    expect(dbState.writes.length).toBe(0);
  });

  it('rejects an invalid platformRole', async () => {
    dbState.rows['User'] = { id: UID, clerkId: 'u_clerk', email: 'a@b.com', platformRole: 'user' };
    const res = await POST(req({ platformRole: 'superadmin' }), params);
    expect(res.status).toBe(400);
  });
});

describe('membership role', () => {
  it('changes a member role and audits', async () => {
    dbState.rows['User'] = { id: UID, clerkId: 'u_clerk', email: 'a@b.com', platformRole: 'user' };
    dbState.rows['BrokerageMembership'] = {
      id: '22222222-2222-2222-2222-222222222222',
      role: 'realtor_member',
      userId: UID,
      brokerageId: 'br1',
    };
    const res = await POST(
      req({ membershipId: '22222222-2222-2222-2222-222222222222', membershipRole: 'broker_admin' }),
      params,
    );
    expect(res.status).toBe(200);
    const w = dbState.writes.find((x) => x.table === 'BrokerageMembership');
    expect(w!.payload.role).toBe('broker_admin');
  });

  it('refuses to change a broker_owner membership', async () => {
    dbState.rows['User'] = { id: UID, clerkId: 'u_clerk', email: 'a@b.com', platformRole: 'user' };
    dbState.rows['BrokerageMembership'] = {
      id: '22222222-2222-2222-2222-222222222222',
      role: 'broker_owner',
      userId: UID,
      brokerageId: 'br1',
    };
    const res = await POST(
      req({ membershipId: '22222222-2222-2222-2222-222222222222', membershipRole: 'broker_admin' }),
      params,
    );
    expect(res.status).toBe(400);
    expect(dbState.writes.length).toBe(0);
  });

  it("refuses a membership that doesn't belong to the user", async () => {
    dbState.rows['User'] = { id: UID, clerkId: 'u_clerk', email: 'a@b.com', platformRole: 'user' };
    dbState.rows['BrokerageMembership'] = {
      id: '22222222-2222-2222-2222-222222222222',
      role: 'realtor_member',
      userId: 'SOMEONE_ELSE',
      brokerageId: 'br1',
    };
    const res = await POST(
      req({ membershipId: '22222222-2222-2222-2222-222222222222', membershipRole: 'broker_admin' }),
      params,
    );
    expect(res.status).toBe(404);
  });
});
