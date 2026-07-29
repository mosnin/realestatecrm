import { beforeEach, describe, expect, it, vi } from 'vitest';

const { state, supabase } = vi.hoisted(() => {
  const state = {
    active: true,
    pendingUpdate: null as Record<string, unknown> | null,
    appliedUpdates: [] as Array<Record<string, unknown>>,
    events: [] as Array<Record<string, unknown>>,
  };

  function chainFor(table: string): any {
    const chain: any = {
      update: vi.fn((payload: Record<string, unknown>) => {
        state.pendingUpdate = payload;
        return chain;
      }),
      eq: vi.fn(() => chain),
      in: vi.fn(() => chain),
      select: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => {
        if (!state.active) return { data: null, error: null };
        if (state.pendingUpdate) state.appliedUpdates.push(state.pendingUpdate);
        return { data: { id: 'run-1' }, error: null };
      }),
      insert: vi.fn(async (payload: Record<string, unknown>) => {
        if (table === 'SwarmEvent') state.events.push(payload);
        return { error: null };
      }),
    };
    return chain;
  }

  return {
    state,
    supabase: { from: vi.fn((table: string) => chainFor(table)) },
  };
});

vi.mock('@/lib/supabase', () => ({ supabase }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { observeDelegateTaskLaunch } from '@/lib/ai-tools/tools/delegate-task';

describe('delegate_task Modal launch failure observer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.active = true;
    state.pendingUpdate = null;
    state.appliedUpdates.length = 0;
    state.events.length = 0;
  });

  it('terminal-fails the inserted run when Modal reports an activation failure', async () => {
    await observeDelegateTaskLaunch(
      Promise.resolve(
        new Response(
          JSON.stringify({
            status: 'failed',
            error: 'DATABASE_URL is required for atomic specialist transitions',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
      'run-1',
      'space-1',
    );

    expect(state.appliedUpdates).toContainEqual(
      expect.objectContaining({
        status: 'failed',
        errorMessage: expect.stringContaining('DATABASE_URL'),
      }),
    );
    expect(state.events).toContainEqual(
      expect.objectContaining({
        swarmRunId: 'run-1',
        type: 'swarm_failed',
        data: expect.objectContaining({ phase: 'launch' }),
      }),
    );
  });

  it('leaves an active run unchanged when the launch request outcome is unknown', async () => {
    await observeDelegateTaskLaunch(
      Promise.reject(new Error('connection refused')),
      'run-1',
      'space-1',
    );

    expect(state.active).toBe(true);
    expect(state.appliedUpdates).toHaveLength(0);
    expect(state.events).toHaveLength(0);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
