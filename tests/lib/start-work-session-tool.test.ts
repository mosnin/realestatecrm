import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  workspaceEnabled: vi.fn(() => false),
}));

vi.mock('@/lib/work-sessions/start', () => ({ startWorkSession: mocks.start }));
vi.mock('@/lib/chippi/workspace-run-flag', () => ({
  isWorkspaceRunsEnabledForSpace: mocks.workspaceEnabled,
}));

import {
  startWorkSessionTool,
  workSessionIdForTurn,
} from '@/lib/ai-tools/tools/start-work-session';

const ctx = {
  userId: 'user-1',
  space: { id: 'space-1', slug: 'demo', name: 'Demo', ownerId: 'user-1' },
  signal: new AbortController().signal,
  conversationId: 'conversation-1',
  continuationIdempotencySeed: 'turn-1',
  workMode: true,
};

describe('start_work_session Work-mode bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workspaceEnabled.mockReturnValue(false);
    mocks.start.mockResolvedValue({
      created: true,
      session: {
        id: 'session-1',
        goal: 'Prepare a complete Henderson listing report',
        status: 'planning',
        workspaceRunId: null,
      },
    });
  });

  it('derives a stable UUID-shaped id for delivery retries', () => {
    const input = {
      spaceId: 'space-1',
      turnSeed: 'turn-1',
      goal: 'Prepare a complete Henderson listing report',
      kind: 'research' as const,
    };
    const first = workSessionIdForTurn(input);
    expect(workSessionIdForTurn(input)).toBe(first);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('starts just-go durable work directly from the conversation', async () => {
    const result = await startWorkSessionTool.handler(
      { goal: 'Prepare a complete Henderson listing report', kind: 'research' },
      ctx,
    );

    expect(mocks.start).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: 'space-1',
        conversationId: 'conversation-1',
        goal: 'Prepare a complete Henderson listing report',
        autonomy: 'just_go',
        allowQuestions: true,
        kind: 'research',
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      }),
    );
    expect(result.display).toBe('success');
    expect(result.data).toEqual(
      expect.objectContaining({ sessionId: 'session-1', status: 'planning' }),
    );
  });

  it('fails closed when called outside Work mode', async () => {
    const result = await startWorkSessionTool.handler(
      { goal: 'Prepare a complete Henderson listing report', kind: 'research' },
      { ...ctx, workMode: false },
    );
    expect(mocks.start).not.toHaveBeenCalled();
    expect(result.display).toBe('warning');
  });

  it('does not advertise the terminal workspace when its tenant gate is off', async () => {
    const result = await startWorkSessionTool.handler(
      { goal: 'Create a multi-file Henderson seller packet', kind: 'workspace' },
      ctx,
    );
    expect(mocks.start).not.toHaveBeenCalled();
    expect(result.summary).toContain('not enabled');
  });
});
