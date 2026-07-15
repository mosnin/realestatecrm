/**
 * Behavioral test: composeBriefDashboard wires the reactivation engine into the
 * Brief roll-up. The engine itself is covered in tests/lib/reactivation.test.ts;
 * here we assert the fan-out calls it with the caller's spaceId and threads its
 * results into the typed dashboard payload the bento renders — and that a thrown
 * engine read degrades to an empty section rather than blanking the dashboard.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { computeReactivationsMock, topReferrersMock } = vi.hoisted(() => ({
  computeReactivationsMock: vi.fn(),
  topReferrersMock: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// Permissive supabase: every read resolves empty so the sibling gatherers
// (counts, pipeline, hot leads, tours, reputation) return their calm zeros.
vi.mock('@/lib/supabase', () => {
  function makeChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'is', 'not', 'lte', 'gte', 'gt', 'contains', 'neq', 'order', 'limit']) {
      chain[m] = () => chain;
    }
    const terminal = { data: [], count: 0, error: null };
    chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
    chain.single = () => Promise.resolve({ data: null, error: null });
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(terminal).then(resolve);
    return chain;
  }
  return { supabase: { from: vi.fn(() => makeChain()) } };
});

vi.mock('@/lib/briefing/compose', () => ({
  composeBrief: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('@/lib/briefing/sections', () => ({
  composePipelineSummary: vi.fn(() => Promise.resolve(null)),
  composeOvernight: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('@/lib/reactivation', () => ({
  computeReactivations: computeReactivationsMock,
  topReferrers: topReferrersMock,
}));

import { composeBriefDashboard } from '@/lib/briefing/dashboard';

const SPACE = 'space-1';
const OWNER = 'user-1';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('composeBriefDashboard — reactivation wiring', () => {
  it('calls the engine with the space and returns its reactivations + referrers', async () => {
    const reactivations = [
      {
        id: 'c1',
        name: 'Dana',
        lastClosedAt: '2025-10-01T00:00:00.000Z',
        monthsSince: 9,
        dealValue: 850_000,
        daysSinceTouch: null,
        reason: 'Closed 9mo ago · no follow-up logged',
      },
    ];
    const referrers = [{ id: 'c1', name: 'Dana', referralCount: 3 }];
    computeReactivationsMock.mockResolvedValue(reactivations);
    topReferrersMock.mockResolvedValue(referrers);

    const result = await composeBriefDashboard(SPACE, OWNER);

    expect(computeReactivationsMock).toHaveBeenCalledWith(SPACE);
    expect(topReferrersMock).toHaveBeenCalledWith(SPACE);
    expect(result.reactivations).toEqual(reactivations);
    expect(result.topReferrers).toEqual(referrers);
  });

  it('degrades a thrown engine read to an empty section', async () => {
    computeReactivationsMock.mockRejectedValue(new Error('db down'));
    topReferrersMock.mockRejectedValue(new Error('column not live'));

    const result = await composeBriefDashboard(SPACE, OWNER);

    expect(result.reactivations).toEqual([]);
    expect(result.topReferrers).toEqual([]);
  });
});
