import { describe, expect, it, vi, beforeEach } from 'vitest';

const runMock = vi.hoisted(() => vi.fn());
const recordUsageMock = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => undefined));
const loadMetaMock = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]) => ({ tools: [], liveToolkits: [] as string[], unavailableToolkits: [] as string[] })),
);
const persistChildMock = vi.hoisted(() => vi.fn());
const waitChildMock = vi.hoisted(() => vi.fn());

vi.mock('@openai/agents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@openai/agents')>();
  return { ...actual, run: (...args: unknown[]) => runMock(...args) };
});

vi.mock('@/lib/ai-tools/agent-model', () => ({
  getAgentModel: () => 'test-model',
}));

vi.mock('@/lib/usage/record-chat-usage', () => ({
  recordChatUsage: (...args: unknown[]) => recordUsageMock(...(args as [])),
}));

vi.mock('@/lib/ai-tools/integration-meta-tools', () => ({
  loadIntegrationMetaTools: (...args: unknown[]) => loadMetaMock(...(args as [])),
}));

vi.mock('@/lib/ai-tools/sdk-bridge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai-tools/sdk-bridge')>();
  return {
    ...actual,
    restoreRunState: vi.fn(async () => ({})),
    findRunInterruption: vi.fn(() => ({ rawItem: { callId: 'c-approve' } })),
    applyApprovalDecision: vi.fn((state: unknown) => state),
  };
});

vi.mock('@/lib/ai-tools/delegate-child-pause', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai-tools/delegate-child-pause')>();
  return {
    ...actual,
    persistChildPausedRun: (...args: unknown[]) => persistChildMock(...(args as [])),
    waitForChildApprovalDecision: (...args: unknown[]) => waitChildMock(...(args as [])),
  };
});

import {
  buildDelegateChildPrompt,
  buildDelegateChildTools,
  DELEGATE_CHILD_MAX_TURNS,
  runDelegatedChildTurn,
} from '@/lib/ai-tools/delegate-run';
import type { ToolContext } from '@/lib/ai-tools/types';

function makeCtx(): ToolContext {
  return {
    userId: 'user_1',
    space: { id: 'space_1', slug: 'jane', name: 'Jane Realty', ownerId: 'u1' },
    signal: new AbortController().signal,
    workMode: true,
  };
}

beforeEach(() => {
  runMock.mockReset();
  recordUsageMock.mockClear();
  loadMetaMock.mockClear();
  persistChildMock.mockReset();
  waitChildMock.mockReset();
  loadMetaMock.mockResolvedValue({ tools: [], liveToolkits: [], unavailableToolkits: [] });
});

