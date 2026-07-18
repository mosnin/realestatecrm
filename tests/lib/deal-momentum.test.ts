/**
 * Behavioral tests for lib/deals/momentum.ts — computeMomentum.
 *
 * Mocks the supabase client with a queue of per-`from()` terminals (one
 * entry per call, in the exact order computeMomentum issues them) — same
 * pattern as tests/lib/deals-next-move.test.ts. Query order:
 *
 *   No closed-won history in the space (baseline query returns []):
 *     1. Deal (maybeSingle)              — the target deal
 *     2. DealActivity                    — the target deal's own activity log
 *     3. DealStage                       — stage id → name map
 *     4. Deal (won deals, for baseline)  — empty → baseline skipped
 *
 *   Space HAS closed-won history (baseline query returns rows):
 *     1-3 as above
 *     4. Deal (won deals, for baseline)  — non-empty
 *     5. DealActivity (stage_change log across those won deals)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Supabase mock: queue-driven chainable, one terminal per from() call ────
type Terminal = { data?: unknown; error?: unknown };
let supabaseQueue: Terminal[] = [];
const supabaseCalls: Array<{ table: string; chain: Array<[string, unknown[]]> }> = [];

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const calls: Array<[string, unknown[]]> = [];
    const terminal = supabaseQueue.shift() ?? { data: [], error: null };
    supabaseCalls.push({ table, chain: calls });

    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'neq', 'not', 'in', 'order', 'limit', 'update']) {
      chain[method] = vi.fn((...args: unknown[]) => {
        calls.push([method, args]);
        return chain;
      });
    }
    chain.maybeSingle = vi.fn(() => {
      calls.push(['maybeSingle', []]);
      return Promise.resolve(terminal);
    });
    chain.then = (resolve: (v: Terminal) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(terminal).then(resolve, reject);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { computeMomentum } from '@/lib/deals/momentum';

const SPACE = 'space-1';
const OTHER_SPACE = 'space-2';
const DEAL_ID = 'deal-1';
const NOW = new Date('2026-07-18T00:00:00.000Z');
const DAY = 86_400_000;

beforeEach(() => {
  supabaseQueue = [];
  supabaseCalls.length = 0;
});

function iso(daysAgo: number): string {
  return new Date(NOW.getTime() - daysAgo * DAY).toISOString();
}

function dealRow(overrides: Record<string, unknown> = {}) {
  return {
    id: DEAL_ID,
    status: 'active',
    stageId: 'stage-1',
    createdAt: iso(45),
    closedAt: null,
    ...overrides,
  };
}

function activityRow(daysAgo: number, type = 'note', metadata: Record<string, unknown> | null = null) {
  return { type, createdAt: iso(daysAgo), metadata };
}

/** Queue the 4-call sequence for a space with no closed-won baseline history. */
function queueNoBaseline(opts: {
  deal?: Record<string, unknown>;
  activities?: Array<Record<string, unknown>>;
  stages?: Array<{ id: string; name: string }>;
}) {
  supabaseQueue.push(
    { data: opts.deal ?? dealRow(), error: null },
    { data: opts.activities ?? [], error: null },
    { data: opts.stages ?? [{ id: 'stage-1', name: 'Nurturing' }], error: null },
    { data: [], error: null }, // won-deals baseline query — empty
  );
}

/** Queue the 5-call sequence for a space WITH closed-won baseline history. */
function queueWithBaseline(opts: {
  deal: Record<string, unknown>;
  activities: Array<Record<string, unknown>>;
  stages: Array<{ id: string; name: string }>;
  wonDeals: Array<Record<string, unknown>>;
  wonStageChanges?: Array<Record<string, unknown>>;
}) {
  supabaseQueue.push(
    { data: opts.deal, error: null },
    { data: opts.activities, error: null },
    { data: opts.stages, error: null },
    { data: opts.wonDeals, error: null },
    { data: opts.wonStageChanges ?? [], error: null },
  );
}

