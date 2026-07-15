/**
 * PATCH /api/admin/dlq/[eventId] must AUDIT the privileged action (SOC2 gap
 * closed in this branch — DLQ replay/resolve were previously unlogged).
 *
 * Supabase, Clerk auth, Inngest, rate-limit, and audit are mocked; we assert
 * the audit call is made with the right action + target on both paths.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { requireMock } = vi.hoisted(() => ({
  requireMock: vi.fn(async () => ({ clerkUserId: 'admin_clerk' })),
}));
vi.mock('@/lib/permissions', () => ({ requirePlatformAdmin: requireMock }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true })) }));

const { logAdminActionMock } = vi.hoisted(() => ({
  logAdminActionMock: vi.fn(async () => undefined),
}));
vi.mock('@/lib/admin', () => ({ logAdminAction: logAdminActionMock }));

const { inngestSendMock } = vi.hoisted(() => ({ inngestSendMock: vi.fn(async () => undefined) }));
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: inngestSendMock } }));

const { dbRow, updateResult } = vi.hoisted(() => ({
  dbRow: {
    value: {
      id: 'evt_1',
      eventType: 'studio/post.scheduled',
      eventPayload: { postId: 'p1' },
      spaceId: 'space_1',
      retryCount: 0,
    } as Record<string, unknown> | null,
  },
  updateResult: { value: { id: 'evt_1', status: 'retrying' } as Record<string, unknown> | null },
}));

vi.mock('@/lib/supabase', () => {
  function chain(): Record<string, unknown> {
    const c: Record<string, unknown> = {};
    c.select = () => c;
    c.eq = () => c;
    c.update = () => c;
    c.maybeSingle = async () =>
      // First call resolves the existing row; after an update() the chain
      // resolves the updated row. We disambiguate by a flag on the chain.
      (c as { _updated?: boolean })._updated
        ? { data: updateResult.value, error: null }
        : { data: dbRow.value, error: null };
    // mark update so the subsequent maybeSingle returns the updated row
    const origUpdate = c.update as () => Record<string, unknown>;
    c.update = () => {
      (c as { _updated?: boolean })._updated = true;
      return origUpdate();
    };
    return c;
  }
  return { supabase: { from: () => chain() } };
});

import { PATCH } from '@/app/api/admin/dlq/[eventId]/route';

function req(body: unknown) {
  return new Request('http://t/api/admin/dlq/evt_1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const params = Promise.resolve({ eventId: '11111111-1111-1111-1111-111111111111' });

beforeEach(() => {
  logAdminActionMock.mockClear();
  inngestSendMock.mockClear();
});

describe('PATCH /api/admin/dlq/[eventId] audit', () => {
  it('audits a replay (retry) as dlq_replay and re-enqueues to Inngest', async () => {
    const res = await PATCH(req({ action: 'retry' }), { params });
    expect(res.status).toBe(200);
    expect(inngestSendMock).toHaveBeenCalledOnce();
    expect(logAdminActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'dlq_replay', target: '11111111-1111-1111-1111-111111111111' }),
    );
  });

  it('audits a resolve as dlq_resolve without re-enqueue', async () => {
    const res = await PATCH(req({ action: 'resolve' }), { params });
    expect(res.status).toBe(200);
    expect(inngestSendMock).not.toHaveBeenCalled();
    expect(logAdminActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'dlq_resolve' }),
    );
  });
});
