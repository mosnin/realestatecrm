/**
 * Behavioral tests for the graded admin RBAC in lib/permissions.ts:
 *   - getAdminRole() resolves the stored tier, defaults a legacy admin (null
 *     adminRole) to super_admin, and returns null for non-admins/offboarded.
 *   - requireAdminCapability() allows a role that holds the capability and
 *     throws for one that doesn't (the least-privilege boundary).
 *
 * Clerk auth + the Supabase user lookup are mocked; the capability map is the
 * real one from the module under test.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { authMock } = vi.hoisted(() => ({
  authMock: vi.fn(async () => ({ userId: 'admin_clerk' as string | null })),
}));
vi.mock('@clerk/nextjs/server', () => ({ auth: authMock }));

const { dbState } = vi.hoisted(() => ({
  dbState: {
    row: null as Record<string, unknown> | null,
    error: null as unknown,
  },
}));
vi.mock('@/lib/supabase', () => {
  function chain(): any {
    const c: any = {
      select: () => c,
      eq: () => c,
      maybeSingle: async () => ({ data: dbState.row, error: dbState.error }),
    };
    return c;
  }
  return { supabase: { from: () => chain() } };
});

import { getAdminRole, requireAdminCapability, ADMIN_CAPABILITIES } from '@/lib/permissions';

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ userId: 'admin_clerk' } as any);
  dbState.row = null;
  dbState.error = null;
});

describe('getAdminRole', () => {
  it('returns the stored graded tier for an admin', async () => {
    dbState.row = { platformRole: 'admin', adminRole: 'admin_billing', status: 'active' };
    expect(await getAdminRole()).toBe('admin_billing');
  });

  it('defaults a legacy admin with NULL adminRole to super_admin (never locks out)', async () => {
    dbState.row = { platformRole: 'admin', adminRole: null, status: 'active' };
    expect(await getAdminRole()).toBe('super_admin');
  });

  it('returns null for a non-admin', async () => {
    dbState.row = { platformRole: 'user', adminRole: null, status: 'active' };
    expect(await getAdminRole()).toBeNull();
  });

  it('returns null for an offboarded admin', async () => {
    dbState.row = { platformRole: 'admin', adminRole: 'super_admin', status: 'offboarded' };
    expect(await getAdminRole()).toBeNull();
  });

  it('returns null when unauthenticated', async () => {
    authMock.mockResolvedValueOnce({ userId: null } as any);
    expect(await getAdminRole()).toBeNull();
  });
});

describe('requireAdminCapability', () => {
  it('allows super_admin on a destructive capability', async () => {
    dbState.row = { platformRole: 'admin', adminRole: 'super_admin', status: 'active' };
    const res = await requireAdminCapability('users:delete');
    expect(res).toEqual({ clerkUserId: 'admin_clerk', adminRole: 'super_admin' });
  });

  it('DENIES admin_readonly on a destructive capability', async () => {
    dbState.row = { platformRole: 'admin', adminRole: 'admin_readonly', status: 'active' };
    await expect(requireAdminCapability('users:delete')).rejects.toThrow(/Forbidden/);
  });

  it('DENIES admin_support on a billing capability but allows support:write', async () => {
    dbState.row = { platformRole: 'admin', adminRole: 'admin_support', status: 'active' };
    await expect(requireAdminCapability('billing:refund')).rejects.toThrow(/Forbidden/);
    // Same role satisfies a support capability.
    dbState.row = { platformRole: 'admin', adminRole: 'admin_support', status: 'active' };
    await expect(requireAdminCapability('support:write')).resolves.toMatchObject({ adminRole: 'admin_support' });
  });

  it('allows admin_billing on billing capabilities', async () => {
    dbState.row = { platformRole: 'admin', adminRole: 'admin_billing', status: 'active' };
    await expect(requireAdminCapability('billing:credit')).resolves.toMatchObject({ adminRole: 'admin_billing' });
  });

  it('throws for a non-admin', async () => {
    dbState.row = { platformRole: 'user', adminRole: null, status: 'active' };
    await expect(requireAdminCapability('support:write')).rejects.toThrow(/Forbidden/);
  });

  it('every capability lists only valid admin tiers', () => {
    const valid = new Set(['admin_readonly', 'admin_support', 'admin_billing', 'super_admin']);
    for (const roles of Object.values(ADMIN_CAPABILITIES)) {
      for (const r of roles) expect(valid.has(r)).toBe(true);
    }
  });
});
