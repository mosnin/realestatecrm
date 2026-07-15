/**
 * Behavioral tests for the step-up columns on AuditLog (lib/audit.persistAudit):
 *   - reason/confirmationText, when present, are written as first-class columns.
 *   - if the columns aren't live yet (insert errors), the write retries WITHOUT
 *     them so the audit row is never lost (the data still rides in metadata).
 *
 * Supabase insert, rate-limit IP, logger, and next/server after() are mocked.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { insertMock, dbState } = vi.hoisted(() => ({
  insertMock: vi.fn(async (_row: Record<string, unknown>) => ({ error: null as unknown })),
  dbState: { userId: 'db_user_1' as string | null },
}));

vi.mock('@/lib/supabase', () => {
  function from(table: string): any {
    if (table === 'User') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: dbState.userId ? { id: dbState.userId } : null, error: null }) }) }),
      };
    }
    // AuditLog
    return { insert: (row: Record<string, unknown>) => insertMock(row) };
  }
  return { supabase: { from } };
});
vi.mock('@/lib/rate-limit', () => ({ getClientIp: vi.fn(() => '203.0.113.7') }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('next/server', () => ({ after: vi.fn(() => { throw new Error('no request scope'); }) }));

import { audit } from '@/lib/audit';

beforeEach(() => {
  vi.clearAllMocks();
  insertMock.mockResolvedValue({ error: null });
  dbState.userId = 'db_user_1';
});

describe('audit step-up columns', () => {
  it('writes reason + confirmationText as first-class columns', async () => {
    await audit({
      actorClerkId: 'admin_clerk',
      action: 'ADMIN_ACTION',
      resource: 'AdminAction',
      resourceId: 'target_1',
      reason: 'offboarding a churned account',
      confirmationText: 'user@example.com',
      metadata: { adminAction: 'delete_user' },
    });
    expect(insertMock).toHaveBeenCalledTimes(1);
    const row = insertMock.mock.calls[0][0];
    expect(row.reason).toBe('offboarding a churned account');
    expect(row.confirmationText).toBe('user@example.com');
    expect(row.action).toBe('ADMIN_ACTION');
  });

  it('omits the columns entirely when not provided', async () => {
    await audit({ actorClerkId: 'admin_clerk', action: 'ACCESS', resource: 'Contact', resourceId: 'c1' });
    const row = insertMock.mock.calls[0][0];
    expect('reason' in row).toBe(false);
    expect('confirmationText' in row).toBe(false);
  });

  it('retries without the step-up columns if the first insert errors (columns not live)', async () => {
    insertMock
      .mockResolvedValueOnce({ error: { message: 'column "reason" does not exist' } })
      .mockResolvedValueOnce({ error: null });
    await audit({
      actorClerkId: 'admin_clerk',
      action: 'ADMIN_ACTION',
      resource: 'AdminAction',
      reason: 'a sufficiently long reason',
      confirmationText: 'DELETE',
    });
    expect(insertMock).toHaveBeenCalledTimes(2);
    // The retry row carries neither step-up column.
    const retryRow = insertMock.mock.calls[1][0];
    expect('reason' in retryRow).toBe(false);
    expect('confirmationText' in retryRow).toBe(false);
  });
});
