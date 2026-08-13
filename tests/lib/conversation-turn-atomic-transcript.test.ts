import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: rpcMock },
}));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/agent-memory/extract', () => ({
  extractConversationMemories: vi.fn(),
}));

import { saveConversationTurnAssistantMessage } from '@/lib/ai-tools/persistence';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('atomic ConversationTurn assistant persistence', () => {
  it('retries an ambiguous RPC with the same message identity and returns one receipt', async () => {
    rpcMock
      .mockResolvedValueOnce({ data: null, error: new Error('connection reset after commit') })
      .mockResolvedValueOnce({
        data: [{
          turnId: 'turn-1',
          attemptToken: 'attempt-1',
          messageId: 'committed-message',
          requestedStatus: 'completed',
          terminalStatus: 'completed',
          terminalReason: 'complete',
          createdAt: '2026-08-13T00:00:00.000Z',
        }],
        error: null,
      });

    const receipt = await saveConversationTurnAssistantMessage({
      turnId: 'turn-1',
      attemptToken: 'attempt-1',
      spaceId: 'space-1',
      conversationId: 'conversation-1',
      outcome: { status: 'completed', reason: 'complete' },
      blocks: [{ type: 'text', content: 'Durably complete.' }],
    });

    expect(receipt).toMatchObject({ terminalStatus: 'completed' });
    expect(rpcMock).toHaveBeenCalledTimes(2);
    const firstArgs = rpcMock.mock.calls[0]?.[1] as Record<string, unknown>;
    const retryArgs = rpcMock.mock.calls[1]?.[1] as Record<string, unknown>;
    expect(firstArgs.p_message_id).toEqual(retryArgs.p_message_id);
    expect(firstArgs).toEqual(retryArgs);
  });

  it('never falls back to an unfenced Message insert when both RPC receipts are ambiguous', async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error('database unavailable') });

    await expect(saveConversationTurnAssistantMessage({
      turnId: 'turn-1',
      attemptToken: 'stale-attempt',
      spaceId: 'space-1',
      conversationId: 'conversation-1',
      outcome: { status: 'completed', reason: 'complete' },
      blocks: [{ type: 'text', content: 'Must not publish.' }],
    })).rejects.toThrow('database unavailable');

    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(rpcMock.mock.calls.every(([name]) => name === 'commit_conversation_turn_assistant_v2')).toBe(true);
  });
});
