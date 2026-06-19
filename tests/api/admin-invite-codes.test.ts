/**
 * Route-level tests for the platform-admin invite-code management endpoints
 * (GET/POST/PATCH/DELETE /api/admin/invite-codes).
 *
 *   - Admin-gated: a non-admin (requirePlatformAdmin throws) gets 403 on every
 *     verb and the lib is never touched.
 *   - POST validates the body (plan / maxUses / compDurationDays) and maps a
 *     duplicate-code collision to 409.
 *   - PATCH/DELETE flip / clear the active flag via setInviteCodeActive + audit.
 *
 * The invite-codes lib (the DB layer) is mocked; we assert the route calls it
 * with the right shape and translates results into HTTP. Auth/rate-limit/audit
 * are mocked.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { requireAdminMock } = vi.hoisted(() => ({
  requireAdminMock: vi.fn(async () => ({ clerkUserId: 'admin_clerk' })),
}));
vi.mock('@/lib/permissions', () => ({ requirePlatformAdmin: requireAdminMock }));
vi.mock('@/lib/admin', () => ({ logAdminAction: vi.fn(async () => undefined) }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true })) }));

const { listMock, createMock, setActiveMock } = vi.hoisted(() => ({
  listMock: vi.fn(async () => []),
  createMock: vi.fn(async () => ({ ok: true, row: { id: 'ic1', code: 'abc', plan: 'solo' } })),
  setActiveMock: vi.fn(async () => true),
}));
vi.mock('@/lib/billing/invite-codes', () => ({
  listInviteCodes: listMock,
  createInviteCode: createMock,
  setInviteCodeActive: setActiveMock,
}));

import { GET, POST, PATCH, DELETE } from '@/app/api/admin/invite-codes/route';

function jsonReq(method: string, body: unknown): Request {
  return new Request('http://localhost/api/admin/invite-codes', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdminMock.mockResolvedValue({ clerkUserId: 'admin_clerk' } as any);
  listMock.mockResolvedValue([] as any);
  createMock.mockResolvedValue({ ok: true, row: { id: 'ic1', code: 'abc', plan: 'solo' } } as any);
  setActiveMock.mockResolvedValue(true as any);
});

describe('admin gating — non-admin gets 403, lib never touched', () => {
  beforeEach(() => {
    requireAdminMock.mockImplementation(async () => {
      throw new Error('Forbidden');
    });
  });

  it('GET 403', async () => {
    const res = await GET();
    expect(res.status).toBe(403);
    expect(listMock).not.toHaveBeenCalled();
  });
  it('POST 403', async () => {
    const res = await POST(jsonReq('POST', { plan: 'solo' }));
    expect(res.status).toBe(403);
    expect(createMock).not.toHaveBeenCalled();
  });
  it('PATCH 403', async () => {
    const res = await PATCH(jsonReq('PATCH', { id: 'ic1', active: false }));
    expect(res.status).toBe(403);
    expect(setActiveMock).not.toHaveBeenCalled();
  });
  it('DELETE 403', async () => {
    const res = await DELETE(new Request('http://localhost/api/admin/invite-codes?id=ic1', { method: 'DELETE' }));
    expect(res.status).toBe(403);
    expect(setActiveMock).not.toHaveBeenCalled();
  });
});

describe('GET — list', () => {
  it('returns the codes from the lib', async () => {
    listMock.mockResolvedValue([{ id: 'ic1', code: 'abc' }] as any);
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.codes).toEqual([{ id: 'ic1', code: 'abc' }]);
  });
});

describe('POST — create', () => {
  it('creates with the parsed body and returns the row', async () => {
    const res = await POST(
      jsonReq('POST', { code: 'WELCOME', plan: 'solo', maxUses: 5, compDurationDays: 30, note: 'launch' }),
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.code).toEqual({ id: 'ic1', code: 'abc', plan: 'solo' });
    const arg = createMock.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.code).toBe('WELCOME');
    expect(arg.plan).toBe('solo');
    expect(arg.maxUses).toBe(5);
    expect(arg.compDurationDays).toBe(30);
    expect(arg.createdByClerkId).toBe('admin_clerk');
  });

  it('defaults plan to solo (the $97 tier) when omitted', async () => {
    await POST(jsonReq('POST', {}));
    expect((createMock.mock.calls[0][0] as Record<string, unknown>).plan).toBe('solo');
  });

  it('passes null maxUses / compDurationDays through (unlimited / indefinite)', async () => {
    await POST(jsonReq('POST', { plan: 'solo' }));
    const arg = createMock.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.maxUses).toBeNull();
    expect(arg.compDurationDays).toBeNull();
    expect(arg.expiresAt).toBeNull();
  });

  it('rejects an unknown plan (400, lib not called)', async () => {
    const res = await POST(jsonReq('POST', { plan: 'platinum' }));
    expect(res.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('rejects a non-positive maxUses (400)', async () => {
    const res = await POST(jsonReq('POST', { plan: 'solo', maxUses: 0 }));
    expect(res.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('maps a duplicate-code collision to 409', async () => {
    createMock.mockResolvedValue({ ok: false, error: 'duplicate' } as any);
    const res = await POST(jsonReq('POST', { code: 'taken', plan: 'solo' }));
    expect(res.status).toBe(409);
  });
});

describe('PATCH / DELETE — deactivate', () => {
  it('PATCH flips active via setInviteCodeActive', async () => {
    const res = await PATCH(jsonReq('PATCH', { id: 'ic1', active: false }));
    expect(res.status).toBe(200);
    expect(setActiveMock).toHaveBeenCalledWith('ic1', false);
  });

  it('PATCH 400 when active is not a boolean', async () => {
    const res = await PATCH(jsonReq('PATCH', { id: 'ic1' }));
    expect(res.status).toBe(400);
    expect(setActiveMock).not.toHaveBeenCalled();
  });

  it('DELETE soft-deletes (deactivates) the code', async () => {
    const res = await DELETE(new Request('http://localhost/api/admin/invite-codes?id=ic1', { method: 'DELETE' }));
    expect(res.status).toBe(200);
    expect(setActiveMock).toHaveBeenCalledWith('ic1', false);
  });

  it('DELETE 400 without an id', async () => {
    const res = await DELETE(new Request('http://localhost/api/admin/invite-codes', { method: 'DELETE' }));
    expect(res.status).toBe(400);
    expect(setActiveMock).not.toHaveBeenCalled();
  });
});
