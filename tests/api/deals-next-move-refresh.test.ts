/**
 * Route-level tests for `POST /api/deals/[id]/next-move` — the on-demand
 * Next Move refresh behind the quick panel's stale-chip affordance.
 *
 * The load-bearing property is tenant scoping: a deal id from another space
 * must 404 without ever reaching computeNextMove (which would both leak
 * existence and spend LLM tokens on someone else's data).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextResponse } from 'next/server';

const { computeNextMoveMock } = vi.hoisted(() => ({
  computeNextMoveMock: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/space', () => ({ getSpaceForUser: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }));
vi.mock('@/lib/deals/next-move', () => ({ computeNextMove: computeNextMoveMock }));

// Supabase: single Deal existence probe, queue-driven.
type Terminal = { data?: unknown; error?: unknown };
let supabaseQueue: Terminal[] = [];
const supabaseCalls: Array<{ table: string; chain: Array<[string, unknown[]]> }> = [];

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const calls: Array<[string, unknown[]]> = [];
    const terminal = supabaseQueue.shift() ?? { data: [], error: null };
    supabaseCalls.push({ table, chain: calls });

    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'limit']) {
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

import { POST } from '@/app/api/deals/[id]/next-move/route';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { checkRateLimit } from '@/lib/rate-limit';

function invoke(dealId = 'deal-1') {
  const req = new Request(`http://localhost/api/deals/${dealId}/next-move`, {
    method: 'POST',
  });
  return POST(req as unknown as Parameters<typeof POST>[0], {
    params: Promise.resolve({ id: dealId }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  supabaseQueue = [];
  supabaseCalls.length = 0;
  vi.mocked(requireAuth).mockResolvedValue({ userId: 'user_1' } as never);
  vi.mocked(getSpaceForUser).mockResolvedValue({ id: 'space-1', slug: 'my-space' } as never);
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true } as never);
  computeNextMoveMock.mockResolvedValue({
    text: 'Check in with Dana',
    kind: 'follow_up',
    computedAt: '2026-07-14T12:00:00.000Z',
  });
});

describe('POST /api/deals/[id]/next-move', () => {
  it('returns the freshly computed move for an in-space deal', async () => {
    supabaseQueue = [{ data: [{ id: 'deal-1' }], error: null }];

    const res = await invoke('deal-1');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      nextMove: {
        text: 'Check in with Dana',
        kind: 'follow_up',
        computedAt: '2026-07-14T12:00:00.000Z',
      },
    });

    // compute ran under the CALLER's space, and the existence probe was
    // scoped to it too — the .eq is the security boundary.
    expect(computeNextMoveMock).toHaveBeenCalledWith('space-1', 'deal-1');
    const probe = supabaseCalls.find((c) => c.table === 'Deal');
    expect(probe?.chain).toContainEqual(['eq', ['spaceId', 'space-1']]);
    expect(probe?.chain).toContainEqual(['eq', ['id', 'deal-1']]);
  });

  it("another tenant's deal id → 404, and computeNextMove is never invoked", async () => {
    supabaseQueue = [{ data: [], error: null }]; // scoped probe finds nothing

    const res = await invoke('deal-in-other-space');
    expect(res.status).toBe(404);
    expect(computeNextMoveMock).not.toHaveBeenCalled();
  });

  it('a user with no space → 404 before any deal read', async () => {
    vi.mocked(getSpaceForUser).mockResolvedValue(null as never);

    const res = await invoke();
    expect(res.status).toBe(404);
    expect(supabaseCalls).toHaveLength(0);
    expect(computeNextMoveMock).not.toHaveBeenCalled();
  });

  it('an unauthenticated caller gets requireAuth\'s response back verbatim', async () => {
    vi.mocked(requireAuth).mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) as never,
    );

    const res = await invoke();
    expect(res.status).toBe(401);
    expect(computeNextMoveMock).not.toHaveBeenCalled();
  });

  it('rate-limited callers get a 429 with Retry-After', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false } as never);

    const res = await invoke();
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(computeNextMoveMock).not.toHaveBeenCalled();
  });

  it('compute resolving null (deal closed mid-flight) → 200 with a null move', async () => {
    supabaseQueue = [{ data: [{ id: 'deal-1' }], error: null }];
    computeNextMoveMock.mockResolvedValue(null);

    const res = await invoke();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ nextMove: null });
  });
});
