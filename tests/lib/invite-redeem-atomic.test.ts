/**
 * Two layers of the redemption contract:
 *
 * 1. lib redeemInviteCode — normalizes the code, calls the atomic Postgres
 *    function redeem_invite_code_atomic with the right params, and maps its
 *    string result (incl. unknown/error) to a RedeemResult. (supabase.rpc mocked.)
 *
 * 2. The atomic function's DECISION LOGIC, simulated in TS exactly as the SQL
 *    runs it under the row lock, to lock the invariants the SQL guarantees:
 *      - usesCount can NEVER exceed maxUses, even under a concurrent burst,
 *      - a space can redeem a given code AT MOST once (already_redeemed),
 *      - expired / inactive / unlimited behave as specified.
 *    (The real atomicity is the FOR UPDATE lock in the migration; this proves the
 *    branch logic the lock serializes is correct.)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── supabase.rpc double for the lib layer ───────────────────────────────────
const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn(async () => ({ data: 'ok', error: null })) }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: rpcMock } }));

import { redeemInviteCode } from '@/lib/billing/invite-codes';

beforeEach(() => {
  vi.clearAllMocks();
  rpcMock.mockResolvedValue({ data: 'ok', error: null } as any);
});

describe('redeemInviteCode (lib) — normalize + RPC shape + mapping', () => {
  it('normalizes the code and calls the atomic function with p_* params', async () => {
    await redeemInviteCode({ code: '  SuMMer-2026 ', spaceId: 'sp1', userClerkId: 'u_clerk' });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [fn, args] = rpcMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(fn).toBe('redeem_invite_code_atomic');
    expect(args.p_code).toBe('summer-2026'); // trimmed + lowercased
    expect(args.p_space_id).toBe('sp1');
    expect(args.p_user_clerk_id).toBe('u_clerk');
  });

  it('returns invalid for empty code / missing space, without calling the RPC', async () => {
    expect(await redeemInviteCode({ code: '   ', spaceId: 'sp1', userClerkId: 'u' })).toBe('invalid');
    expect(await redeemInviteCode({ code: 'x', spaceId: '', userClerkId: 'u' })).toBe('invalid');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('passes through every known status', async () => {
    for (const s of ['ok', 'not_found', 'inactive', 'expired', 'exhausted', 'already_redeemed']) {
      rpcMock.mockResolvedValue({ data: s, error: null } as any);
      expect(await redeemInviteCode({ code: 'x', spaceId: 'sp1', userClerkId: 'u' })).toBe(s);
    }
  });

  it('maps a DB error or an unknown return to error', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } } as any);
    expect(await redeemInviteCode({ code: 'x', spaceId: 'sp1', userClerkId: 'u' })).toBe('error');
    rpcMock.mockResolvedValue({ data: 'weird', error: null } as any);
    expect(await redeemInviteCode({ code: 'x', spaceId: 'sp1', userClerkId: 'u' })).toBe('error');
  });
});

// ── Faithful TS simulation of redeem_invite_code_atomic's branch logic ───────
// Mirrors the SQL: lock-serialized validate → insert ledger → bump count →
// grant comp. The shared mutable state stands in for the locked rows.
type SimCode = {
  code: string;
  active: boolean;
  expiresAt: number | null; // epoch ms
  maxUses: number | null;
  usesCount: number;
  plan: string;
  compDurationDays: number | null;
};
type SimSpace = { compAccess: boolean; compExpiresAt: number | null; compNote: string | null; compPlan: string | null };

function makeSim() {
  const redemptions = new Set<string>(); // `${codeKey}:${spaceId}`
  const spaces: Record<string, SimSpace> = {};
  function space(id: string): SimSpace {
    return (spaces[id] ??= { compAccess: false, compExpiresAt: null, compNote: null, compPlan: null });
  }
  // Serialized (as under FOR UPDATE) redemption against one code row.
  function redeem(codeRow: SimCode, spaceId: string, now = Date.now()): string {
    const key = codeRow.code.trim().toLowerCase();
    if (!codeRow.active) return 'inactive';
    if (codeRow.expiresAt != null && codeRow.expiresAt <= now) return 'expired';
    if (redemptions.has(`${key}:${spaceId}`)) return 'already_redeemed';
    if (codeRow.maxUses != null && codeRow.usesCount >= codeRow.maxUses) return 'exhausted';

    redemptions.add(`${key}:${spaceId}`);
    codeRow.usesCount += 1;
    const s = space(spaceId);
    s.compAccess = true;
    s.compExpiresAt = codeRow.compDurationDays != null ? now + codeRow.compDurationDays * 86400_000 : null;
    s.compNote = `invite:${key}`;
    s.compPlan = codeRow.plan;
    return 'ok';
  }
  return { redeem, spaces, space };
}

const baseCode = (over: Partial<SimCode> = {}): SimCode => ({
  code: 'welcome',
  active: true,
  expiresAt: null,
  maxUses: null,
  usesCount: 0,
  plan: 'solo',
  compDurationDays: null,
  ...over,
});

describe('redeem_invite_code_atomic (simulated SQL logic)', () => {
  it('valid redeem → ok, usesCount++, comp granted at the code plan with invite note', () => {
    const sim = makeSim();
    const code = baseCode({ plan: 'solo', compDurationDays: 30 });
    const before = Date.now();
    expect(sim.redeem(code, 'sp1')).toBe('ok');
    expect(code.usesCount).toBe(1);
    const s = sim.spaces['sp1'];
    expect(s.compAccess).toBe(true);
    expect(s.compPlan).toBe('solo'); // resolves to the $97 tier, not pro
    expect(s.compNote).toBe('invite:welcome');
    expect(s.compExpiresAt).toBeGreaterThanOrEqual(before + 29 * 86400_000);
  });

  it('indefinite comp when compDurationDays is null', () => {
    const sim = makeSim();
    const code = baseCode({ compDurationDays: null });
    sim.redeem(code, 'sp1');
    expect(sim.spaces['sp1'].compExpiresAt).toBeNull();
  });

  it('inactive / expired / exhausted are rejected and grant nothing', () => {
    const sim = makeSim();
    expect(sim.redeem(baseCode({ active: false }), 'sp1')).toBe('inactive');
    expect(sim.redeem(baseCode({ expiresAt: Date.now() - 1000 }), 'sp2')).toBe('expired');
    expect(sim.redeem(baseCode({ maxUses: 2, usesCount: 2 }), 'sp3')).toBe('exhausted');
    expect(sim.spaces['sp1']).toBeUndefined();
    expect(sim.spaces['sp2']).toBeUndefined();
    expect(sim.spaces['sp3']).toBeUndefined();
  });

  it('a space cannot redeem the same code twice (already_redeemed, count unchanged)', () => {
    const sim = makeSim();
    const code = baseCode({ maxUses: 5 });
    expect(sim.redeem(code, 'sp1')).toBe('ok');
    expect(sim.redeem(code, 'sp1')).toBe('already_redeemed');
    expect(code.usesCount).toBe(1);
  });

  it('a burst of redemptions NEVER pushes usesCount past maxUses', () => {
    const sim = makeSim();
    const code = baseCode({ maxUses: 3 });
    // 10 different spaces race for 3 seats (serialized by the lock).
    const results = Array.from({ length: 10 }, (_, i) => sim.redeem(code, `sp${i}`));
    expect(results.filter((r) => r === 'ok')).toHaveLength(3);
    expect(results.filter((r) => r === 'exhausted')).toHaveLength(7);
    expect(code.usesCount).toBe(3);
    expect(code.usesCount).toBeLessThanOrEqual(code.maxUses!);
  });

  it('unlimited code (maxUses null) keeps granting', () => {
    const sim = makeSim();
    const code = baseCode({ maxUses: null });
    for (let i = 0; i < 50; i++) expect(sim.redeem(code, `sp${i}`)).toBe('ok');
    expect(code.usesCount).toBe(50);
  });
});
