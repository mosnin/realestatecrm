/**
 * resolveBillingAccount — proves invite-code comp is strictly per-space and that
 * a NON-redeeming space's billing is untouched.
 *
 *   - A space with comp OFF resolves to its normal stored plan + real Stripe
 *     status (the everyday paying/free path — unchanged by this feature).
 *   - A comped space with Space.compPlan = 'solo' (an invite-code grant for the
 *     $97 tier) resolves to 'solo' and isComped: true — NOT the demo default.
 *   - A comped space with NO compPlan (a legacy demo comp) still resolves to the
 *     demo default (pro), so existing comps are unchanged.
 *
 * supabase is mocked table-by-table: Space (main select) + the resilient comp
 * reads (compAccess via isAccountComped, compPlan via getCompSpacePlan).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { dbState } = vi.hoisted(() => ({
  dbState: {
    space: null as Record<string, unknown> | null,
    // What the two comp-column selects return (compAccess/compExpiresAt + compPlan).
    compAccess: null as Record<string, unknown> | null,
    compPlan: null as Record<string, unknown> | null,
  },
}));

vi.mock('@/lib/supabase', () => {
  function from(table: string): any {
    let sel = '';
    const c: any = {
      select(s: string) {
        sel = s;
        return c;
      },
      eq: () => c,
      maybeSingle: async () => {
        if (table === 'Space') {
          // Distinguish the three Space reads by their selected columns.
          if (sel.includes('compExpiresAt')) return { data: dbState.compAccess, error: null };
          if (sel.includes('compPlan')) return { data: dbState.compPlan, error: null };
          return { data: dbState.space, error: null };
        }
        return { data: null, error: null };
      },
    };
    return c;
  }
  return { supabase: { from } };
});

import { resolveBillingAccount } from '@/lib/billing/account';

beforeEach(() => {
  vi.clearAllMocks();
  dbState.space = null;
  dbState.compAccess = null;
  dbState.compPlan = null;
});

describe('resolveBillingAccount — non-redeemer billing is untouched', () => {
  it('comp OFF → normal stored plan + Stripe status, isComped false', async () => {
    dbState.space = {
      id: 'sp1',
      plan: 'free',
      brokerageId: null,
      ownerId: 'u1',
      stripeSubscriptionStatus: 'inactive',
    };
    dbState.compAccess = { compAccess: false, compExpiresAt: null };

    const ctx = await resolveBillingAccount('sp1');
    expect(ctx.isComped).toBe(false);
    expect(ctx.isUnlimited).toBe(false);
    expect(ctx.plan).toBe('free');
    expect(ctx.account).toEqual({ type: 'space', id: 'sp1' });
    expect(ctx.subscriptionStatus).toBe('inactive');
  });

  it('a paying solo subscriber with comp OFF stays solo (unchanged)', async () => {
    dbState.space = {
      id: 'sp2',
      plan: 'solo',
      brokerageId: null,
      ownerId: 'u2',
      stripeSubscriptionStatus: 'active',
    };
    dbState.compAccess = { compAccess: false, compExpiresAt: null };

    const ctx = await resolveBillingAccount('sp2');
    expect(ctx.isComped).toBe(false);
    expect(ctx.isUnlimited).toBe(false);
    expect(ctx.plan).toBe('solo');
    expect(ctx.subscriptionStatus).toBe('active');
  });
});

describe('resolveBillingAccount — invite-code comp grants the code plan', () => {
  it('comp ON + compPlan solo → resolves to solo (the $97 tier), isComped true', async () => {
    dbState.space = {
      id: 'sp3',
      plan: 'free', // stored plan stays free; comp overrides the EFFECTIVE plan
      brokerageId: null,
      ownerId: 'u3',
      stripeSubscriptionStatus: null,
    };
    dbState.compAccess = { compAccess: true, compExpiresAt: null };
    dbState.compPlan = { compPlan: 'solo' };

    const ctx = await resolveBillingAccount('sp3');
    expect(ctx.isComped).toBe(true);
    expect(ctx.plan).toBe('solo');
  });

  it('comp ON + NO compPlan (legacy demo comp) → demo default pro, unchanged', async () => {
    dbState.space = {
      id: 'sp4',
      plan: 'free',
      brokerageId: null,
      ownerId: 'u4',
      stripeSubscriptionStatus: null,
    };
    dbState.compAccess = { compAccess: true, compExpiresAt: null };
    dbState.compPlan = { compPlan: null };

    const ctx = await resolveBillingAccount('sp4');
    expect(ctx.isComped).toBe(true);
    expect(ctx.plan).toBe('pro');
  });
});
