/**
 * Workspace create + invite routes. Extra businesses and teammates are
 * paid-only — the route must surface that as 402, not create the row.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  requireAuth,
  createAdditionalWorkspace,
  inviteToWorkspace,
  listWorkspacesForUser,
  ownerHasPaidWorkspace,
  sendSpaceInvitation,
} = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  createAdditionalWorkspace: vi.fn(),
  inviteToWorkspace: vi.fn(),
  listWorkspacesForUser: vi.fn(),
  ownerHasPaidWorkspace: vi.fn(),
  sendSpaceInvitation: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  requireAuth,
  requireSpaceOwner: vi.fn(async () => ({
    userId: 'clerk_1',
    space: { id: 's1', slug: 'apple', name: 'Apple', ownerId: 'u1' },
  })),
}));

vi.mock('@/lib/workspaces', () => ({
  createAdditionalWorkspace,
  inviteToWorkspace,
  listWorkspacesForUser,
  ownerHasPaidWorkspace,
}));

vi.mock('@/lib/email', () => ({ sendSpaceInvitation }));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

vi.mock('@/lib/validation', () => ({
  BODY_LIMITS: { smallJson: 4096 },
  readJsonWithLimit: vi.fn(async (req: Request) => ({
    ok: true as const,
    data: await req.json(),
  })),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { id: 'u1', name: 'Steve' }, error: null }),
        }),
      }),
    }),
  },
}));

vi.mock('@/lib/tenant-db', () => ({
  tenantTable: () => ({
    select: () => ({
      order: async () => ({ data: [], error: null }),
      eq: () => ({
        gt: () => ({
          order: async () => ({ data: [], error: null }),
        }),
      }),
    }),
  }),
}));

import { POST as createWorkspace, GET as listWorkspaces } from '@/app/api/workspaces/route';
import { POST as inviteWorkspace } from '@/app/api/workspaces/invite/route';

beforeEach(() => {
  requireAuth.mockResolvedValue({ userId: 'clerk_1' });
  createAdditionalWorkspace.mockReset();
  inviteToWorkspace.mockReset();
  listWorkspacesForUser.mockReset();
  ownerHasPaidWorkspace.mockReset();
  sendSpaceInvitation.mockReset();
});

describe('POST /api/workspaces', () => {
  it('returns 402 when the owner is not paid', async () => {
    createAdditionalWorkspace.mockResolvedValue({
      ok: false,
      status: 402,
      error: 'Adding another business is available on a paid plan.',
    });
    const res = await createWorkspace(
      new Request('http://t/api/workspaces', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Pixar' }),
      }),
    );
    expect(res.status).toBe(402);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Adding another business is available on a paid plan.',
    });
  });

  it('creates another business when the owner is paid', async () => {
    createAdditionalWorkspace.mockResolvedValue({
      ok: true,
      slug: 'pixar',
      id: 's2',
    });
    const res = await createWorkspace(
      new Request('http://t/api/workspaces', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Pixar' }),
      }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ slug: 'pixar', id: 's2' });
  });
});

describe('GET /api/workspaces', () => {
  it('lists books and whether the owner can create another', async () => {
    listWorkspacesForUser.mockResolvedValue([
      { id: 's1', slug: 'apple', name: 'Apple', role: 'owner' },
    ]);
    ownerHasPaidWorkspace.mockResolvedValue(false);
    const res = await listWorkspaces();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      canCreate: false,
      canInvite: false,
      workspaces: [{ slug: 'apple', role: 'owner' }],
    });
  });
});

describe('POST /api/workspaces/invite', () => {
  it('returns 402 when inviting on a free account', async () => {
    inviteToWorkspace.mockResolvedValue({
      ok: false,
      status: 402,
      error: 'Adding people to a workspace is available on a paid plan.',
    });
    const res = await inviteWorkspace(
      new Request('http://t/api/workspaces/invite', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: 'apple', email: 'ada@pixar.com' }),
      }),
    );
    expect(res.status).toBe(402);
    expect(sendSpaceInvitation).not.toHaveBeenCalled();
  });

  it('sends an invite when the owner is paid', async () => {
    inviteToWorkspace.mockResolvedValue({
      ok: true,
      token: 'tok123',
      inviteUrl: 'https://www.usechippi.com/invite/space/tok123',
      email: 'ada@pixar.com',
    });
    const res = await inviteWorkspace(
      new Request('http://t/api/workspaces/invite', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: 'apple', email: 'ada@pixar.com' }),
      }),
    );
    expect(res.status).toBe(200);
    expect(sendSpaceInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ toEmail: 'ada@pixar.com', token: 'tok123' }),
    );
  });
});
