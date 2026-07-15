/**
 * Route-level tests for POST /api/admin/users/[id]/delete — the platform-admin
 * OFFBOARD/DELETE added in this branch.
 *
 *   - authz: non-admin → 403.
 *   - offboard WIRING: delegates to lib/account-deletion.performAccountDeletion
 *     with the resolved {userDbId, clerkId, spaceId}; audits BEFORE deleting.
 *   - GUARDS: refuses to delete a platform admin; refuses self-deletion.
 *   - surfaces the engine's failure status (e.g. 409 brokerage blocker).
 *
 * The deletion engine itself is mocked here (it has its own coverage); this test
 * proves the route's auth/guards/wiring, not the cascade.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { requireMock, getCurrentDbUserMock } = vi.hoisted(() => ({
  // The route now gates on the graded capability, not the coarse platform-admin
  // check. A super_admin (the backfill default) satisfies 'users:delete'.
  requireMock: vi.fn(async () => ({ clerkUserId: 'admin_clerk', adminRole: 'super_admin' })),
  getCurrentDbUserMock: vi.fn(async () => ({ id: 'admin_db', clerkId: 'admin_clerk' })),
}));
vi.mock('@/lib/permissions', () => ({
  requireAdminCapability: requireMock,
  getCurrentDbUser: getCurrentDbUserMock,
}));
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({ userId: 'admin_clerk' })),
}));
const { logAdminActionMock } = vi.hoisted(() => ({ logAdminActionMock: vi.fn(async (..._a: any[]) => undefined) }));
vi.mock('@/lib/admin', () => ({ logAdminAction: logAdminActionMock }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true })) }));

const { performAccountDeletionMock, hardDeleteEnabledMock } = vi.hoisted(() => ({
  performAccountDeletionMock: vi.fn(async (..._a: any[]) => ({ ok: true, hardDeleted: true, pendingDataDeletion: false })),
  hardDeleteEnabledMock: vi.fn(() => true),
}));
vi.mock('@/lib/account-deletion', () => ({
  performAccountDeletion: performAccountDeletionMock,
  hardDeleteEnabled: hardDeleteEnabledMock,
}));

// ── Supabase double — User + Space single-row reads ─────────────────────────
const { dbState } = vi.hoisted(() => ({
  dbState: { rows: {} as Record<string, Record<string, unknown> | null> },
}));
vi.mock('@/lib/supabase', () => {
  function chain(table: string): any {
    const c: any = {
      select: () => c,
      eq: () => c,
      maybeSingle: async () => ({ data: dbState.rows[table] ?? null, error: null }),
    };
    return c;
  }
  return { supabase: { from: (t: string) => chain(t) } };
});

import { POST } from '@/app/api/admin/users/[id]/delete/route';

const UID = '11111111-1111-1111-1111-111111111111';
// Step-up defaults: a valid reason (>=10 chars) + the target's email as the
// typed confirmation. Individual tests override to exercise the 400 paths.
function call(body: Record<string, unknown> | undefined = { reason: 'offboarding a churned account', confirm: 'r@b.com' }) {
  const req = new Request(`http://localhost/api/admin/users/${UID}/delete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return POST(req, { params: Promise.resolve({ id: UID }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  dbState.rows = {};
  requireMock.mockResolvedValue({ clerkUserId: 'admin_clerk', adminRole: 'super_admin' } as any);
  getCurrentDbUserMock.mockResolvedValue({ id: 'admin_db', clerkId: 'admin_clerk' } as any);
  performAccountDeletionMock.mockResolvedValue({ ok: true, hardDeleted: true, pendingDataDeletion: false } as any);
  hardDeleteEnabledMock.mockReturnValue(true);
});

describe('authz', () => {
  it('403s when not a platform admin', async () => {
    requireMock.mockRejectedValueOnce(new Error('Forbidden'));
    const res = await call();
    expect(res.status).toBe(403);
    expect(performAccountDeletionMock).not.toHaveBeenCalled();
  });

  it('403s when the admin role lacks the users:delete capability', async () => {
    // A non-super_admin (e.g. admin_readonly) → requireAdminCapability throws.
    requireMock.mockRejectedValueOnce(new Error("Forbidden: capability 'users:delete'"));
    dbState.rows['User'] = { id: UID, clerkId: 'u_clerk', email: 'r@b.com', platformRole: 'user' };
    const res = await call();
    expect(res.status).toBe(403);
    expect(performAccountDeletionMock).not.toHaveBeenCalled();
  });
});

describe('step-up (reason + typed confirmation)', () => {
  beforeEach(() => {
    dbState.rows['User'] = { id: UID, clerkId: 'u_clerk', email: 'r@b.com', platformRole: 'user' };
    dbState.rows['Space'] = { id: 'sp1', slug: 'acme', name: 'Acme' };
  });

  it('400s with no reason/confirm and does NOT delete', async () => {
    const res = await call({});
    expect(res.status).toBe(400);
    expect(performAccountDeletionMock).not.toHaveBeenCalled();
  });

  it('400s on a too-short reason', async () => {
    const res = await call({ reason: 'too short', confirm: 'r@b.com' });
    expect(res.status).toBe(400);
    expect(performAccountDeletionMock).not.toHaveBeenCalled();
  });

  it('400s when the typed confirmation is not the target email', async () => {
    const res = await call({ reason: 'offboarding a churned account', confirm: 'wrong@b.com' });
    expect(res.status).toBe(400);
    expect(performAccountDeletionMock).not.toHaveBeenCalled();
  });

  it('succeeds with a valid reason + email and writes both to the audit row', async () => {
    const res = await call({ reason: 'offboarding a churned account', confirm: 'r@b.com' });
    expect(res.status).toBe(200);
    expect(performAccountDeletionMock).toHaveBeenCalledTimes(1);
    expect(logAdminActionMock.mock.calls[0][0]).toMatchObject({
      action: 'delete_user',
      reason: 'offboarding a churned account',
      confirmationText: 'r@b.com',
    });
  });
});

describe('offboard wiring', () => {
  it('delegates to performAccountDeletion with the resolved ids + audits before deleting', async () => {
    dbState.rows['User'] = { id: UID, clerkId: 'u_clerk', email: 'r@b.com', platformRole: 'user' };
    dbState.rows['Space'] = { id: 'sp1', slug: 'acme', name: 'Acme' };
    const res = await call();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);

    expect(performAccountDeletionMock).toHaveBeenCalledTimes(1);
    expect(performAccountDeletionMock.mock.calls[0][0]).toEqual({
      userDbId: UID,
      clerkId: 'u_clerk',
      spaceId: 'sp1',
    });
    // Audited as delete_user with the spaceId captured.
    expect(logAdminActionMock).toHaveBeenCalledTimes(1);
    expect(logAdminActionMock.mock.calls[0][0]).toMatchObject({ action: 'delete_user', target: UID });
  });

  it('passes spaceId:null when the user has no workspace', async () => {
    dbState.rows['User'] = { id: UID, clerkId: 'u_clerk', email: 'r@b.com', platformRole: 'user' };
    dbState.rows['Space'] = null;
    await call();
    expect(performAccountDeletionMock.mock.calls[0][0].spaceId).toBeNull();
  });

  it('propagates a 409 structural blocker from the engine', async () => {
    dbState.rows['User'] = { id: UID, clerkId: 'u_clerk', email: 'r@b.com', platformRole: 'user' };
    performAccountDeletionMock.mockResolvedValueOnce({ ok: false, status: 409, error: 'owns a brokerage' } as any);
    const res = await call();
    expect(res.status).toBe(409);
  });
});

describe('guards', () => {
  it('refuses to delete a platform admin (no engine call)', async () => {
    dbState.rows['User'] = { id: UID, clerkId: 'u_clerk', email: 'admin@b.com', platformRole: 'admin' };
    const res = await call();
    expect(res.status).toBe(403);
    expect(performAccountDeletionMock).not.toHaveBeenCalled();
  });

  it('refuses self-deletion (no engine call)', async () => {
    dbState.rows['User'] = { id: UID, clerkId: 'admin_clerk', email: 'me@b.com', platformRole: 'user' };
    getCurrentDbUserMock.mockResolvedValue({ id: UID, clerkId: 'admin_clerk' } as any);
    const res = await call();
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toMatch(/your own account/i);
    expect(performAccountDeletionMock).not.toHaveBeenCalled();
  });

  it('404s an unknown user', async () => {
    dbState.rows['User'] = null;
    const res = await call();
    expect(res.status).toBe(404);
  });
});
