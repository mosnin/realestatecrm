/**
 * Pins the chat agent's per-turn tool-call ceiling and checks that both
 * entry points thread it into the SDK `run()` call. Work spends a step on
 * `create_plan` before execution, so it gets a higher cap than Chat.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const runMock = vi.hoisted(() => vi.fn());

vi.mock('@openai/agents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@openai/agents')>();
  return { ...actual, run: (...args: unknown[]) => runMock(...args) };
});

vi.mock('@/lib/integrations/connections', () => ({
  activeToolkits: vi.fn(async () => []),
  markExpiredByToolkit: vi.fn(),
}));

vi.mock('@/lib/ai-tools/personalized-prompt', () => ({
  buildPersonalizedSnapshot: vi.fn(async () => {
    throw new Error('skip snapshot');
  }),
  renderSnapshot: vi.fn(() => ''),
}));

vi.mock('@/lib/ai-tools/agent-model', () => ({
  getAgentModel: () => 'test-model',
}));

const restoreRunStateMock = vi.hoisted(() =>
  vi.fn(async () => ({
    getInterruptions: () => [{ rawItem: { callId: 'call_1' } }],
  })),
);
const applyApprovalDecisionMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/ai-tools/sdk-bridge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai-tools/sdk-bridge')>();
  return {
    ...actual,
    restoreRunState: restoreRunStateMock,
    applyApprovalDecision: applyApprovalDecisionMock,
  };
});

import {
  CHAT_MAX_TURNS,
  WORK_MAX_TURNS,
  resolveChatMaxTurns,
  runChatTurn,
  resumeChatTurn,
} from '@/lib/ai-tools/sdk-chat';
import type { ToolContext } from '@/lib/ai-tools/types';

function makeCtx(workMode = false): ToolContext {
  return {
    userId: 'user_1',
    space: { id: 'space_1', slug: 'jane', name: 'Jane Realty', ownerId: 'u1' },
    signal: new AbortController().signal,
    workMode,
  };
}

beforeEach(() => {
  runMock.mockReset();
  runMock.mockResolvedValue({ toStream: async function* () {}, completed: Promise.resolve() });
});

describe('sdk-chat tool-call ceiling', () => {
  it('gives Work more inner steps than Chat so create_plan does not consume the whole budget', () => {
    expect(CHAT_MAX_TURNS).toBeGreaterThanOrEqual(10);
    expect(WORK_MAX_TURNS).toBeGreaterThan(CHAT_MAX_TURNS);
    expect(resolveChatMaxTurns(false)).toBe(CHAT_MAX_TURNS);
    expect(resolveChatMaxTurns(undefined)).toBe(CHAT_MAX_TURNS);
    expect(resolveChatMaxTurns(true)).toBe(WORK_MAX_TURNS);
  });

  it('passes the Chat cap into run() on a fresh turn', async () => {
    await runChatTurn({ ctx: makeCtx(false), userMessage: 'who are my leads' });
    expect(runMock).toHaveBeenCalledTimes(1);
    expect(runMock.mock.calls[0][2]).toEqual(
      expect.objectContaining({ maxTurns: CHAT_MAX_TURNS, stream: true }),
    );
  });

  it('passes the Work cap into run() on a fresh Work turn', async () => {
    await runChatTurn({
      ctx: makeCtx(true),
      userMessage: 'Email Sarah and schedule a tour',
    });
    expect(runMock).toHaveBeenCalledTimes(1);
    expect(runMock.mock.calls[0][2]).toEqual(
      expect.objectContaining({ maxTurns: WORK_MAX_TURNS, stream: true }),
    );
  });

  it('passes the Work cap into run() on resume', async () => {
    await resumeChatTurn({
      ctx: makeCtx(true),
      serializedState: '{}',
      decision: { approved: true },
      callId: 'call_1',
    });
    expect(runMock).toHaveBeenCalledTimes(1);
    expect(runMock.mock.calls[0][2]).toEqual(
      expect.objectContaining({ maxTurns: WORK_MAX_TURNS, stream: true }),
    );
  });
});