describe('computeMomentum', () => {
  it('returns null when the deal does not exist in the given space (tenant scoping)', async () => {
    supabaseQueue.push({ data: null, error: null });
    const result = await computeMomentum(OTHER_SPACE, DEAL_ID, { now: NOW });
    expect(result).toBeNull();
    // Only the one lookup query was issued — nothing else fired for a
    // deal that isn't found in this space.
    expect(supabaseCalls).toHaveLength(1);
  });

  it('scopes every query to spaceId (the .eq() IS the security boundary)', async () => {
    queueNoBaseline({
      activities: [activityRow(1), activityRow(2), activityRow(3)],
    });
    await computeMomentum(SPACE, DEAL_ID, { now: NOW });

    const dealCall = supabaseCalls.find((c) => c.table === 'Deal');
    const activityCall = supabaseCalls.find((c) => c.table === 'DealActivity');
    const stageCall = supabaseCalls.find((c) => c.table === 'DealStage');

    for (const call of [dealCall, activityCall, stageCall]) {
      const eqCalls = call!.chain.filter(([method]) => method === 'eq');
      expect(eqCalls.some(([, args]) => args[0] === 'spaceId' && args[1] === SPACE)).toBe(true);
    }
    // The target deal lookup is scoped by id AND spaceId together — a bare
    // id lookup without the spaceId filter would leak cross-tenant.
    const dealEq = dealCall!.chain.filter(([m]) => m === 'eq');
    expect(dealEq.some(([, a]) => a[0] === 'id' && a[1] === DEAL_ID)).toBe(true);
  });

  it('returns eventCount < 3 for a near-empty deal (component renders null on this)', async () => {
    queueNoBaseline({ activities: [activityRow(1), activityRow(2)] });
    const result = await computeMomentum(SPACE, DEAL_ID, { now: NOW });
    expect(result).not.toBeNull();
    expect(result!.eventCount).toBe(2);
    expect(result!.eventCount).toBeLessThan(3);
  });

  it('verdict: stalling from a long activity gap, no baseline available', async () => {
    queueNoBaseline({
      deal: dealRow({ createdAt: iso(60) }),
      activities: [activityRow(40), activityRow(25), activityRow(12)],
    });
    const result = await computeMomentum(SPACE, DEAL_ID, { now: NOW });
    expect(result!.verdict).toBe('stalling');
    expect(result!.reason).toBe('no activity in 12 days');
    expect(result!.daysSinceLastActivity).toBe(12);
    expect(result!.baselineUnavailable).toBe(true);
    expect(result!.stages).toHaveLength(1);
    expect(result!.stages[0].current).toBe(true);
    expect(result!.stages[0].baselineDays).toBeNull();
  });

  it('verdict: steady when there is a moderate, unremarkable gap since last touch', async () => {
    queueNoBaseline({
      deal: dealRow({ createdAt: iso(30) }),
      activities: [activityRow(25), activityRow(15), activityRow(5)],
    });
    const result = await computeMomentum(SPACE, DEAL_ID, { now: NOW });
    expect(result!.verdict).toBe('steady');
    expect(result!.reason).toBe('last touch 5 days ago');
    expect(result!.daysSinceLastActivity).toBe(5);
  });

  it('verdict: accelerating with a recent touch and a busy trailing week', async () => {
    queueNoBaseline({
      deal: dealRow({ createdAt: iso(30) }),
      activities: [activityRow(20), activityRow(4), activityRow(2), activityRow(0)],
    });
    const result = await computeMomentum(SPACE, DEAL_ID, { now: NOW });
    expect(result!.verdict).toBe('accelerating');
    expect(result!.reason).toBe('3 touches in the last 7 days');
    expect(result!.daysSinceLastActivity).toBe(0);
  });

  it('verdict: stalling from dwell far past the space\'s own closed-won baseline', async () => {
    const stages = [{ id: 'stage-2', name: 'Inspection' }];
    queueWithBaseline({
      deal: dealRow({ stageId: 'stage-2', createdAt: iso(40) }),
      // Last touch 2 days ago — well under the idle threshold, isolating
      // the dwell-ratio signal from the idle-gap signal.
      activities: [activityRow(10), activityRow(5), activityRow(2)],
      stages,
      wonDeals: [
        { id: 'won-a', stageId: 'stage-2', createdAt: '2026-01-01T00:00:00.000Z', closedAt: '2026-01-09T00:00:00.000Z' }, // 8d
        { id: 'won-b', stageId: 'stage-2', createdAt: '2026-02-01T00:00:00.000Z', closedAt: '2026-02-11T00:00:00.000Z' }, // 10d
        { id: 'won-c', stageId: 'stage-2', createdAt: '2026-03-01T00:00:00.000Z', closedAt: '2026-03-13T00:00:00.000Z' }, // 12d
      ],
      wonStageChanges: [],
    });
    const result = await computeMomentum(SPACE, DEAL_ID, { now: NOW });
    expect(result!.baselineUnavailable).toBe(false);
    expect(result!.stages[0].baselineDays).toBe(10); // median of 8, 10, 12
    expect(result!.verdict).toBe('stalling');
    expect(result!.reason).toBe('4.0x usual dwell in Inspection');
  });

  it('verdict: stalling combines idle-gap and dwell-ratio reasons when both fire', async () => {
    const stages = [{ id: 'stage-2', name: 'Inspection' }];
    queueWithBaseline({
      deal: dealRow({ stageId: 'stage-2', createdAt: iso(40) }),
      activities: [activityRow(30), activityRow(20), activityRow(15)], // last touch 15 days ago
      stages,
      wonDeals: [
        { id: 'won-a', stageId: 'stage-2', createdAt: '2026-01-01T00:00:00.000Z', closedAt: '2026-01-09T00:00:00.000Z' },
        { id: 'won-b', stageId: 'stage-2', createdAt: '2026-02-01T00:00:00.000Z', closedAt: '2026-02-11T00:00:00.000Z' },
        { id: 'won-c', stageId: 'stage-2', createdAt: '2026-03-01T00:00:00.000Z', closedAt: '2026-03-13T00:00:00.000Z' },
      ],
      wonStageChanges: [],
    });
    const result = await computeMomentum(SPACE, DEAL_ID, { now: NOW });
    expect(result!.verdict).toBe('stalling');
    expect(result!.reason).toBe('no activity in 15 days · 4.0x usual dwell in Inspection');
  });

  it('never treats a won/lost/on-hold deal as stalling — reports the outcome instead', async () => {
    queueNoBaseline({
      deal: dealRow({ status: 'won', closedAt: iso(1) }),
      activities: [activityRow(40), activityRow(35), activityRow(30)],
    });
    const result = await computeMomentum(SPACE, DEAL_ID, { now: NOW });
    expect(result!.verdict).toBe('steady');
    expect(result!.reason).toBe('Deal is closed won');
  });
});
