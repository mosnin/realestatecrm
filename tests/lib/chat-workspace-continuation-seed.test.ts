import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: mocks.from } }));
vi.mock('@/lib/agent-memory/extract', () => ({ extractConversationMemories: vi.fn() }));

import { saveUserMessage } from '@/lib/ai-tools/persistence';
import { chatContinuationIdempotencySeed } from '@/lib/workspace-runs/conversation-continuation';

describe('chat Workspace continuation idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: null }) });
  });
  it('derives different continuation seeds for identical intentional text turns', async () => {
    const first = await saveUserMessage({ spaceId: 'space-1', conversationId: 'conversation-1', content: 'Continue the workspace' });
    const second = await saveUserMessage({ spaceId: 'space-1', conversationId: 'conversation-1', content: 'Continue the workspace' });
    expect(first.messageId).not.toBe(second.messageId);
    expect(chatContinuationIdempotencySeed(first.messageId)).not.toBe(chatContinuationIdempotencySeed(second.messageId));
  });
});
