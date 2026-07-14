/**
 * Route-level tests for `GET /api/cron/next-moves`.
 *
 * The daily tick loads active deals whose nextMoveComputedAt is NULL or
 * stale, drops deals in billing-blocked spaces, and recomputes the rest with
 * bounded concurrency via computeNextMove (mocked here — its own behavior is
 * covered in tests/lib/deals-next-move.test.ts).
 *
 * Mock strategy mirrors tests/api/cron-routines.test.ts: queue-driven
 * supabase chainable, env snapshot/restore, secrets asserted fail-closed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { computeNextMoveMock } = vi.hoisted(() => ({
  computeNextMoveMock: vi.fn(),
}));

// ── Supabase mock ───────────────────────────────────────────────────────────
type Terminal = { data?: unknown; error?: unknown };
let supabaseQueue: Terminal[] = [];
const supabaseCalls: Array<{ table: string; chain: Array<[string, unknown[]]> }> = [];

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const calls: Array<[string, unknown[]]> = [];
    const terminal = supabaseQueue.shift() ?? { data: [], error: null };
    supabaseCalls.push({ table, chain: calls });

    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'or', 'order', 'limit', 'update']) {
      chain[method] = vi.fn((...args: unknown[]) => {
        calls.push([method, args]);
        return chain;
      });
    }
    chain.then = (resolve: (v: Terminal) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(terminal).then(resolve, reject);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

vi.mock('@/lib/deals/next-move', () => ({
  computeNextMove: computeNextMoveMock,
}));

import { GET } from '@/app/api/cron/next-moves/route';

// ── Env helpers ─────────────────────────────────────────────────────────────
const ENV_KEYS = ['CRON_SECRET', 'CRON_NEXT_MOVES_DISABLED'] as const;
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

function snapshotEnv() {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
}
function restoreEnv() {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function invoke(authHeader?: string) {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers.Authorization = authHeader;
  const req = new Request('http://localhost/api/cron/next-moves', { method: 'GET', headers });
  return GET(req as unknown as Parameters<typeof GET>[0]);
}

/** Queue: due deals, then the space billing lookup. */
function queueTick(opts: {
  due: Array<{ id: string; spaceId: string }>;
  activeSpaceIds: string[];
  statusBySpace?: Record<string, string>;
}) {
  const spaceIds = [...new Set(opts.due.map((d) => d.spaceId))];
  const spaceRows = spaceIds.map((id) => ({
    id,
    stripeSubscriptionStatus:
      opts.statusBySpace?.[id] ?? (opts.activeSpaceIds.includes(id) ? 'active' : 'canceled'),
    stripePeriodEnd: opts.activeSpaceIds.includes(id) ? '2099-01-01T00:00:00.000Z' : null,
  }));
  supabaseQueue = [
    { data: opts.due, error: null },
    { data: spaceRows, error: null },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  supabaseQueue = [];
  supabaseCalls.length = 0;
  computeNextMoveMock.mockResolvedValue({
    text: 'Check in with Dana',
    kind: 'follow_up',
    computedAt: new Date().toISOString(),
  });

  snapshotEnv();
  process.env.CRON_SECRET = 'test-secret';
  delete process.env.CRON_NEXT_MOVES_DISABLED;
});

afterEach(() => {
  restoreEnv();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/cron/next-moves — auth', () => {
  it('rejects a missing Authorization header → 401, no DB or compute calls', async () => {
    const res = await invoke(undefined);
    expect(res.status).toBe(401);
    expect(supabaseCalls).toHaveLength(0);
    expect(computeNextMoveMock).not.toHaveBeenCalled();
  });

  it('rejects the wrong secret → 401', async () => {
    const res = await invoke('Bearer nope');
    expect(res.status).toBe(401);
    expect(computeNextMoveMock).not.toHaveBeenCalled();
  });

  it('missing CRON_SECRET env fails closed → 500', async () => {
    delete process.env.CRON_SECRET;
    const res = await invoke('Bearer test-secret');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Server misconfigured' });
    expect(computeNextMoveMock).not.toHaveBeenCalled();
  });

  it('CRON_NEXT_MOVES_DISABLED short-circuits → 200 disabled, no DB read', async () => {
    process.env.CRON_NEXT_MOVES_DISABLED = '1';
    queueTick({ due: [{ id: 'd1', spaceId: 's1' }], activeSpaceIds: ['s1'] });
    const res = await invoke('Bearer test-secret');
    expect(await res.json()).toEqual({ status: 'disabled' });
    expect(supabaseCalls).toHaveLength(0);
  });
});

