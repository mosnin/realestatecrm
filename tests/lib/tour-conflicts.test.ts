/**
 * tourWindowConflicts is the reschedule twin of book_tour_atomic's overlap
 * predicate. Fail-closed on lookup error so a flaky read cannot double-book.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  result: { data: [] as unknown[], error: null as { message: string } | null },
  neq: vi.fn(),
}));

vi.mock('@/lib/supabase', () => {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    select: self,
    eq: self,
    in: self,
    lt: self,
    gt: self,
    limit: self,
    neq: (...a: unknown[]) => {
      h.neq(...a);
      return chain;
    },
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(h.result).then(resolve, reject),
  });
  return { supabase: { from: vi.fn(() => chain) } };
});

import { tourWindowConflicts } from '@/lib/tours/conflicts';

beforeEach(() => {
  h.result = { data: [], error: null };
  h.neq.mockClear();
});

describe('tourWindowConflicts', () => {
  it('is false when no overlapping scheduled/confirmed tour exists', async () => {
    h.result = { data: [], error: null };
    await expect(
      tourWindowConflicts({
        spaceId: 's_1',
        startsAt: '2026-07-15T18:00:00.000Z',
        endsAt: '2026-07-15T18:30:00.000Z',
        excludeTourId: 't_self',
      }),
    ).resolves.toBe(false);
    expect(h.neq).toHaveBeenCalledWith('id', 't_self');
  });

  it('is true when another tour overlaps the window', async () => {
    h.result = { data: [{ id: 't_other' }], error: null };
    await expect(
      tourWindowConflicts({
        spaceId: 's_1',
        startsAt: '2026-07-15T18:00:00.000Z',
        endsAt: '2026-07-15T18:30:00.000Z',
      }),
    ).resolves.toBe(true);
  });

  it('fails closed when the lookup errors', async () => {
    h.result = { data: [], error: { message: 'timeout' } };
    await expect(
      tourWindowConflicts({
        spaceId: 's_1',
        startsAt: '2026-07-15T18:00:00.000Z',
        endsAt: '2026-07-15T18:30:00.000Z',
      }),
    ).resolves.toBe(true);
  });
});
