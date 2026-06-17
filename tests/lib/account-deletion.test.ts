/**
 * Unit tests for lib/account-deletion.performAccountDeletion — the shared
 * delete engine that BOTH the self-service route and the new platform-admin
 * offboard route call. Proves:
 *   - structural blocker (owns a brokerage) → 409, no Clerk delete.
 *   - Clerk identity is always deleted before any DB sweep.
 *   - ACCOUNT_DELETION_HARD_DELETE gates the destructive DB sweep: off → login
 *     removed + pendingDataDeletion; on → hardDeleteSpaceAndUser runs.
 *   - a Clerk delete failure aborts before touching the DB.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Clerk deleteUser double.
const { deleteUserMock } = vi.hoisted(() => ({ deleteUserMock: vi.fn(async () => undefined) }));
vi.mock('@clerk/nextjs/server', () => ({
  createClerkClient: () => ({ users: { deleteUser: deleteUserMock } }),
}));

// Supabase double — Brokerage(ownerId) blocker check + recorded deletes.
const { dbState } = vi.hoisted(() => ({
  dbState: {
    ownedBrokerages: [] as Array<{ id: string; name: string }>,
    deletes: [] as Array<{ table: string }>,
  },
}));
vi.mock('@/lib/supabase', () => {
  function chain(table: string): any {
    const c: any = {
      select: () => c,
      delete: () => {
        dbState.deletes.push({ table });
        return c;
      },
      // checkDeletionBlockers awaits `.eq('ownerId', id)` as a thenable.
      eq: (col: string) => {
        if (table === 'Brokerage' && col === 'ownerId') {
          return Promise.resolve({ data: dbState.ownedBrokerages, error: null });
        }
        return c;
      },
    };
    return c;
  }
  return { supabase: { from: (t: string) => chain(t) } };
});

import { performAccountDeletion } from '@/lib/account-deletion';

beforeEach(() => {
  vi.clearAllMocks();
  dbState.ownedBrokerages = [];
  dbState.deletes = [];
  delete process.env.ACCOUNT_DELETION_HARD_DELETE;
  process.env.CLERK_SECRET_KEY = 'sk_test_x';
  deleteUserMock.mockResolvedValue(undefined as any);
});

it('returns a 409 blocker when the user owns a brokerage (no Clerk delete)', async () => {
  dbState.ownedBrokerages = [{ id: 'br1', name: 'Acme' }];
  const res = await performAccountDeletion({ userDbId: 'u1', clerkId: 'c1', spaceId: 'sp1' });
  expect(res.ok).toBe(false);
  if (!res.ok) expect(res.status).toBe(409);
  expect(deleteUserMock).not.toHaveBeenCalled();
  expect(dbState.deletes.length).toBe(0);
});

it('with hard-delete OFF: deletes Clerk, leaves DB, reports pendingDataDeletion', async () => {
  const res = await performAccountDeletion({ userDbId: 'u1', clerkId: 'c1', spaceId: 'sp1' });
  expect(res.ok).toBe(true);
  if (res.ok) {
    expect(res.hardDeleted).toBe(false);
    expect(res.pendingDataDeletion).toBe(true);
  }
  expect(deleteUserMock).toHaveBeenCalledWith('c1');
  // No destructive DB sweep while the flag is off.
  expect(dbState.deletes.length).toBe(0);
});

it('with hard-delete ON: deletes Clerk then sweeps the DB (User + non-cascading tables)', async () => {
  process.env.ACCOUNT_DELETION_HARD_DELETE = 'true';
  const res = await performAccountDeletion({ userDbId: 'u1', clerkId: 'c1', spaceId: 'sp1' });
  expect(res.ok).toBe(true);
  if (res.ok) expect(res.hardDeleted).toBe(true);
  expect(deleteUserMock).toHaveBeenCalledWith('c1');
  // hardDeleteSpaceAndUser deletes Attachment, TelemetryEvent, then User.
  const tables = dbState.deletes.map((d) => d.table);
  expect(tables).toContain('Attachment');
  expect(tables).toContain('TelemetryEvent');
  expect(tables).toContain('User');
});

it('aborts (500) before any DB sweep when the Clerk delete fails', async () => {
  process.env.ACCOUNT_DELETION_HARD_DELETE = 'true';
  deleteUserMock.mockRejectedValueOnce(new Error('clerk boom'));
  const res = await performAccountDeletion({ userDbId: 'u1', clerkId: 'c1', spaceId: 'sp1' });
  expect(res.ok).toBe(false);
  if (!res.ok) expect(res.status).toBe(500);
  expect(dbState.deletes.length).toBe(0);
});

describe('performAccountDeletion', () => {
  it('is exported and callable', () => {
    expect(typeof performAccountDeletion).toBe('function');
  });
});
