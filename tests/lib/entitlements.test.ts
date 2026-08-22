/**
 * Application-owner unlimited access. Fail-closed: a missing row, an
 * offboarded admin, or a lookup error must NEVER grant the bypass.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { dbState } = vi.hoisted(() => ({
  dbState: {
    row: null as Record<string, unknown> | null,
    error: null as { message?: string } | null,
    throwOnSelect: false,
  },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      const c: Record<string, unknown> = {};
      c.select = () => c;
      c.eq = () => c;
      c.maybeSingle = async () => {
        if (dbState.throwOnSelect) throw new Error('db down');
        return { data: dbState.row, error: dbState.error };
      };
      return c;
    },
  },
}));

vi.mock('@/lib/permissions', () => ({
  isPlatformAdmin: vi.fn(async () => false),
}));

import { isSpaceOwnerUnlimited, hasUnlimitedFeatureAccess } from '@/lib/billing/entitlements';
import { isPlatformAdmin } from '@/lib/permissions';

beforeEach(() => {
  dbState.row = null;
  dbState.error = null;
  dbState.throwOnSelect = false;
  vi.mocked(isPlatformAdmin).mockResolvedValue(false);
});

describe('isSpaceOwnerUnlimited', () => {
  it('is true only for a live platform admin owner', async () => {
    dbState.row = { platformRole: 'admin', status: 'active' };
    expect(await isSpaceOwnerUnlimited('user_admin')).toBe(true);
  });

  it('is false for a regular space owner (tenant still pays)', async () => {
    dbState.row = { platformRole: 'user', status: 'active' };
    expect(await isSpaceOwnerUnlimited('user_realtor')).toBe(false);
  });

  it('is false for an offboarded admin', async () => {
    dbState.row = { platformRole: 'admin', status: 'offboarded' };
    expect(await isSpaceOwnerUnlimited('user_ex')).toBe(false);
  });

  it('fails closed on a missing row, lookup error, or thrown query', async () => {
    expect(await isSpaceOwnerUnlimited('missing')).toBe(false);
    dbState.error = { message: 'schema cache' };
    expect(await isSpaceOwnerUnlimited('user_1')).toBe(false);
    dbState.error = null;
    dbState.throwOnSelect = true;
    expect(await isSpaceOwnerUnlimited('user_1')).toBe(false);
  });

  it('fails closed on a null/empty owner id (never infers admin)', async () => {
    dbState.row = { platformRole: 'admin', status: 'active' };
    expect(await isSpaceOwnerUnlimited(null)).toBe(false);
    expect(await isSpaceOwnerUnlimited('')).toBe(false);
  });
});

describe('hasUnlimitedFeatureAccess', () => {
  it('is the session admin check — not a tenant-wide unlock', async () => {
    vi.mocked(isPlatformAdmin).mockResolvedValue(true);
    expect(await hasUnlimitedFeatureAccess()).toBe(true);
    vi.mocked(isPlatformAdmin).mockResolvedValue(false);
    expect(await hasUnlimitedFeatureAccess()).toBe(false);
  });
});
