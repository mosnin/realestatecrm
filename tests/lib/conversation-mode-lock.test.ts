import { describe, expect, it, vi } from 'vitest';
import {
  claimConversationMode,
  parseConversationMode,
} from '@/lib/chat/conversation-mode';
import { storedConversationMode } from '@/components/chippi/chippi-workspace';

describe('conversation mode lock', () => {
  it('parses only the two product modes', () => {
    expect(parseConversationMode('chat')).toBe('chat');
    expect(parseConversationMode('work')).toBe('work');
    expect(parseConversationMode('agent')).toBeNull();
    expect(parseConversationMode(null)).toBeNull();
  });

  it('uses the database receipt as the authority, not the stale request', async () => {
    const rpc = vi.fn(async () => ({ data: 'work', error: null }));
    await expect(claimConversationMode({ rpc } as never, {
      conversationId: 'conv-1',
      spaceId: 'space-1',
      requestedMode: 'chat',
    })).resolves.toBe('work');
    expect(rpc).toHaveBeenCalledWith('claim_conversation_mode', {
      p_conversation_id: 'conv-1',
      p_space_id: 'space-1',
      p_mode: 'chat',
    });
  });

  it('fails closed on an invalid database receipt', async () => {
    const rpc = vi.fn(async () => ({ data: 'agent', error: null }));
    await expect(claimConversationMode({ rpc } as never, {
      conversationId: 'conv-1',
      spaceId: 'space-1',
      requestedMode: 'work',
    })).rejects.toThrow('invalid value');
  });

  it('prefers the server-loaded conversation mode for UI hydration', () => {
    expect(storedConversationMode([{ id: 'conv-1', mode: 'work' }], 'conv-1')).toBe('work');
    expect(storedConversationMode([{ id: 'conv-1', mode: null }], 'conv-1')).toBeNull();
  });
});