describe('GET /api/cron/next-moves — selection and gating', () => {
  it('no due deals → 200 zeroed, only the Deal query runs', async () => {
    queueTick({ due: [], activeSpaceIds: [] });
    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body).toMatchObject({ due: 0, computed: 0, skipped: 0 });
    expect(supabaseCalls.map((c) => c.table)).toEqual(['Deal']);
    expect(computeNextMoveMock).not.toHaveBeenCalled();
  });

  it('the due query targets active deals with a null-or-stale computedAt, capped at 100', async () => {
    queueTick({ due: [], activeSpaceIds: [] });
    await invoke('Bearer test-secret');
    const dueChain = supabaseCalls[0].chain;
    expect(dueChain).toContainEqual(['eq', ['status', 'active']]);
    const or = dueChain.find(([m]) => m === 'or');
    expect(or?.[1]?.[0]).toMatch(/^nextMoveComputedAt\.is\.null,nextMoveComputedAt\.lt\./);
    expect(dueChain).toContainEqual(['limit', [100]]);
  });

  it('computes deals in live spaces and reports the summary', async () => {
    queueTick({
      due: [
        { id: 'd1', spaceId: 's1' },
        { id: 'd2', spaceId: 's1' },
      ],
      activeSpaceIds: ['s1'],
    });

    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body).toMatchObject({ due: 2, computed: 2, errored: 0, skipped: 0 });
    expect(computeNextMoveMock).toHaveBeenCalledTimes(2);
    expect(computeNextMoveMock).toHaveBeenCalledWith('s1', 'd1');
    expect(computeNextMoveMock).toHaveBeenCalledWith('s1', 'd2');
  });

  it('skips deals in a lapsed-paid space — no compute, no spend', async () => {
    queueTick({
      due: [
        { id: 'd_live', spaceId: 's_live' },
        { id: 'd_churned', spaceId: 's_churned' },
      ],
      activeSpaceIds: ['s_live'], // s_churned → 'canceled' (lapsed paid)
    });

    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body).toMatchObject({ due: 2, computed: 1, skipped: 1 });
    expect(computeNextMoveMock).toHaveBeenCalledTimes(1);
    expect(computeNextMoveMock).toHaveBeenCalledWith('s_live', 'd_live');
  });

  it('a free space (no Stripe subscription) still gets next moves', async () => {
    queueTick({
      due: [{ id: 'd_free', spaceId: 's_free' }],
      activeSpaceIds: [],
      statusBySpace: { s_free: 'inactive' },
    });

    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body).toMatchObject({ due: 1, computed: 1, skipped: 0 });
    expect(computeNextMoveMock).toHaveBeenCalledWith('s_free', 'd_free');
  });

  it('a compute that throws marks the deal errored without failing the tick', async () => {
    computeNextMoveMock
      .mockResolvedValueOnce({ text: 'ok', kind: 'other', computedAt: 'x' })
      .mockRejectedValueOnce(new Error('boom'));
    queueTick({
      due: [
        { id: 'd1', spaceId: 's1' },
        { id: 'd2', spaceId: 's1' },
      ],
      activeSpaceIds: ['s1'],
    });

    const res = await invoke('Bearer test-secret');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ due: 2, computed: 1, errored: 1 });
  });

  it('caps each space to a fair share so one big space cannot starve small spaces', async () => {
    // 3 spaces: s_big has 90 due deals, s_a has 2, s_b has 3. With
    // MAX_PER_TICK=100 and 3 distinct spaces, fairShare = ceil(100/3) = 34.
    // s_big must be capped at 34; s_a and s_b must be fully served.
    const due = [
      ...Array.from({ length: 90 }, (_, i) => ({ id: `big${i}`, spaceId: 's_big' })),
      { id: 'a0', spaceId: 's_a' },
      { id: 'a1', spaceId: 's_a' },
      { id: 'b0', spaceId: 's_b' },
      { id: 'b1', spaceId: 's_b' },
      { id: 'b2', spaceId: 's_b' },
    ];
    queueTick({ due, activeSpaceIds: ['s_big', 's_a', 's_b'] });

    const res = await invoke('Bearer test-secret');
    const body = await res.json();

    const perSpace: Record<string, number> = {};
    for (const [spaceId] of computeNextMoveMock.mock.calls as Array<[string, string]>) {
      perSpace[spaceId] = (perSpace[spaceId] ?? 0) + 1;
    }
    // No space exceeds its fair share (34).
    expect(perSpace['s_big']).toBe(34);
    // Small spaces are always fully served — never starved.
    expect(perSpace['s_a']).toBe(2);
    expect(perSpace['s_b']).toBe(3);
    // The over-cap deals are deferred (not computed, not stamped) so they stay
    // due for the next tick.
    expect(body).toMatchObject({ due: 95, computed: 39, deferred: 56, skipped: 0 });
  });

  it('does not stamp fairness-deferred deals — no Deal.update when all spaces are billing-active', async () => {
    const due = Array.from({ length: 90 }, (_, i) => ({ id: `d${i}`, spaceId: 's1' }));
    queueTick({ due, activeSpaceIds: ['s1'] });

    await invoke('Bearer test-secret');
    // Only the Deal (due) read and the Space (billing) read run — no update.
    // A single space's fairShare is max(5, ceil(100/1)) = 100, so with 90 due
    // all are runnable; the point is the skip-stamp path never fires here.
    const updateCalls = supabaseCalls.filter((c) =>
      c.chain.some(([m]) => m === 'update'),
    );
    expect(updateCalls).toHaveLength(0);
  });

  it('caps compute at 4 in flight even with 12 due deals', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    computeNextMoveMock.mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return { text: 'ok', kind: 'other', computedAt: 'x' };
    });

    const due = Array.from({ length: 12 }, (_, i) => ({ id: `d${i}`, spaceId: `s${i}` }));
    queueTick({ due, activeSpaceIds: due.map((d) => d.spaceId) });

    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body.computed).toBe(12);
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(4);
  });
});
