import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { conversationState, rpcMock, enqueueMock } = vi.hoisted(() => ({
  conversationState: {
    mode: null as 'chat' | 'work' | null,
    claimedMode: 'chat' as 'chat' | 'work',
  },
  rpcMock: vi.fn(),
  enqueueMock: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(async () => ({ userId: 'user-1' })),
}));

vi.mock('@/lib/space', () => ({
  getSpaceForUser: vi.fn(async () => ({ id: 'space-1' })),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 119 })),
}));

vi.mock('@/lib/supabase', () => {
  function conversationQuery() {
    const query: Record<string, unknown> = {};
    query.select = vi.fn(() => query);
    query.eq = vi.fn(() => query);
    query.maybeSingle = vi.fn(async () => ({
      data: {
        id: 'conversation-1',
        spaceId: 'space-1',
        title: 'New conversation',
        mode: conversationState.mode,
      },
      error: null,
    }));
    return query;
  }

  return {
    supabase: {
      from: vi.fn(() => conversationQuery()),
      rpc: rpcMock,
    },
  };
});

vi.mock('@/lib/chat/turn-control', () => ({
  enqueueConversationTurn: enqueueMock,
}));

import { POST } from '@/app/api/ai/turns/route';

function request(mode: 'chat' | 'work') {
  return new NextRequest('http://localhost/api/ai/turns', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      clientRequestId: 'request-1',
      mode,
      source: 'typed',
      message: 'Help me follow up with this lead.',
    }),
  });
}

describe('POST /api/ai/turns conversation mode authority', () => {
  beforeEach(() => {
    conversationState.mode = null;
    conversationState.claimedMode = 'chat';
    rpcMock.mockReset().mockImplementation(async () => ({
      data: conversationState.claimedMode,
      error: null,
    }));
    enqueueMock.mockReset().mockImplementation(async (_client, input) => ({
      id: input.turnId,
      conversationId: input.conversationId,
      mode: input.mode,
      status: 'pending',
    }));
  });

  it('atomically claims the selected mode for an empty null-mode conversation', async () => {
    conversationState.claimedMode = 'work';

    const response = await POST(request('work'));

    expect(response.status).toBe(201);
    expect(rpcMock).toHaveBeenCalledWith('claim_conversation_mode', {
      p_conversation_id: 'conversation-1',
      p_space_id: 'space-1',
      p_mode: 'work',
    });
    expect(enqueueMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      conversationId: 'conversation-1',
      mode: 'work',
    }));
  });

  it('keeps a populated legacy null-mode conversation locked to Chat', async () => {
    conversationState.claimedMode = 'chat';

    const response = await POST(request('work'));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Conversation mode mismatch' });
    expect(rpcMock).toHaveBeenCalledWith('claim_conversation_mode', expect.objectContaining({
      p_mode: 'work',
    }));
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('rejects a conflicting mode for an already-typed conversation', async () => {
    conversationState.mode = 'work';

    const response = await POST(request('chat'));

    expect(response.status).toBe(409);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('enqueues with the existing database mode when it matches', async () => {
    conversationState.mode = 'chat';

    const response = await POST(request('chat'));

    expect(response.status).toBe(201);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(enqueueMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      conversationId: 'conversation-1',
      mode: 'chat',
    }));
  });
});
