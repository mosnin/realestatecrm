import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createStopPollerMock, runDirectChatMock } = vi.hoisted(() => ({
  createStopPollerMock: vi.fn(() => async () => false),
  runDirectChatMock: vi.fn(),
}));

vi.mock('@/lib/chat/stop-signal', () => ({
  createStopPoller: createStopPollerMock,
  STOP_POLL_INTERVAL_MS: 750,
}));
vi.mock('@/lib/chat/direct-llm', () => ({
  runDirectChat: runDirectChatMock,
}));
vi.mock('@/lib/agent/broker-persistence', () => ({
  saveBrokerAssistantMessage: vi.fn(async () => ({ messageId: 'm_assistant' })),
}));
vi.mock('@/lib/usage/record-chat-usage', () => ({
  recordChatUsage: vi.fn(async () => undefined),
}));
vi.mock('@/lib/brokerage-members', () => ({
  getBrokerageMembers: vi.fn(async () => []),
}));
vi.mock('@/lib/chat-models', () => ({ DEFAULT_CHAT_MODEL: 'test-model' }));
vi.mock('@/lib/llm', () => ({ resolveChatModel: () => 'test-model' }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }));

import { streamBrokerDirectTurn } from '@/lib/chat/broker-direct';

beforeEach(() => {
  vi.clearAllMocks();
  createStopPollerMock.mockImplementation(() => async () => false);
  runDirectChatMock.mockResolvedValue({
    text: 'The brokerage snapshot is ready.',
    usage: {
      promptTokens: 10,
      completionTokens: 6,
      cachedTokens: 0,
      costUsd: 0,
    },
  });
});

describe('broker direct stream — exact Stop identity', () => {
  it('polls and reports the supplied turn id, never the conversation id', async () => {
    const response = streamBrokerDirectTurn({
      brokerage: { id: 'brokerage-1', name: 'Acme Realty', ownerId: 'owner-1' },
      runtimeSpaceId: null,
      userId: 'user-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      userMessage: 'How is the team doing?',
      history: [],
      abortController: new AbortController(),
    });

    await response.text();

    expect(createStopPollerMock).toHaveBeenCalledTimes(1);
    expect(createStopPollerMock).toHaveBeenCalledWith('turn-1');
    expect(createStopPollerMock).not.toHaveBeenCalledWith('conversation-1');
    expect(response.headers.get('X-Chippi-Turn-Id')).toBe('turn-1');
  });
});