describe('delegated specialist run', () => {
  it('gives the child more inner steps than the parent chat loop and no nested delegate', () => {
    expect(DELEGATE_CHILD_MAX_TURNS).toBeGreaterThanOrEqual(20);
    const names = buildDelegateChildTools(makeCtx(), 'Email Sarah and schedule a tour').map(
      (tool) => tool.name,
    );
    expect(names).not.toContain('delegate_task');
    expect(names).not.toContain('start_work_session');
    expect(names).toContain('send_email');
    expect(names).toContain('schedule_tour');
  });

  it('briefs the child with the exact goal and no parent transcript', () => {
    const goal = 'Rank my hottest buyers and draft a Friday follow-up plan.';
    const prompt = buildDelegateChildPrompt(makeCtx(), goal);
    expect(prompt).toContain(goal);
    expect(prompt).toContain('dense briefing');
    expect(prompt).not.toContain('Active Work goal');
  });

  it('waits for the child briefing and heartbeats progress', async () => {
    const onProgress = vi.fn();
    async function* stream() {
      yield {
        type: 'run_item_stream_event',
        name: 'tool_called',
        item: { rawItem: { callId: 'c1', name: 'list_contacts', arguments: '{}' } },
      };
    }
    runMock.mockResolvedValue({
      toStream: () => stream(),
      completed: Promise.resolve(),
      finalOutput: 'Jane is hot. Last touch March 3. Recommend a Friday call.',
    });

    const out = await runDelegatedChildTurn({
      ctx: { ...makeCtx(), onProgress },
      goal: 'Who should I call first this week?',
    });

    expect(out.ok).toBe(true);
    expect(out.summary).toContain('Jane is hot');
    expect(out.toolNames).toEqual(['list_contacts']);
    expect(onProgress).toHaveBeenCalledWith('Specialist started');
    expect(onProgress).toHaveBeenCalledWith('Specialist: list contacts');
    expect(runMock.mock.calls[0][2]).toEqual(
      expect.objectContaining({ maxTurns: DELEGATE_CHILD_MAX_TURNS, stream: true }),
    );
  });

  it('loads connected-app meta-tools from the specialist brief', async () => {
    loadMetaMock.mockResolvedValue({
      tools: [],
      liveToolkits: ['gmail'],
      unavailableToolkits: [],
    });
    async function* stream() {}
    runMock.mockResolvedValue({
      toStream: () => stream(),
      completed: Promise.resolve(),
      finalOutput: 'Sent the Gmail follow-up.',
    });

    await runDelegatedChildTurn({
      ctx: makeCtx(),
      goal: 'Email Sarah from Gmail about Friday.',
    });

    expect(loadMetaMock).toHaveBeenCalledWith(
      expect.objectContaining({ space: expect.objectContaining({ id: 'space_1' }) }),
      { userMessage: 'Email Sarah from Gmail about Friday.' },
    );
    const agent = runMock.mock.calls[0]?.[0] as { instructions?: string };
    expect(agent.instructions).toContain('gmail');
    expect(agent.instructions).toContain('find_integration_tool');
  });

  it('records ChatUsage for specialist model calls', async () => {
    async function* stream() {}
    runMock.mockResolvedValue({
      toStream: () => stream(),
      completed: Promise.resolve(),
      finalOutput: 'Jane is first.',
      rawResponses: [{ usage: { inputTokens: 12, outputTokens: 3, cost: 0.004 } }],
    });

    await runDelegatedChildTurn({
      ctx: { ...makeCtx(), conversationId: 'conv_1', continuationIdempotencySeed: 'seed-1' },
      goal: 'Who should I call?',
    });

    expect(recordUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: 'space_1',
        conversationId: 'conv_1',
        promptTokens: 12,
        completionTokens: 3,
        costUsd: 0.004,
        route: 'agent',
        runtime: 'ts',
        idempotencyKey: 'delegate-child:seed-1:0',
      }),
    );
  });

  it('pauses for approval, waits, then continues the same child', async () => {
    persistChildMock.mockResolvedValue({
      pausedRunId: 'pause_child',
      approvals: [
        { callId: 'c-approve', toolName: 'send_email', arguments: { to: 'a@b.c' }, summary: 'Email a' },
      ],
    });
    waitChildMock.mockResolvedValue({ callId: 'c-approve', approved: true });

    async function* empty() {}
    runMock
      .mockResolvedValueOnce({
        toStream: () => empty(),
        completed: Promise.resolve(),
        finalOutput: '',
        interruptions: [{ rawItem: { callId: 'c-approve' }, name: 'send_email', arguments: '{}' }],
        state: { toString: () => 'child-state' },
      })
      .mockResolvedValueOnce({
        toStream: () => empty(),
        completed: Promise.resolve(),
        finalOutput: 'Email sent to Jane.',
      });

    const onPermissionRequired = vi.fn();
    const out = await runDelegatedChildTurn({
      ctx: { ...makeCtx(), onPermissionRequired },
      goal: 'Email Jane the tour details',
    });

    expect(persistChildMock).toHaveBeenCalledTimes(1);
    expect(waitChildMock).toHaveBeenCalledTimes(1);
    expect(onPermissionRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'pause_child',
        callId: 'c-approve',
        name: 'send_email',
        inline: true,
      }),
    );
    expect(out.ok).toBe(true);
    expect(out.summary).toContain('Email sent');
    expect(runMock).toHaveBeenCalledTimes(2);
  });
});
