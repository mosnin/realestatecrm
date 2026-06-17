/**
 * Route-level tests for the brokerage member-management endpoints added in this
 * branch:
 *   - PATCH /api/admin/memberships/[id]   change member role (refuses owner)
 *   - POST  /api/admin/memberships        invite/add a member (seat-gated)
 *
 * Supabase, Clerk auth, rate-limit, audit, email + seat checks are mocked.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { requireMock } = vi.hoisted(() => ({
  requireMock: vi.fn(async () => ({ clerkUserId: 'admin_clerk' })),
}));
vi.mock('@/lib/permissions', () => ({ requirePlatformAdmin: requireMock }));
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'admin_clerk' })) }));
const { logAdminActionMock } = vi.hoisted(() => ({ logAdminActionMock: vi.fn(async (..._a: any[]) => undefined) }));
vi.mock('@/lib/admin', () => ({ logAdminAction: logAdminActionMock }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true })) }));
const { sendInviteMock } = vi.hoisted(() => ({ sendInviteMock: vi.fn(async (..._a: any[]) => undefined) }));
vi.mock('@/lib/email', () => ({ sendBrokerageInvitation: sendInviteMock }));
const { seatCheckMock } = vi.hoisted(() => ({
  seatCheckMock: vi.fn(async () => ({ ok: true, usage: { plan: 'team', seatLimit: 5, used: 1 } })),
}));
vi.mock('@/lib/brokerage-seats', () => ({ checkSeatCapacity: seatCheckMock }));
const { syncSeatMock } = vi.hoisted(() => ({ syncSeatMock: vi.fn(() => undefined) }));
vi.mock('@/lib/billing/brokerage-seat-billing', () => ({ syncBrokerageSeatBilling: syncSeatMock }));

// ── Supabase double — per-table single rows + recorded writes/inserts ────────
const { dbState } = vi.hoisted(() => ({
  dbState: {
    rows: {} as Record<string, Record<string, unknown> | null>,
    inserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
    writes: [] as Array<{ table: string; payload: Record<string, unknown> }>,
    insertReturn: {} as Record<string, Record<string, unknown>>,
  },
}));
vi.mock('@/lib/supabase', () => {
  function chain(table: string): any {
    const c: any = {
      select: () => c,
      eq: () => c,
      update(payload: Record<string, unknown>) {
        dbState.writes.push({ table, payload });
        return c;
      },
      insert(payload: Record<string, unknown>) {
        dbState.inserts.push({ table, payload });
        return c;
      },
      single: async () => ({ data: dbState.insertReturn[table] ?? { id: `${table}_new`, ...((dbState.inserts.at(-1)?.payload) ?? {}) }, error: null }),
      maybeSingle: async () => ({ data: dbState.rows[table] ?? null, error: null }),
    };
    return c;
  }
  return { supabase: { from: (t: string) => chain(t) } };
});

import { PATCH } from '@/app/api/admin/memberships/[id]/route';
import { POST } from '@/app/api/admin/memberships/route';

const MID = '22222222-2222-2222-2222-222222222222';
const BID = '33333333-3333-3333-3333-333333333333';

beforeEach(() => {
  vi.clearAllMocks();
  dbState.rows = {};
  dbState.inserts = [];
  dbState.writes = [];
  dbState.insertReturn = {};
  requireMock.mockResolvedValue({ clerkUserId: 'admin_clerk' } as any);
  seatCheckMock.mockResolvedValue({ ok: true, usage: { plan: 'team', seatLimit: 5, used: 1 } } as any);
});

describe('PATCH /api/admin/memberships/[id] — change role', () => {
  const params = { params: Promise.resolve({ id: MID }) };
  function req(body: unknown) {
    return new Request(`http://localhost/api/admin/memberships/${MID}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('403s when not admin', async () => {
    requireMock.mockRejectedValueOnce(new Error('Forbidden'));
    expect((await PATCH(req({ role: 'broker_admin' }), params)).status).toBe(403);
  });

  it('updates the role + audits', async () => {
    dbState.rows['BrokerageMembership'] = { id: MID, role: 'realtor_member', userId: 'u1', brokerageId: BID };
    const res = await PATCH(req({ role: 'broker_admin' }), params);
    expect(res.status).toBe(200);
    expect(dbState.writes.find((w) => w.table === 'BrokerageMembership')!.payload.role).toBe('broker_admin');
    expect(logAdminActionMock.mock.calls[0][0]).toMatchObject({ action: 'update_membership_role' });
  });

  it('refuses to change a broker_owner role (no write)', async () => {
    dbState.rows['BrokerageMembership'] = { id: MID, role: 'broker_owner', userId: 'u1', brokerageId: BID };
    const res = await PATCH(req({ role: 'broker_admin' }), params);
    expect(res.status).toBe(400);
    expect(dbState.writes.length).toBe(0);
  });

  it('rejects an invalid role', async () => {
    const res = await PATCH(req({ role: 'broker_owner' }), params);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/admin/memberships — invite/add', () => {
  function req(body: unknown) {
    return new Request('http://localhost/api/admin/memberships', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('403s when not admin', async () => {
    requireMock.mockRejectedValueOnce(new Error('Forbidden'));
    expect((await POST(req({ brokerageId: BID, email: 'x@y.com', role: 'realtor_member' }))).status).toBe(403);
  });

  it('adds an existing non-member user directly + bumps seat billing', async () => {
    dbState.rows['Brokerage'] = { id: BID, name: 'Acme' };
    // User lookup returns an existing user; membership lookup returns null (not a member).
    dbState.rows['User'] = { id: 'u_existing' };
    dbState.rows['BrokerageMembership'] = null;
    dbState.rows['Space'] = { id: 'sp1' };
    dbState.insertReturn['BrokerageMembership'] = { id: 'm_new', brokerageId: BID, userId: 'u_existing', role: 'realtor_member' };
    const res = await POST(req({ brokerageId: BID, email: 'x@y.com', role: 'realtor_member' }));
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.added).toBe(true);
    expect(dbState.inserts.some((i) => i.table === 'BrokerageMembership')).toBe(true);
    expect(syncSeatMock).toHaveBeenCalledWith(BID);
    expect(logAdminActionMock.mock.calls[0][0]).toMatchObject({ action: 'add_membership' });
  });

  it('creates a pending invitation + sends email for a new email', async () => {
    dbState.rows['Brokerage'] = { id: BID, name: 'Acme' };
    dbState.rows['User'] = null; // no existing user
    dbState.rows['Invitation'] = null; // no pending invite
    dbState.insertReturn['Invitation'] = { id: 'inv_new', token: 'tok_123', brokerageId: BID, email: 'new@y.com' };
    const res = await POST(req({ brokerageId: BID, email: 'new@y.com', role: 'broker_admin' }));
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.invitation).toBeTruthy();
    expect(sendInviteMock).toHaveBeenCalledTimes(1);
    expect(sendInviteMock.mock.calls[0][0]).toMatchObject({ toEmail: 'new@y.com', token: 'tok_123' });
    expect(logAdminActionMock.mock.calls[0][0]).toMatchObject({ action: 'invite_member' });
  });

  it('blocks when the seat limit is reached (402, no insert)', async () => {
    dbState.rows['Brokerage'] = { id: BID, name: 'Acme' };
    dbState.rows['User'] = null;
    seatCheckMock.mockResolvedValueOnce({ ok: false, usage: { plan: 'team', seatLimit: 5, used: 5 }, needed: 1 } as any);
    const res = await POST(req({ brokerageId: BID, email: 'new@y.com', role: 'realtor_member' }));
    expect(res.status).toBe(402);
    expect(dbState.inserts.length).toBe(0);
  });

  it('409s when the user is already a member', async () => {
    dbState.rows['Brokerage'] = { id: BID, name: 'Acme' };
    dbState.rows['User'] = { id: 'u_existing' };
    dbState.rows['BrokerageMembership'] = { id: 'm_existing' };
    const res = await POST(req({ brokerageId: BID, email: 'x@y.com', role: 'realtor_member' }));
    expect(res.status).toBe(409);
  });

  it('rejects an invalid email', async () => {
    const res = await POST(req({ brokerageId: BID, email: 'not-an-email', role: 'realtor_member' }));
    expect(res.status).toBe(400);
  });
});
