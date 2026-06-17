/**
 * Security test for `POST /api/invitations/[token]` — BrokerageRemoval deny-list.
 *
 * Bug (Fix 4): accepting an invite silently revived an offboarded user
 * (flipping User.status back to 'active'), bypassing the removal intent that
 * the BrokerageRemoval deny-list records — the same deny-list broker/join
 * enforces. A removed user on the deny-list must NOT be silently re-admitted;
 * the broker has to clear the removal record first.
 *
 * This verifies the invite-acceptance path now blocks with a 403 when a
 * BrokerageRemoval row exists, and does NOT create a membership.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({ userId: 'clerk_123' })),
  currentUser: vi.fn(async () => null),
}));

vi.mock('@/lib/audit', () => ({ audit: vi.fn(async () => undefined) }));
vi.mock('@/lib/broker-notify', () => ({ notifyBroker: vi.fn(async () => undefined) }));
vi.mock('@/lib/notification-voice', () => ({
  notificationForMemberJoined: vi.fn(() => ({ title: 't', description: 'd' })),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
  getClientIp: vi.fn(() => '127.0.0.1'),
}));
vi.mock('@/lib/brokerage-seats', () => ({
  checkSeatCapacity: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/lib/billing/brokerage-seat-billing', () => ({
  syncBrokerageSeatBilling: vi.fn(() => undefined),
}));

// ── Supabase mock — per-table queue (mirrors batch-approve test) ────────────
type Terminal = { data?: unknown; error?: unknown };
const queues: Record<string, Terminal[]> = {};
const insertCalls: Array<{ table: string; values: unknown }> = [];

function queueFor(table: string) {
  if (!queues[table]) queues[table] = [];
  return queues[table];
}

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const q = queueFor(table);
    const terminal = q.shift() ?? { data: null, error: null };
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.update = vi.fn(() => chain);
    chain.insert = vi.fn((values: unknown) => {
      insertCalls.push({ table, values });
      return chain;
    });
    chain.upsert = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(() => Promise.resolve(terminal));
    chain.single = vi.fn(() => Promise.resolve(terminal));
    chain.then = (resolve: (v: Terminal) => unknown) => Promise.resolve(terminal).then(resolve);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

import { POST } from '@/app/api/invitations/[token]/route';

function makeReq() {
  return new Request('http://localhost/api/invitations/tok_abc', { method: 'POST' });
}
const params = Promise.resolve({ token: 'tok_abc' });

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(queues)) delete queues[k];
  insertCalls.length = 0;
});

describe('POST /api/invitations/[token] — removal deny-list', () => {
  it('blocks acceptance with 403 when the user is on the brokerage removal list', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    // 1. Invitation lookup → pending, not expired
    queueFor('Invitation').push({
      data: {
        id: 'inv_1',
        status: 'pending',
        email: 'removed@example.com',
        roleToAssign: 'realtor_member',
        expiresAt: future,
        brokerageId: 'brk_1',
        invitedById: 'owner_db',
      },
      error: null,
    });
    // 2. Brokerage active
    queueFor('Brokerage').push({ data: { id: 'brk_1', status: 'active' }, error: null });
    // 3. User exists, email matches the invite
    queueFor('User').push({ data: { id: 'user_db_1', email: 'removed@example.com' }, error: null });
    // 4. Not already a member
    queueFor('BrokerageMembership').push({ data: null, error: null });
    // 5. Deny-list HIT — a removal record exists
    queueFor('BrokerageRemoval').push({ data: { brokerageId: 'brk_1' }, error: null });

    const res = await POST(makeReq(), { params });
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/removed/i);

    // Must NOT have created a membership for the removed user.
    expect(insertCalls.find((c) => c.table === 'BrokerageMembership')).toBeUndefined();
  });

  it('allows acceptance when there is no removal record', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    queueFor('Invitation').push({
      data: {
        id: 'inv_2',
        status: 'pending',
        email: 'ok@example.com',
        roleToAssign: 'realtor_member',
        expiresAt: future,
        brokerageId: 'brk_1',
        invitedById: 'owner_db',
      },
      error: null,
    });
    queueFor('Brokerage').push({ data: { id: 'brk_1', status: 'active' }, error: null });
    queueFor('User').push({ data: { id: 'user_db_2', email: 'ok@example.com' }, error: null });
    queueFor('BrokerageMembership').push({ data: null, error: null }); // not a member
    queueFor('BrokerageRemoval').push({ data: null, error: null }); // deny-list MISS
    queueFor('BrokerageMembership').push({ data: null, error: null }); // membership insert
    // status revival update, Space lookup, Invitation accepted update — default terminals
    queueFor('Space').push({ data: null, error: null });

    const res = await POST(makeReq(), { params });
    expect(res.status).toBe(200);
    // Membership WAS created on the clean path.
    expect(insertCalls.find((c) => c.table === 'BrokerageMembership')).toBeDefined();
  });
});
