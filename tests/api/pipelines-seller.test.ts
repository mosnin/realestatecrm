/**
 * GET /api/pipelines backfills missing default boards (seller) before listing.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { ensureMock } = vi.hoisted(() => ({
  ensureMock: vi.fn(async () => ({ created: ['seller'] })),
}));

vi.mock('@/lib/deals/default-pipelines', () => ({
  ensureDefaultPipelines: ensureMock,
}));
vi.mock('@/lib/api-auth', () => ({
  requireSpaceOwner: vi.fn(async () => ({
    userId: 'clerk_1',
    space: { id: 'space_1', slug: 'jane', name: 'Jane', ownerId: 'u1' },
  })),
}));

vi.mock('@/lib/supabase', () => {
  function makeChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      order: vi.fn(() => chain),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve({
          data: [
            { id: 'p_r', name: 'Rental Pipeline', spaceId: 'space_1', position: 0 },
            { id: 'p_b', name: 'Buyer Pipeline', spaceId: 'space_1', position: 1 },
            { id: 'p_s', name: 'Seller Pipeline', spaceId: 'space_1', position: 2 },
          ],
          error: null,
        }).then(resolve, reject),
    };
    return chain;
  }
  return { supabase: { from: vi.fn(() => makeChain()) } };
});

import { GET } from '@/app/api/pipelines/route';

beforeEach(() => {
  vi.clearAllMocks();
  ensureMock.mockResolvedValue({ created: ['seller'] });
});

describe('GET /api/pipelines', () => {
  it('ensures default boards (including seller) then lists them', async () => {
    const res = await GET(new NextRequest('http://localhost/api/pipelines?slug=jane'));
    expect(res.status).toBe(200);
    expect(ensureMock).toHaveBeenCalledWith('space_1');
    const json = (await res.json()) as Array<{ name: string }>;
    expect(json.map((p) => p.name)).toContain('Seller Pipeline');
  });
});
