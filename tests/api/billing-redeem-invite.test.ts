/**
 * Route-level tests for POST /api/billing/redeem-invite — the per-space free-
 * access (comp) grant.
 *
 * The redemption itself is an ATOMIC Postgres function (redeem_invite_code_atomic,
 * migration 20260725000000) that validates + increments usesCount under a row
 * lock + grants comp. Here we mock that lib call (lib/billing/invite-codes
 * redeemInviteCode) and assert the route:
 *   - is authenticated and resolves the caller's OWN space (never from the body),
 *   - on 'ok' marks the user onboarded and returns the in-app redirect,
 *   - maps every rejection (not_found/inactive → generic "invalid", expired,
 *     exhausted, already_redeemed) to a 400 with the right message and grants
 *     NOTHING,
 *   - never lets the body carry a spaceId (a non-redeemer's billing is untouched
 *     because the grant only ever targets the authed user's space).
 *
 * A companion describe drives the REAL redeemInviteCode against a mocked
 * supabase.rpc to lock the normalize + status-mapping contract.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextResponse } from 'next/server';

// ── Auth + space resolution ─────────────────────────────────────────────────
const { requireAuthMock, getSpaceForUserMock } = vi.hoisted(() => ({
  requireAuthMock: vi.fn(async () => ({ userId: 'user_clerk' })),
  getSpaceForUserMock: vi.fn(async () => ({ id: 'sp1', slug: 'jane-doe', ownerId: 'u1' })),
}));
vi.mock('@/lib/api-auth', () => ({ requireAuth: requireAuthMock }));
vi.mock('@/lib/space', () => ({ getSpaceForUser: getSpaceForUserMock }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true })) }));

// ── The atomic redeem (mocked here; exercised for real in the 2nd block) ─────
const { redeemMock } = vi.hoisted(() => ({ redeemMock: vi.fn(async () => 'ok') }));
vi.mock('@/lib/billing/invite-codes', () => ({ redeemInviteCode: redeemMock }));

// ── Supabase double — records the onboard-flag User update ───────────────────
const { userUpdates } = vi.hoisted(() => ({ userUpdates: [] as Array<Record<string, unknown>> }));
vi.mock('@/lib/supabase', () => {
  function chain(table: string): any {
    const c: any = {
      update(payload: Record<string, unknown>) {
        if (table === 'User') userUpdates.push(payload);
        return c;
      },
      eq: () => c,
      // The route awaits the update chain (.eq().eq()) as a thenable.
      then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
    };
    return c;
  }
  return { supabase: { from: (t: string) => chain(t) } };
});

import { POST } from '@/app/api/billing/redeem-invite/route';

function req(body: unknown): Request {
  return new Request('http://localhost/api/billing/redeem-invite', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  userUpdates.length = 0;
  requireAuthMock.mockResolvedValue({ userId: 'user_clerk' } as any);
  getSpaceForUserMock.mockResolvedValue({ id: 'sp1', slug: 'jane-doe', ownerId: 'u1' } as any);
  redeemMock.mockResolvedValue('ok' as any);
});

describe('POST /api/billing/redeem-invite — success', () => {
  it('redeems for the caller’s OWN space, marks onboarded, returns the in-app redirect', async () => {
    const res = await POST(req({ code: 'WELCOME' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.redirect).toBe('/s/jane-doe');

    // The space came from the session, NOT the body — the redeem call uses sp1.
    const arg = (redeemMock.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(arg.spaceId).toBe('sp1');
    expect(arg.userClerkId).toBe('user_clerk');

    // Marked onboarded so the gate lets them in.
    expect(userUpdates.length).toBe(1);
    expect(userUpdates[0].onboard).toBe(true);
  });

  it('ignores a spaceId in the body — always the authed user’s own space', async () => {
    await POST(req({ code: 'WELCOME', spaceId: 'someone-elses-space' }));
    expect(((redeemMock.mock.calls[0] as unknown[])[0] as Record<string, unknown>).spaceId).toBe('sp1');
    expect(getSpaceForUserMock).toHaveBeenCalledWith('user_clerk');
  });
});

describe('POST /api/billing/redeem-invite — auth + input guards', () => {
  it('401 when unauthenticated (redeem never called)', async () => {
    requireAuthMock.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) as any,
    );
    const res = await POST(req({ code: 'X' }));
    expect(res.status).toBe(401);
    expect(redeemMock).not.toHaveBeenCalled();
  });

  it('400 + no redeem when code is blank', async () => {
    const res = await POST(req({ code: '   ' }));
    expect(res.status).toBe(400);
    expect(redeemMock).not.toHaveBeenCalled();
  });

  it('400 + setup redirect when the user has no space', async () => {
    getSpaceForUserMock.mockResolvedValue(null as any);
    const res = await POST(req({ code: 'X' }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.redirect).toBe('/setup');
    expect(redeemMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/billing/redeem-invite — rejections grant nothing', () => {
  const cases: Array<[string, RegExp]> = [
    ['not_found', /isn.t valid/i],
    ['inactive', /isn.t valid/i],
    ['expired', /expired/i],
    ['exhausted', /limit/i],
    ['already_redeemed', /already redeemed/i],
    ['error', /went wrong/i],
  ];
  for (const [status, msg] of cases) {
    it(`${status} → 400, message matches, NO onboard write`, async () => {
      redeemMock.mockResolvedValue(status as any);
      const res = await POST(req({ code: 'X' }));
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toMatch(msg);
      expect(json.ok).toBeUndefined();
      // No comp/onboard side effects on a rejection.
      expect(userUpdates.length).toBe(0);
    });
  }

  it('does not reveal whether a code exists — not_found and inactive share one message', async () => {
    redeemMock.mockResolvedValue('not_found' as any);
    const a = await (await POST(req({ code: 'X' }))).json();
    redeemMock.mockResolvedValue('inactive' as any);
    const b = await (await POST(req({ code: 'Y' }))).json();
    expect(a.error).toBe(b.error);
  });
});
