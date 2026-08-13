import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { kickPlanMock } = vi.hoisted(() => ({ kickPlanMock: vi.fn(async () => undefined) }));
vi.mock('@/lib/work-sessions/kick', () => ({ kickPlan: kickPlanMock }));

let insertResult: { data: Record<string, unknown> | null; error: Error | null };
let existingResult: { data: Record<string, unknown> | null; error: Error | null };

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.insert = vi.fn(() => chain);
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.single = vi.fn(async () => insertResult);
      chain.maybeSingle = vi.fn(async () => existingResult);
      return chain;
    },
  },
}));

import { startWorkSession } from '@/lib/work-sessions/start';

const INPUT = {
  id: 'session-1',
  spaceId: 'space-1',
  conversationId: 'conversation-1',
  goal: 'Prepare the Henderson listing appointment in depth.',
  autonomy: 'plan_first' as const,
  allowQuestions: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  insertResult = {
    data: { ...INPUT, status: 'planning', plan: [], findings: [] },
    error: null,
  };
  existingResult = { data: null, error: null };
});

describe('startWorkSession', () => {
  it('dispatches a newly committed session', async () => {
    const result = await startWorkSession(INPUT);
    expect(result.created).toBe(true);
    expect(result.session.id).toBe('session-1');
    expect(kickPlanMock).toHaveBeenCalledWith('session-1');
  });

  it('repairs insert-before-dispatch by re-kicking an existing planning row', async () => {
    insertResult = { data: null, error: new Error('duplicate') };
    existingResult = {
      data: { ...INPUT, status: 'planning', plan: [], findings: [] },
      error: null,
    };

    const result = await startWorkSession(INPUT);
    expect(result.created).toBe(false);
    expect(kickPlanMock).toHaveBeenCalledWith('session-1');
  });

  it('does not re-dispatch a retry after the session advanced', async () => {
    insertResult = { data: null, error: new Error('duplicate') };
    existingResult = {
      data: { ...INPUT, status: 'running', plan: [], findings: [] },
      error: null,
    };

    const result = await startWorkSession(INPUT);
    expect(result.created).toBe(false);
    expect(kickPlanMock).not.toHaveBeenCalled();
  });
});
