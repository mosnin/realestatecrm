/**
 * resolveBillingAccount — application-owner (platform-admin space owner)
 * gets the top plan + unlimited usage. A neighboring non-admin space is
 * unchanged (tenant isolation / billing isolation).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { dbState } = vi.hoisted(() => ({
  dbState: {
    space: null as Record<string, unknown> | null,
    user: null as Record<string, unknown> | null,
    compAccess: null as Record<string, unknown> | null,
    compPlan: null as Record<string, unknown> | null,
  },
}));

vi.mock('@/lib/supabase', () => {
  function from(table: string): Record<string, unknown> {
    let sel = '';
    const c: Record<string, unknown> = {
      select(s: string) {
        sel = s;
        return c;
      },
      eq: () => c,
      maybeSingle: async () => {
        if (table === 'User') return { data: dbState.user, error: null };
        if (table === 'Space') {
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
import { OWNER_ADMIN_SPACE_PLAN } from '@/lib/billing/entitlements';

beforeEach(() => {
  dbState.space = null;
  dbState.user = null;
  dbState.compAccess = { compAccess: false, compExpiresAt: null };
  dbState.compPlan = null;
});

describe('resolveBillingAccount — owner/admin unlimited access', () => {
  it('admin-owned space → top plan, unlimited, not billed through Stripe/comp columns', async () => {
    dbState.space = {
      id: 'sp_admin',
      plan: 'free',
      brokerageId: 'brokerage_customer',
      ownerId: 'admin_user',
      stripeSubscriptionStatus: 'canceled',
      stripePeriodEnd: null,
    };
    dbState.user = { platformRole: 'admin', status: 'active' };

    const ctx = await resolveBillingAccount('sp_admin');
    expect(ctx.isUnlimited).toBe(true);
    expect(ctx.isComped).toBe(false);
    expect(ctx.plan).toBe(OWNER_ADMIN_SPACE_PLAN);
    expect(ctx.account).toEqual({ type: 'space', id: 'sp_admin' });
    // Does not pool into the linked brokerage — would drain a customer.
    expect(ctx.account.type).toBe('space');
  });

  it('regular owner on free stays free and not unlimited (isolation)', async () => {
    dbState.space = {
      id: 'sp_customer',
      plan: 'free',
      brokerageId: null,
      ownerId: 'realtor_1',
      stripeSubscriptionStatus: 'inactive',
      stripePeriodEnd: null,
    };
    dbState.user = { platformRole: 'user', status: 'active' };

    const ctx = await resolveBillingAccount('sp_customer');
    expect(ctx.isUnlimited).toBe(false);
    expect(ctx.isComped).toBe(false);
    expect(ctx.plan).toBe('free');
  });

  it('offboarded admin owner does not keep the bypass', async () => {
    dbState.space = {
      id: 'sp_ex',
      plan: 'solo',
      brokerageId: null,
      ownerId: 'ex_admin',
      stripeSubscriptionStatus: 'active',
      stripePeriodEnd: '2026-09-01T00:00:00.000Z',
    };
    dbState.user = { platformRole: 'admin', status: 'offboarded' };

    const ctx = await resolveBillingAccount('sp_ex');
    expect(ctx.isUnlimited).toBe(false);
    expect(ctx.plan).toBe('solo');
  });
});
