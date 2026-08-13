import { beforeEach, describe, expect, it, vi } from 'vitest';

const { state, supabase, requireAuthMock, getSpaceForUserMock } = vi.hoisted(() => {
  const state = {
    rpcData: { outcome: 'cancelled', status: 'cancelled' } as Record<string, unknown>,
    rpcError: null as { message: string } | null,
  };

  return {
    state,
    supabase: {
      rpc: vi.fn(async () => ({ data: state.rpcData, error: state.rpcError })),
    },
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
    state.rpcData = { outcome: 'cancelled', status: 'cancelled' };
    state.rpcError = null;
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
    expect(supabase.rpc).toHaveBeenCalledWith('cancel_swarm_run', {
      p_run_id: 'run-1',
      p_space_id: 'space-1',
    });
  });

  it('returns a rehydrate signal when a terminal write won the database lock', async () => {
    state.rpcData = { outcome: 'already_terminal', status: 'completed' };
    const response = await POST(
      new Request('https://example.test/api/swarm/run-1/cancel', { method: 'POST' }) as never,
      { params: Promise.resolve({ runId: 'run-1' }) },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ status: 'completed', rehydrate: true });
  });

  it('returns not found without leaking another tenant run', async () => {
    state.rpcData = { outcome: 'not_found' };
    const response = await POST(
      new Request('https://example.test/api/swarm/run-1/cancel', { method: 'POST' }) as never,
      { params: Promise.resolve({ runId: 'run-1' }) },
    );

    expect(response.status).toBe(404);
  });
});
