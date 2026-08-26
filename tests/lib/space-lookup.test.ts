/**
 * Post-login workspace resolution. The dashboard layout and /auth/redirect
 * both have to survive a partial schema (a selected column missing in this
 * environment) — throwing used to render the full-screen
 * "couldn't load your workspace" page after a successful Clerk sign-in.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fromMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}));

vi.mock('@/lib/supabase-guard', () => ({
  unscoped: (q: unknown) => q,
}));

import {
  loadDashboardUser,
  querySpaceBySlug,
  SPACE_SELECT_CORE,
  SPACE_SELECT_FULL,
} from '@/lib/space';

const SPACE = {
  id: 'space-1',
  slug: 'acme',
  name: 'Acme',
  ownerId: 'user-1',
  brokerageId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function spaceLookup(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        limit: vi.fn(() => ({
          maybeSingle: vi.fn(async () => result),
        })),
      })),
    })),
  };
}

function userLookup(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => result),
      })),
    })),
  };
}

function ownedSpacesLookup(rows: Array<{ id: string }>) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({ data: rows, error: null })),
      })),
    })),
  };
}

function membershipLookup(rows: Array<{ spaceId: string }>) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ data: rows, error: null })),
    })),
  };
}

beforeEach(() => {
  fromMock.mockReset();
});

describe('querySpaceBySlug', () => {
  it('returns the space on a full-column hit', async () => {
    fromMock.mockReturnValueOnce(
      spaceLookup({
        data: { ...SPACE, emoji: '🏠', stripeSubscriptionStatus: 'active', stripePeriodEnd: null },
        error: null,
      }),
    );

    const space = await querySpaceBySlug('Acme');
    expect(space?.id).toBe('space-1');
    expect(fromMock).toHaveBeenCalledWith('Space');
    const select = fromMock.mock.results[0].value.select;
    expect(select).toHaveBeenCalledWith(SPACE_SELECT_FULL);
  });

  it('retries with core columns when a selected column is missing', async () => {
    fromMock
      .mockReturnValueOnce(
        spaceLookup({
          data: null,
          error: { code: 'PGRST204', message: "Could not find the 'emoji' column of 'Space' in the schema cache" },
        }),
      )
      .mockReturnValueOnce(spaceLookup({ data: SPACE, error: null }));

    const space = await querySpaceBySlug('acme');
    expect(space).toEqual(SPACE);
    expect(fromMock).toHaveBeenCalledTimes(2);
    expect(fromMock.mock.results[1].value.select).toHaveBeenCalledWith(SPACE_SELECT_CORE);
  });

  it('does not swallow a real database failure', async () => {
    fromMock.mockReturnValueOnce(
      spaceLookup({ data: null, error: { code: '57014', message: 'statement timeout' } }),
    );

    await expect(querySpaceBySlug('acme')).rejects.toMatchObject({ code: '57014' });
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it('returns null for an empty slug instead of querying', async () => {
    await expect(querySpaceBySlug('@@@')).resolves.toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe('loadDashboardUser', () => {
  it('loads the user and their owned space', async () => {
    fromMock
      .mockReturnValueOnce(
        userLookup({
          data: { id: 'user-1', onboard: true, platformRole: 'user', name: 'Ada' },
          error: null,
        }),
      )
      .mockReturnValueOnce(ownedSpacesLookup([{ id: 'space-1' }]))
      .mockReturnValueOnce(membershipLookup([]));

    await expect(loadDashboardUser('clerk_1')).resolves.toEqual({
      id: 'user-1',
      name: 'Ada',
      onboard: true,
      isPlatformAdmin: false,
      space: { id: 'space-1' },
      accessibleSpaceIds: ['space-1'],
    });
  });

  it('retries without platformRole when that column is missing', async () => {
    fromMock
      .mockReturnValueOnce(
        userLookup({
          data: null,
          error: { code: '42703', message: 'column "platformRole" does not exist' },
        }),
      )
      .mockReturnValueOnce(
        userLookup({ data: { id: 'user-1', onboard: true, name: 'Ada' }, error: null }),
      )
      .mockReturnValueOnce(ownedSpacesLookup([{ id: 'space-1' }]))
      .mockReturnValueOnce(membershipLookup([]));

    await expect(loadDashboardUser('clerk_1')).resolves.toMatchObject({
      id: 'user-1',
      isPlatformAdmin: false,
      space: { id: 'space-1' },
      accessibleSpaceIds: ['space-1'],
    });
    expect(fromMock.mock.results[1].value.select).toHaveBeenCalledWith('id, onboard, name');
  });

  it('returns null when the Clerk user has no row yet', async () => {
    fromMock.mockReturnValueOnce(userLookup({ data: null, error: null }));
    await expect(loadDashboardUser('clerk_new')).resolves.toBeNull();
  });
});
