import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  spacesByOwner,
  spaceById,
  spaceBySlug,
  membershipsByUser,
  membershipsBySpaceUser,
  invitations,
  usersByEmail,
  insertSpace,
  insertInvite,
  paid,
  comped,
  isAdmin,
} = vi.hoisted(() => ({
  spacesByOwner: [] as Array<{
    id: string;
    slug: string;
    name: string;
    ownerId: string;
    createdAt?: string;
    stripeSubscriptionStatus?: string;
    stripePeriodEnd?: string | null;
  }>,
  spaceById: { value: null as null | {
    id: string;
    slug: string;
    name: string;
    ownerId: string;
    stripeSubscriptionStatus?: string;
    stripePeriodEnd?: string | null;
  } },
  spaceBySlug: { value: null as null | { id: string } },
  membershipsByUser: [] as Array<{ spaceId: string; role: string }>,
  membershipsBySpaceUser: { value: null as null | { id: string } },
  invitations: { value: null as null | {
    id: string;
    token: string;
    spaceId: string;
    email: string;
    role: string;
    status: string;
    expiresAt: string;
  } },
  usersByEmail: { value: null as null | { id: string } },
  insertSpace: [] as Record<string, unknown>[],
  insertInvite: [] as Record<string, unknown>[],
  paid: { value: false },
  comped: { value: false },
  isAdmin: { value: false },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      const eqs: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = vi.fn(self);
      chain.eq = vi.fn((col: string, val: unknown) => {
        eqs[col] = val;
        return chain;
      });
      chain.in = vi.fn(self);
      chain.gt = vi.fn(self);
      chain.order = vi.fn(self);
      chain.limit = vi.fn(self);
      chain.insert = vi.fn((row: Record<string, unknown>) => {
        if (table === 'Space') insertSpace.push(row);
        if (table === 'SpaceInvitation') insertInvite.push(row);
        return chain;
      });
      chain.update = vi.fn(self);
      chain.upsert = vi.fn(self);
      chain.maybeSingle = vi.fn(async () => {
        if (table === 'Space') {
          if (eqs.ownerId && spaceById.value && spaceById.value.ownerId !== eqs.ownerId) {
            return { data: null, error: null };
          }
          if (spaceById.value) return { data: spaceById.value, error: null };
          if (spaceBySlug.value) return { data: spaceBySlug.value, error: null };
          return { data: null, error: null };
        }
        if (table === 'SpaceMembership') return { data: membershipsBySpaceUser.value, error: null };
        if (table === 'SpaceInvitation') return { data: invitations.value, error: null };
        if (table === 'User') return { data: usersByEmail.value, error: null };
        return { data: null, error: null };
      });
      chain.then = (
        resolve: (v: { data: unknown; error: null; count?: number }) => unknown,
        reject?: (e: unknown) => unknown,
      ) => {
        const payload =
          table === 'Space'
            ? { data: spacesByOwner, error: null, count: spacesByOwner.length }
            : table === 'SpaceMembership'
              ? { data: membershipsByUser, error: null }
              : { data: [], error: null, count: 0 };
        return Promise.resolve(payload).then(resolve, reject);
      };
      return chain;
    },
  },
}));

vi.mock('@/lib/tenant-db', () => ({
  tenantTable: (_client: unknown, table: string) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = vi.fn(self);
    chain.eq = vi.fn(self);
    chain.gt = vi.fn(self);
    chain.order = vi.fn(self);
    chain.insert = vi.fn((row: Record<string, unknown>) => {
      if (table === 'SpaceInvitation') insertInvite.push(row);
      return chain;
    });
    chain.update = vi.fn(self);
    chain.upsert = vi.fn(self);
    chain.maybeSingle = vi.fn(async () => {
      if (table === 'SpaceMembership') return { data: membershipsBySpaceUser.value, error: null };
      if (table === 'SpaceInvitation') return { data: invitations.value, error: null };
      return { data: null, error: null };
    });
    chain.then = (
      resolve: (v: { data: unknown; error: null; count?: number }) => unknown,
    ) => Promise.resolve({ data: [], error: null, count: 0 }).then(resolve);
    return chain;
  },
}));

vi.mock('@/lib/supabase-guard', () => ({
  unscoped: (q: unknown) => q,
}));

vi.mock('@/lib/api-auth', () => ({
  hasCurrentSubscription: () => paid.value,
}));

vi.mock('@/lib/billing/comp', () => ({
  isAccountComped: async () => comped.value,
}));

vi.mock('@/lib/permissions', () => ({
  isUserPlatformAdmin: async () => isAdmin.value,
}));

vi.mock('@/lib/pipelines', () => ({
  ensureDefaultPipelines: vi.fn(async () => []),
}));

import {
  acceptSpaceInvitation,
  createAdditionalWorkspace,
  inviteToWorkspace,
  isPaidEntitlement,
  isValidInviteEmail,
  slugFromBusinessName,
  uniqueSlugCandidate,
} from '@/lib/workspaces';

