/**
 * requireContactAccess must follow the contact's space, not the caller's
 * first-owned book. An invited teammate on Pixar can open Pixar contacts;
 * owning Apple must not grant a peek at someone else's row.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const { authUser, dbUser, contact, ownedSpace, memberSpace, seat } = vi.hoisted(() => ({
  authUser: { value: 'clerk_1' },
  dbUser: { value: { id: 'u2' } as { id: string } | null },
  contact: { value: { spaceId: 'pixar' } as { spaceId: string } | null },
  ownedSpace: { value: null as null | { id: string; ownerId: string; slug: string } },
  memberSpace: { value: { id: 'pixar', ownerId: 'u1', slug: 'pixar' } as {
    id: string;
    ownerId: string;
    slug: string;
  } | null },
  seat: { value: { id: 'seat_1' } as { id: string } | null },
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: authUser.value }),
}));

vi.mock('@/lib/supabase-guard', () => ({
  unscoped: (q: unknown) => q,
}));

vi.mock('@/lib/tenant-db', () => ({
  tenantTable: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: seat.value, error: null }),
      }),
    }),
  }),
}));

vi.mock('@/lib/permissions', () => ({
  isUserPlatformAdmin: async () => false,
}));

vi.mock('@/lib/space', () => ({
  getSpaceFromSlug: vi.fn(),
  getSpaceForUser: vi.fn(async () => {
    throw new Error('requireContactAccess must not use getSpaceForUser');
  }),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const eqs: Record<string, unknown> = {};
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = (col: string, val: unknown) => {
        eqs[col] = val;
        return chain;
      };
      chain.maybeSingle = async () => {
        if (table === 'User') return { data: dbUser.value, error: null };
        if (table === 'Contact') return { data: contact.value, error: null };
        if (table === 'Space') {
          if (eqs.ownerId) {
            if (
              ownedSpace.value &&
              ownedSpace.value.ownerId === eqs.ownerId &&
              ownedSpace.value.id === eqs.id
            ) {
              return { data: ownedSpace.value, error: null };
            }
            return { data: null, error: null };
          }
          return { data: memberSpace.value, error: null };
        }
        return { data: null, error: null };
      };
      return chain;
    },
  },
}));

import { requireContactAccess } from '@/lib/api-auth';

beforeEach(() => {
  authUser.value = 'clerk_1';
  dbUser.value = { id: 'u2' };
  contact.value = { spaceId: 'pixar' };
  ownedSpace.value = null;
  memberSpace.value = { id: 'pixar', ownerId: 'u1', slug: 'pixar' };
  seat.value = { id: 'seat_1' };
});

describe('requireContactAccess', () => {
  it('lets an invited teammate open a contact in that workspace', async () => {
    const result = await requireContactAccess('c1');
    expect(result).not.toBeInstanceOf(NextResponse);
    if (result instanceof NextResponse) return;
    expect(result.space.id).toBe('pixar');
    expect(result.userId).toBe('clerk_1');
  });

  it('404s a contact in a workspace the caller does not belong to', async () => {
    seat.value = null;
    ownedSpace.value = { id: 'apple', ownerId: 'u2', slug: 'apple' };
    const result = await requireContactAccess('c1');
    expect(result).toBeInstanceOf(NextResponse);
    if (result instanceof NextResponse) {
      expect(result.status).toBe(404);
    }
  });
});
