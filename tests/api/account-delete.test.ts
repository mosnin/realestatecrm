/**
 * Route-level tests for POST /api/account/delete — self-service GDPR erasure.
 *
 * The engine (Clerk delete + gated DB sweep) is already covered in
 * tests/lib/account-deletion.test.ts. This file proves the *route* wiring
 * that the engine never sees:
 *   - session-derived space (body spaceId is ignored)
 *   - type-to-confirm re-checked server-side
 *   - rate-limit / auth / blocker short-circuits before Clerk or sweep
 *   - Clerk-then-sweep order and partial-failure honesty
 *
 * The route inlines this sequence instead of calling performAccountDeletion,
 * so a lib-only suite cannot catch drift.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const {
  requireAuthMock,
  getSpaceForUserMock,
  checkRateLimitMock,
  auditMock,
  deleteUserMock,
  hardDeleteEnabledMock,
  checkDeletionBlockersMock,
  hardDeleteSpaceAndUserMock,
  dbState,
} = vi.hoisted(() => ({
  requireAuthMock: vi.fn(async () => ({ userId: 'clerk_1' })),
  getSpaceForUserMock: vi.fn(async () => ({
    id: 'sp_session',
    slug: 'acme',
    name: 'Acme Realty',
    ownerId: 'user_db_1',
  })),
  checkRateLimitMock: vi.fn(async () => ({ allowed: true })),
  auditMock: vi.fn(async () => undefined),
  deleteUserMock: vi.fn(async () => undefined),
  hardDeleteEnabledMock: vi.fn(() => false),
  checkDeletionBlockersMock: vi.fn(async () => null),
  hardDeleteSpaceAndUserMock: vi.fn(async () => undefined),
  dbState: { userRow: { id: 'user_db_1' } as { id: string } | null },
}));

vi.mock('@/lib/api-auth', () => ({ requireAuth: requireAuthMock }));
vi.mock('@/lib/space', () => ({ getSpaceForUser: getSpaceForUserMock }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: checkRateLimitMock }));
vi.mock('@/lib/audit', () => ({ audit: auditMock }));
vi.mock('@clerk/nextjs/server', () => ({
  createClerkClient: () => ({ users: { deleteUser: deleteUserMock } }),
}));
vi.mock('@/lib/account-deletion', () => ({
  hardDeleteEnabled: hardDeleteEnabledMock,
  checkDeletionBlockers: checkDeletionBlockersMock,
  hardDeleteSpaceAndUser: hardDeleteSpaceAndUserMock,
}));
vi.mock('@/lib/supabase', () => {
  function chain(): Record<string, unknown> {
    const c: Record<string, unknown> = {};
    c.select = () => c;
    c.eq = () => c;
    c.maybeSingle = async () => ({ data: dbState.userRow, error: null });
    return c;
  }
  return { supabase: { from: () => chain() } };
});

import { POST } from '@/app/api/account/delete/route';

function call(body: unknown = { confirm: 'Acme Realty' }) {
  return POST(
    new Request('http://localhost/api/account/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }) as never,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CLERK_SECRET_KEY = 'sk_test_x';
  dbState.userRow = { id: 'user_db_1' };
  requireAuthMock.mockResolvedValue({ userId: 'clerk_1' });
  getSpaceForUserMock.mockResolvedValue({
    id: 'sp_session',
    slug: 'acme',
    name: 'Acme Realty',
    ownerId: 'user_db_1',
  });
  checkRateLimitMock.mockResolvedValue({ allowed: true });
  hardDeleteEnabledMock.mockReturnValue(false);
  checkDeletionBlockersMock.mockResolvedValue(null);
  deleteUserMock.mockResolvedValue(undefined);
  hardDeleteSpaceAndUserMock.mockResolvedValue(undefined);
});

describe('POST /api/account/delete — gates before any destructive work', () => {
  it('returns the auth response and does not rate-limit or delete', async () => {
    requireAuthMock.mockResolvedValueOnce(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    );

    const res = await call();

    expect(res.status).toBe(401);
    expect(checkRateLimitMock).not.toHaveBeenCalled();
    expect(deleteUserMock).not.toHaveBeenCalled();
    expect(hardDeleteSpaceAndUserMock).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('429s on rate-limit before looking up the space or calling Clerk', async () => {
    checkRateLimitMock.mockResolvedValueOnce({ allowed: false });

    const res = await call();

    expect(res.status).toBe(429);
    expect(checkRateLimitMock).toHaveBeenCalledWith('account:delete:clerk_1', 5, 3600);
    expect(getSpaceForUserMock).not.toHaveBeenCalled();
    expect(deleteUserMock).not.toHaveBeenCalled();
    expect(hardDeleteSpaceAndUserMock).not.toHaveBeenCalled();
  });

  it('400s on invalid JSON and does not delete', async () => {
    const res = await call('{not-json');

    expect(res.status).toBe(400);
    expect(deleteUserMock).not.toHaveBeenCalled();
    expect(hardDeleteSpaceAndUserMock).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('404s when the session has no workspace and does not delete', async () => {
    getSpaceForUserMock.mockResolvedValueOnce(null);

    const res = await call();

    expect(res.status).toBe(404);
    expect(deleteUserMock).not.toHaveBeenCalled();
    expect(hardDeleteSpaceAndUserMock).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('400s when confirm does not match the workspace name (trimmed)', async () => {
    const res = await call({ confirm: 'Wrong Name', spaceId: 'sp_attacker' });

    expect(res.status).toBe(400);
    expect(deleteUserMock).not.toHaveBeenCalled();
    expect(hardDeleteSpaceAndUserMock).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('treats a missing/non-string confirm as a mismatch', async () => {
    const res = await call({ spaceId: 'sp_attacker' });

    expect(res.status).toBe(400);
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it('404s when the User row is missing (no Clerk delete)', async () => {
    dbState.userRow = null;

    const res = await call();

    expect(res.status).toBe(404);
    expect(deleteUserMock).not.toHaveBeenCalled();
    expect(hardDeleteSpaceAndUserMock).not.toHaveBeenCalled();
  });

  it('409s on a structural blocker and does not delete Clerk or sweep', async () => {
    checkDeletionBlockersMock.mockResolvedValueOnce(
      'Transfer or close your brokerage before deleting this account.',
    );

    const res = await call();

    expect(res.status).toBe(409);
    expect(checkDeletionBlockersMock).toHaveBeenCalledWith('user_db_1');
    expect(deleteUserMock).not.toHaveBeenCalled();
    expect(hardDeleteSpaceAndUserMock).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/account/delete — Clerk then gated sweep', () => {
  it('accepts a trimmed confirm and deletes only the session identity when hard-delete is off', async () => {
    const res = await call({ confirm: '  Acme Realty  ', spaceId: 'sp_attacker' });
    const json = (await res.json()) as {
      success: boolean;
      pendingDataDeletion: boolean;
    };

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.pendingDataDeletion).toBe(true);
    expect(deleteUserMock).toHaveBeenCalledTimes(1);
    expect(deleteUserMock).toHaveBeenCalledWith('clerk_1');
    expect(hardDeleteSpaceAndUserMock).not.toHaveBeenCalled();
    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock.mock.calls[0][0]).toMatchObject({
      actorClerkId: 'clerk_1',
      action: 'DELETE',
      resource: 'Space',
      resourceId: 'sp_session',
      spaceId: 'sp_session',
      metadata: { kind: 'account-deletion', phase: 'requested', hardDelete: false },
    });
  });

  it('sweeps the session space (not a body spaceId) and writes a null-space completed audit', async () => {
    hardDeleteEnabledMock.mockReturnValue(true);

    const res = await call({ confirm: 'Acme Realty', spaceId: 'sp_attacker' });
    const json = (await res.json()) as { success: boolean };

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(deleteUserMock).toHaveBeenCalledWith('clerk_1');
    expect(hardDeleteSpaceAndUserMock).toHaveBeenCalledTimes(1);
    expect(hardDeleteSpaceAndUserMock).toHaveBeenCalledWith({
      userDbId: 'user_db_1',
      spaceId: 'sp_session',
    });

    expect(auditMock).toHaveBeenCalledTimes(2);
    expect(auditMock.mock.calls[0][0]).toMatchObject({
      metadata: { phase: 'requested', hardDelete: true },
      spaceId: 'sp_session',
    });
    expect(auditMock.mock.calls[1][0]).toMatchObject({
      actorClerkId: 'clerk_1',
      resourceId: 'sp_session',
      metadata: {
        kind: 'account-deletion',
        phase: 'completed',
        deletedSpaceId: 'sp_session',
        hardDelete: true,
      },
    });
    expect(auditMock.mock.calls[1][0]).not.toHaveProperty('spaceId');
  });

  it('aborts with 500 and does not sweep when Clerk delete fails', async () => {
    hardDeleteEnabledMock.mockReturnValue(true);
    deleteUserMock.mockRejectedValueOnce(new Error('clerk boom'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await call();
    err.mockRestore();
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(500);
    expect(json.error).toMatch(/nothing was removed/i);
    expect(hardDeleteSpaceAndUserMock).not.toHaveBeenCalled();
    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock.mock.calls[0][0]).toMatchObject({
      metadata: { phase: 'requested' },
    });
  });

  it('reports loginRemoved when the sweep fails after Clerk succeeded', async () => {
    hardDeleteEnabledMock.mockReturnValue(true);
    hardDeleteSpaceAndUserMock.mockRejectedValueOnce(new Error('db sweep failed'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await call();
    err.mockRestore();
    const json = (await res.json()) as {
      success: boolean;
      loginRemoved: boolean;
    };

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.loginRemoved).toBe(true);
    expect(deleteUserMock).toHaveBeenCalledTimes(1);
    expect(hardDeleteSpaceAndUserMock).toHaveBeenCalledTimes(1);
    // No completion audit — the durable "erased" row must not claim success.
    expect(
      auditMock.mock.calls.filter((c) => c[0]?.metadata?.phase === 'completed'),
    ).toHaveLength(0);
  });
});
