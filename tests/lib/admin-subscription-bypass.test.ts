/**
 * requireActiveSubscription — platform admins (application owner) bypass the
 * paywall. Regular users on a lapsed space do not. Feature access only;
 * this helper never opens another tenant's space.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { isUserPlatformAdmin } = vi.hoisted(() => ({
  isUserPlatformAdmin: vi.fn(async () => false),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'u1' })) }));
vi.mock('@/lib/space', () => ({
  getSpaceFromSlug: vi.fn(),
  getSpaceForUser: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/lib/permissions', () => ({ isUserPlatformAdmin }));

import { requireActiveSubscription } from '@/lib/api-auth';
import type { Space } from '@/lib/types';

const LAPSED = {
  id: 'sp1',
  slug: 'acme',
  stripeSubscriptionStatus: 'canceled',
  stripePeriodEnd: '2026-01-01T00:00:00.000Z',
} as Space;

beforeEach(() => {
  isUserPlatformAdmin.mockReset();
  isUserPlatformAdmin.mockResolvedValue(false);
});

describe('requireActiveSubscription admin bypass', () => {
  it('lets a platform admin through a canceled space (unlimited owner access)', async () => {
    isUserPlatformAdmin.mockResolvedValue(true);
    const result = await requireActiveSubscription(LAPSED, 'admin_clerk');
    expect(result).toBeNull();
    expect(isUserPlatformAdmin).toHaveBeenCalledWith('admin_clerk');
  });

  it('blocks a regular user on the same canceled space', async () => {
    const result = await requireActiveSubscription(LAPSED, 'realtor_clerk');
    expect(result).not.toBeNull();
    expect(result?.status).toBe(403);
  });
});
