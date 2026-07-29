import { beforeEach, describe, expect, it, vi } from 'vitest';

const { state, supabase, requireAuthMock, getSpaceForUserMock } = vi.hoisted(() => {
  const state = {
    currentStatus: 'running',
    conditionalWinner: true,
    updateStatuses: [] as string[],
    events: [] as Array<Record<string, unknown>>,
  };

  function chainFor(table: string): any {
    let operation: 'select' | 'update' | 'insert' = 'select';
    const chain: any = {
      select: vi.fn(() => chain),
      update: vi.fn((payload: { status?: string }) => {
        operation = 'update';
        if (payload.status) state.updateStatuses.push(payload.status);
        return chain;
      }),
      insert: vi.fn(async (payload: Record<string, unknown>) => {
        operation = 'insert';
        state.events.push(payload);
        return { error: null };
      }),
      eq: vi.fn(() => chain),
      in: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => {
        if (operation === 'update') {
          return { data: state.conditionalWinner ? { id: 'run-1' } : null, error: null };
        }
        return {
          data:
            table === 'SwarmRun'
              ? { id: 'run-1', spaceId: 'space-1', status: state.currentStatus }
              : null,
          error: null,
        };
      }),
    };
    return chain;
  }

  return {
    state,
    supabase: { from: vi.fn((table: string) => chainFor(table)) },
    requireAuthMock: vi.fn(),
    getSpaceForUserMock: vi.fn(),
  };
});

vi.mock('@/lib/supabase', () => ({ supabase }));
vi.mock('@/lib/api-auth', () => ({ requireAuth: requireAuthMock }));
vi.mock('@/lib/space', () => ({ getSpaceForUser: getSpaceForUserMock }));

import { POST } from '@/app/api/swarm/[runId]/cancel/route';

describe('POST /api/swarm/[runId]/cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.currentStatus = 'running';
    state.conditionalWinner = true;
    state.updateStatuses.length = 0;
    state.events.length = 0;
    requireAuthMock.mockResolvedValue({ userId: 'user-1' });
    getSpaceForUserMock.mockResolvedValue({ id: 'space-1' });
  });

  it('records cancellation and explains the cooperative boundary', async () => {
    const response = await POST(
      new Request('https://example.test/api/swarm/run-1/cancel', { method: 'POST' }) as never,
      { params: Promise.resolve({ runId: 'run-1' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, status: 'cancelled' });
    expect(body.message).toContain('already inside a model call');
    expect(state.events).toContainEqual(
      expect.objectContaining({ type: 'swarm_cancelled' }),
    );
  });

  it('does not append a cancellation event when a terminal write won the race', async () => {
    state.conditionalWinner = false;
    const response = await POST(
      new Request('https://example.test/api/swarm/run-1/cancel', { method: 'POST' }) as never,
      { params: Promise.resolve({ runId: 'run-1' }) },
    );

    expect(response.status).toBe(409);
    expect(state.events).toHaveLength(0);
  });

  it('returns a rehydrate signal when the initial read already sees terminal', async () => {
    state.currentStatus = 'completed';
    const response = await POST(
      new Request('https://example.test/api/swarm/run-1/cancel', { method: 'POST' }) as never,
      { params: Promise.resolve({ runId: 'run-1' }) },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      status: 'completed',
      rehydrate: true,
    });
    expect(state.updateStatuses).toHaveLength(0);
    expect(state.events).toHaveLength(0);
  });
});