describe('workspace helpers', () => {
  it('builds a valid slug from a business name', () => {
    expect(slugFromBusinessName('Pixar Animation')).toBe('pixaranimation');
  });

  it('suffixes a taken slug', () => {
    expect(uniqueSlugCandidate('apple', 0)).toBe('apple');
    expect(uniqueSlugCandidate('apple', 1)).toBe('apple-2');
  });

  it('treats a live subscription or comp as paid', () => {
    expect(isPaidEntitlement({ status: 'inactive', periodEnd: null })).toBe(false);
    expect(
      isPaidEntitlement({
        status: 'active',
        periodEnd: '2099-01-01',
        comped: true,
      }),
    ).toBe(true);
  });

  it('validates invite emails', () => {
    expect(isValidInviteEmail('ada@pixar.com')).toBe(true);
    expect(isValidInviteEmail('nope')).toBe(false);
  });
});

describe('createAdditionalWorkspace', () => {
  beforeEach(() => {
    spacesByOwner.length = 0;
    insertSpace.length = 0;
    spaceBySlug.value = null;
    spaceById.value = null;
    paid.value = false;
    comped.value = false;
    isAdmin.value = false;
  });

  it('refuses a second business on a free account', async () => {
    spacesByOwner.push({
      id: 's1',
      slug: 'apple',
      name: 'Apple',
      ownerId: 'u1',
      stripeSubscriptionStatus: 'inactive',
      stripePeriodEnd: null,
    });
    const result = await createAdditionalWorkspace({
      ownerUserId: 'u1',
      clerkUserId: 'clerk_1',
      name: 'Pixar',
    });
    expect(result).toMatchObject({ ok: false, status: 402 });
    expect(insertSpace).toHaveLength(0);
  });

  it('creates another business when the owner is paid', async () => {
    paid.value = true;
    spacesByOwner.push({
      id: 's1',
      slug: 'apple',
      name: 'Apple',
      ownerId: 'u1',
      stripeSubscriptionStatus: 'active',
      stripePeriodEnd: '2099-01-01',
    });
    const result = await createAdditionalWorkspace({
      ownerUserId: 'u1',
      clerkUserId: 'clerk_1',
      name: 'Pixar',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.slug).toMatch(/pixar/);
    expect(insertSpace[0]).toMatchObject({ name: 'Pixar', ownerId: 'u1' });
  });
});

describe('inviteToWorkspace', () => {
  beforeEach(() => {
    spacesByOwner.length = 0;
    paid.value = false;
    spaceById.value = {
      id: 's1',
      slug: 'apple',
      name: 'Apple',
      ownerId: 'u1',
    };
    membershipsBySpaceUser.value = { id: 'own' };
    invitations.value = null;
    usersByEmail.value = null;
    insertInvite.length = 0;
  });

  it('refuses invites on a free workspace', async () => {
    const result = await inviteToWorkspace({
      spaceId: 's1',
      actorUserId: 'u1',
      clerkUserId: 'clerk_1',
      email: 'ada@pixar.com',
    });
    expect(result).toMatchObject({ ok: false, status: 402 });
    expect(insertInvite).toHaveLength(0);
  });

  it('refuses an invite from someone who cannot manage the workspace', async () => {
    paid.value = true;
    spaceById.value = {
      id: 's1',
      slug: 'apple',
      name: 'Apple',
      ownerId: 'u1',
    };
    membershipsBySpaceUser.value = null;
    const result = await inviteToWorkspace({
      spaceId: 's1',
      actorUserId: 'u2',
      clerkUserId: 'clerk_2',
      email: 'ada@pixar.com',
    });
    expect(result).toMatchObject({ ok: false, status: 403 });
    expect(insertInvite).toHaveLength(0);
  });

  it('creates an invite when the owner is paid', async () => {
    paid.value = true;
    spacesByOwner.push({
      id: 's1',
      slug: 'apple',
      name: 'Apple',
      ownerId: 'u1',
      stripeSubscriptionStatus: 'active',
      stripePeriodEnd: '2099-01-01',
    });
    const result = await inviteToWorkspace({
      spaceId: 's1',
      actorUserId: 'u1',
      clerkUserId: 'clerk_1',
      email: 'ada@pixar.com',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.email).toBe('ada@pixar.com');
      expect(result.inviteUrl).toContain('/invite/space/');
    }
    expect(insertInvite[0]).toMatchObject({ email: 'ada@pixar.com', spaceId: 's1' });
  });
});

describe('acceptSpaceInvitation', () => {
  it('rejects the wrong email', async () => {
    invitations.value = {
      id: 'inv1',
      token: 'tok',
      spaceId: 's1',
      email: 'ada@pixar.com',
      role: 'member',
      status: 'pending',
      expiresAt: '2099-01-01T00:00:00.000Z',
    };
    const result = await acceptSpaceInvitation({
      token: 'tok',
      userId: 'u2',
      email: 'other@x.com',
    });
    expect(result).toMatchObject({ ok: false, status: 403 });
  });
});
