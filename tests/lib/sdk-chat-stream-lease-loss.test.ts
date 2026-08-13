import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  runChatTurnMock,
  atomicSaveMock,
  legacySaveMock,
  settleMock,
  guardian,
} = vi.hoisted(() => ({
  runChatTurnMock: vi.fn(),
  atomicSaveMock: vi.fn(),
  legacySaveMock: vi.fn(),
  settleMock: vi.fn(),
  guardian: {
    assertActive: vi.fn(),
    renewNow: vi.fn(),
    prepareToCommit: vi.fn(),
    commitSucceeded: vi.fn(),
    hasLostAuthority: vi.fn(),
    stop: vi.fn(),
  },
}));

vi.mock('@/lib/ai-tools/sdk-chat', () => ({
  runChatTurn: runChatTurnMock,
  resumeChatTurn: vi.fn(),
}));
vi.mock('@/lib/ai-tools/persistence', () => ({
  saveAssistantMessage: legacySaveMock,
  saveConversationTurnAssistantMessage: atomicSaveMock,
}));
vi.mock('@/lib/chat/turn-control', () => ({
  startConversationTurnLeaseGuardian: vi.fn(() => guardian),
}));
vi.mock('@/lib/usage/record-chat-usage', () => ({
  recordChatUsage: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/chat/turn-presence', () => ({
  markTurnEnded: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/chat/stop-signal', () => ({
  createStopPoller: () => async () => false,
}));
vi.mock('@/lib/telemetry', () => ({ emit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/agent/tool-call-logger', () => ({
  logToolCallStart: vi.fn().mockResolvedValue('step-1'),
  logToolCallComplete: vi.fn().mockResolvedValue(undefined),
  logToolCallError: vi.fn().mockResolvedValue(undefined),
}));

import { streamTsChatTurn } from '@/lib/ai-tools/sdk-chat-stream';

function parseFrames(response: Response): Promise<Array<Record<string, unknown>>> {
  return response.text().then((text) => text
    .split('\n\n')
    .map((chunk) => chunk
      .split('\n')
      .find((line) => line.startsWith('data: '))
      ?.slice(6)
      .trim() ?? '')
    .filter(Boolean)
    .map((raw) => JSON.parse(raw) as Record<string, unknown>));
}

beforeEach(() => {
  vi.clearAllMocks();
  let lost = false;
  guardian.renewNow.mockResolvedValue(undefined);
  guardian.prepareToCommit.mockResolvedValue(undefined);
  guardian.hasLostAuthority.mockImplementation(() => lost);
  guardian.assertActive.mockImplementation(() => {
    lost = true;
    throw new Error('Conversation turn attempt authority could not be renewed.');
  });
  settleMock.mockResolvedValue(undefined);
  runChatTurnMock.mockResolvedValue({
    agent: {},
    result: {
      toStream: () => new ReadableStream({
        start(controller) {
          controller.enqueue({
            type: 'raw_model_stream_event',
            data: { type: 'output_text_delta', delta: 'stale output' },
          });
          controller.close();
        },
      }),
      completed: Promise.resolve(),
      interruptions: [],
      rawResponses: [],
    },
  });
});

describe('SDK stream lease-loss barrier', () => {
  it('does not publish, persist, or complete output after midstream authority loss', async () => {
    const frames = await parseFrames(streamTsChatTurn({
      ctx: {
        userId: 'user-1',
        space: { id: 'space-1', slug: 'acme', name: 'Acme', ownerId: 'owner-1' },
        signal: new AbortController().signal,
      },
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      attemptToken: 'attempt-1',
      userMessage: 'Do the work.',
      history: [],
      abortController: new AbortController(),
      onSettled: settleMock,
    }));

    expect(frames.some((frame) => frame.type === 'text_delta')).toBe(false);
    expect(frames.some((frame) => frame.type === 'turn_complete')).toBe(false);
    expect(frames.some((frame) =>
      frame.type === 'error' && String(frame.message).includes('lost execution authority')),
    ).toBe(true);
    expect(atomicSaveMock).not.toHaveBeenCalled();
    expect(legacySaveMock).not.toHaveBeenCalled();
    expect(settleMock).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed',
      reason: 'lease_authority_lost',
    }));
  });

  it('quiesces renewal before atomic commit and then emits one terminal receipt', async () => {
    const order: string[] = [];
    guardian.assertActive.mockImplementation(() => undefined);
    guardian.hasLostAuthority.mockReturnValue(false);
    guardian.prepareToCommit.mockImplementation(async () => {
      order.push('prepare');
    });
    atomicSaveMock.mockImplementation(async (input: {
      turnId: string;
      attemptToken: string;
      outcome: { status: 'completed'; reason: string };
    }) => {
      order.push('commit');
      return {
        turnId: input.turnId,
        attemptToken: input.attemptToken,
        messageId: 'message-1',
        requestedStatus: input.outcome.status,
        terminalStatus: input.outcome.status,
        terminalReason: input.outcome.reason,
        createdAt: new Date().toISOString(),
      };
    });

    const frames = await parseFrames(streamTsChatTurn({
      ctx: {
        userId: 'user-1',
        space: { id: 'space-1', slug: 'acme', name: 'Acme', ownerId: 'owner-1' },
        signal: new AbortController().signal,
      },
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      attemptToken: 'attempt-1',
      userMessage: 'Do the work.',
      history: [],
      abortController: new AbortController(),
      onSettled: settleMock,
    }));

    expect(order).toEqual(['prepare', 'commit']);
    expect(frames.filter((frame) => frame.type === 'turn_complete')).toEqual([
      expect.objectContaining({ reason: 'complete' }),
    ]);
    expect(frames.some((frame) => frame.type === 'error')).toBe(false);
    expect(settleMock).not.toHaveBeenCalled();
  });
});
