/**
 * Route-level tests for the platform-admin credit tools
 * (POST /api/admin/billing) — Fix #5's backend, exercised through the route the
 * new UI calls. The credit grant/refund run through atomic Postgres RPCs
 * (grant_credits / refund_credit_txn); here we MOCK the RPC layer and assert the
 * route calls it with the right shape, audits the action, and validates input.
 *
 *   grant  → grant_credits(reason 'manual_admin', amount, expiry) + audit
 *   refund → binds the txn to the account, then refund_credit_txn(txnId) + audit
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Auth / audit / rate-limit.
vi.mock('@/lib/permissions', () => ({
  requirePlatformAdmin: vi.fn(async () => ({ clerkUserId: 'admin_clerk' })),
}));
const { logAdminActionMock } = vi.hoisted(() => ({ logAdminActionMock: vi.fn(async (..._args: any[]) => undefined) }));
vi.mock('@/lib/admin', () => ({ logAdminAction: logAdminActionMock }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true })) }));

// ── Supabase double: capture rpc() calls + serve configurable reads ─────────
const { rpcMock, dbState } = vi.hoisted(() => ({
  rpcMock: vi.fn(async (..._args: any[]) => ({ data: null, error: null })),
  dbState: {
    // CreditLot rows for getCreditBalance (select id, remaining, expiresAt)
    creditLots: [] as Array<{ id: string; remaining: number; expiresAt: string | null }>,
    // CreditTxn row for the refund ownership check (select accountType, accountId)
    txn: null as { accountType: string; accountId: string } | null,
    // CreditTxn rows for getRecentTxns
    recentTxns: [] as unknown[],
  },
}));

vi.mock('@/lib/supabase', () => {
  function from(table: string): any {
    const c: any = {
      _table: table,
      select: () => c,
      eq: () => c,
      gt: () => c,
      order: () => c,
      limit: async () => ({ data: dbState.recentTxns, error: null }),
      maybeSingle: async () => ({ data: table === 'CreditTxn' ? dbState.txn : null, error: null }),
      // getCreditBalance terminates on .gt('remaining', 0) awaited as a thenable.
      then: (resolve: (v: { data: unknown; error: null }) => void) => {
        if (table === 'CreditLot') return resolve({ data: dbState.creditLots, error: null });
        return resolve({ data: [], error: null });
      },
    };
    return c;
  }
  return { supabase: { from, rpc: rpcMock } };
});

import { POST } from '@/app/api/admin/billing/route';

function req(body: unknown): Request {
  return new Request('http://localhost/api/admin/billing', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  rpcMock.mockResolvedValue({ data: null, error: null } as any);
  dbState.creditLots = [{ id: 'lot1', remaining: 500, expiresAt: null }];
  dbState.txn = null;
  dbState.recentTxns = [];
});

describe('POST /api/admin/billing — grant (Fix #5, mock RPC)', () => {
  it('grants credits via grant_credits with reason manual_admin + 30-day expiry, and audits', async () => {
    const res = await POST(req({ action: 'grant', accountType: 'space', accountId: 'sp1', amount: 1000, expiry: '30d' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);

    // grant_credits called with the right params (an expiry date present for 30d).
    const grantCall = rpcMock.mock.calls.find((c) => c[0] === 'grant_credits');
    expect(grantCall).toBeTruthy();
    const params = grantCall![1] as Record<string, unknown>;
    expect(params.p_account_type).toBe('space');
    expect(params.p_account_id).toBe('sp1');
    expect(params.p_amount).toBe(1000);
    expect(params.p_reason).toBe('manual_admin');
    expect(typeof params.p_expires_at).toBe('string'); // 30-day rollover expiry

    // Action audited.
    expect(logAdminActionMock).toHaveBeenCalledTimes(1);
    expect(logAdminActionMock.mock.calls[0][0]).toMatchObject({ action: 'billing_grant_credits', target: 'space:sp1' });
  });

  it('grants a never-expiring lot when expiry=never (p_expires_at null)', async () => {
    await POST(req({ action: 'grant', accountType: 'brokerage', accountId: 'br1', amount: 5000, expiry: 'never' }));
    const grantCall = rpcMock.mock.calls.find((c) => c[0] === 'grant_credits');
    const params = grantCall![1] as Record<string, unknown>;
    expect(params.p_account_id).toBe('br1');
    expect(params.p_expires_at).toBeNull();
  });

  it('rejects a non-positive / non-integer / oversized amount without calling the RPC', async () => {
    for (const amount of [0, -5, 1.5, 2_000_000]) {
      rpcMock.mockClear();
      const res = await POST(req({ action: 'grant', accountType: 'space', accountId: 'sp1', amount }));
      expect(res.status).toBe(400);
      expect(rpcMock).not.toHaveBeenCalled();
    }
  });

  it('rejects a missing/invalid account', async () => {
    const res = await POST(req({ action: 'grant', accountType: 'nope', accountId: 'sp1', amount: 10 }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/admin/billing — refund a credit txn (account-bound)', () => {
  it('reverses the txn via refund_credit_txn when it belongs to the account', async () => {
    dbState.txn = { accountType: 'space', accountId: 'sp1' };
    const res = await POST(req({ action: 'refund', accountType: 'space', accountId: 'sp1', txnId: 'txn_1' }));
    expect(res.status).toBe(200);
    const refundCall = rpcMock.mock.calls.find((c) => c[0] === 'refund_credit_txn');
    expect(refundCall).toBeTruthy();
    expect((refundCall![1] as Record<string, unknown>).p_txn_id).toBe('txn_1');
    expect(logAdminActionMock.mock.calls[0][0]).toMatchObject({ action: 'billing_refund_credits' });
  });

  it('refuses to reverse a txn that belongs to a different account (no RPC)', async () => {
    dbState.txn = { accountType: 'space', accountId: 'OTHER' };
    const res = await POST(req({ action: 'refund', accountType: 'space', accountId: 'sp1', txnId: 'txn_1' }));
    expect(res.status).toBe(400);
    expect(rpcMock.mock.calls.some((c) => c[0] === 'refund_credit_txn')).toBe(false);
  });

  it('404s when the txn does not exist', async () => {
    dbState.txn = null;
    const res = await POST(req({ action: 'refund', accountType: 'space', accountId: 'sp1', txnId: 'missing' }));
    expect(res.status).toBe(404);
  });
});
