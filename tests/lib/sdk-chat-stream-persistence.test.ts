import { beforeEach, describe, expect, it, vi } from 'vitest';

const { runChatTurnMock, saveAssistantMock, onSettledMock } = vi.hoisted(() => ({
  runChatTurnMock: vi.fn(),
  saveAssistantMock: vi.fn(),
  onSettledMock: vi.fn(),
}));

vi.mock('@/lib/ai-tools/sdk-chat', () => ({
  runChatTurn: runChatTurnMock,
  resumeChatTurn: vi.fn(),
}));
vi.mock('@/lib/ai-tools/persistence', () => ({
  saveAssistantMessage: saveAssistantMock,
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

function streamedResult() {
  return {
    toStream: () => new ReadableStream({
      start(controller) {
        controller.enqueue({
          type: 'raw_model_stream_event',
          data: { type: 'output_text_delta', delta: 'The work is complete.' },
        });
        controller.close();
      },
    }),
    completed: Promise.resolve(),
    interruptions: [],
    rawResponses: [],
  };
}

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
  runChatTurnMock.mockResolvedValue({ result: streamedResult(), agent: {} });
  saveAssistantMock.mockRejectedValue(new Error('database unavailable'));
  onSettledMock.mockResolvedValue(undefined);
});

describe('TypeScript agent stream persistence authority', () => {
  it('withholds turn_complete and fails the durable turn on an ambiguous persistence failure', async () => {
    const frames = await parseFrames(streamTsChatTurn({
      ctx: {
        userId: 'user-1',
        space: { id: 'space-1', slug: 'acme', name: 'Acme', ownerId: 'owner-1' },
        signal: new AbortController().signal,
      },
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      userMessage: 'Analyze my pipeline.',
      history: [],
      abortController: new AbortController(),
      onSettled: onSettledMock,
    }));

    expect(saveAssistantMock).toHaveBeenCalledTimes(1);
    expect(frames.some((frame) => frame.type === 'turn_complete')).toBe(false);
    expect(frames.at(-1)).toMatchObject({ type: 'error', code: 'persistence' });
    expect(onSettledMock).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed',
      reason: 'persistence',
    }));
  });
});
