/**
 * Route-level tests for PATCH /api/admin/users/[id]/profile — admin identity
 * edit (name/email) added in this branch. Clerk is the source of truth, so the
 * route updates Clerk FIRST and only mirrors the DB on success.
 *
 *   - authz: non-admin → 403.
 *   - name → clerk.users.updateUser(first/last) then User.name mirror.
 *   - email → clerk.emailAddresses.createEmailAddress(verified+primary) then mirror.
 *   - email collision with another user → 409 (no Clerk call).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { requireMock } = vi.hoisted(() => ({
  // Route gates on the 'support:write' capability (support/billing/super_admin).
  requireMock: vi.fn(async () => ({ clerkUserId: 'admin_clerk', adminRole: 'super_admin' })),
}));
vi.mock('@/lib/permissions', () => ({ requireAdminCapability: requireMock }));

const { updateUserMock, createEmailMock } = vi.hoisted(() => ({
  updateUserMock: vi.fn(async () => ({ id: 'c1' })),
  createEmailMock: vi.fn(async () => ({ id: 'email_new' })),
}));
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({ userId: 'admin_clerk' })),
  createClerkClient: () => ({
    users: { updateUser: updateUserMock },
    emailAddresses: { createEmailAddress: createEmailMock },
  }),
}));
const { logAdminActionMock } = vi.hoisted(() => ({ logAdminActionMock: vi.fn(async (..._a: any[]) => undefined) }));
vi.mock('@/lib/admin', () => ({ logAdminAction: logAdminActionMock }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true })) }));

// ── Supabase double — target user + collision lookup + recorded writes ───────
const { dbState } = vi.hoisted(() => ({
  dbState: {
    user: null as Record<string, unknown> | null,
    clash: null as Record<string, unknown> | null,
    writes: [] as Array<{ payload: Record<string, unknown> }>,
  },
}));
vi.mock('@/lib/supabase', () => {
  function chain(): any {
    let neqUsed = false;
    const c: any = {
      select: () => c,
      eq: () => c,
      neq: () => {
        neqUsed = true;
        return c;
      },
      update(payload: Record<string, unknown>) {
        dbState.writes.push({ payload });
        return c;
      },
      // The collision lookup is the only query that chains .neq(); route it to `clash`.
      maybeSingle: async () => ({ data: neqUsed ? dbState.clash : dbState.user, error: null }),
    };
    return c;
  }
  return { supabase: { from: () => chain() } };
});

import { PATCH } from '@/app/api/admin/users/[id]/profile/route';

const UID = '11111111-1111-1111-1111-111111111111';
function req(body: unknown) {
  return new Request(`http://localhost/api/admin/users/${UID}/profile`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const params = { params: Promise.resolve({ id: UID }) };

beforeEach(() => {
  vi.clearAllMocks();
  dbState.user = { id: UID, clerkId: 'c1', email: 'old@b.com', name: 'Old Name' };
  dbState.clash = null;
  dbState.writes = [];
  requireMock.mockResolvedValue({ clerkUserId: 'admin_clerk', adminRole: 'super_admin' } as any);
});

it('403s when not admin', async () => {
  requireMock.mockRejectedValueOnce(new Error('Forbidden'));
  expect((await PATCH(req({ name: 'X' }), params)).status).toBe(403);
});

it('updates the name in Clerk (first/last) then mirrors the DB', async () => {
  const res = await PATCH(req({ name: 'Jane Q Public' }), params);
  expect(res.status).toBe(200);
  expect(updateUserMock).toHaveBeenCalledWith('c1', { firstName: 'Jane', lastName: 'Q Public' });
  expect(dbState.writes.at(-1)!.payload.name).toBe('Jane Q Public');
  expect(logAdminActionMock.mock.calls[0][0]).toMatchObject({ action: 'edit_user_profile' });
});

it('updates the email as verified+primary in Clerk then mirrors the DB', async () => {
  const res = await PATCH(req({ email: 'New@B.com' }), params);
  expect(res.status).toBe(200);
  expect(createEmailMock).toHaveBeenCalledWith(
    expect.objectContaining({ userId: 'c1', emailAddress: 'new@b.com', verified: true, primary: true }),
  );
  expect(dbState.writes.at(-1)!.payload.email).toBe('new@b.com');
});

it('409s on an email collision with another user (no Clerk email call)', async () => {
  dbState.clash = { id: 'other_user' };
  const res = await PATCH(req({ email: 'taken@b.com' }), params);
  expect(res.status).toBe(409);
  expect(createEmailMock).not.toHaveBeenCalled();
});

it('rejects an invalid email', async () => {
  expect((await PATCH(req({ email: 'bad' }), params)).status).toBe(400);
});

describe('no-op', () => {
  it('400s when neither name nor email is provided', async () => {
    expect((await PATCH(req({}), params)).status).toBe(400);
  });
});
