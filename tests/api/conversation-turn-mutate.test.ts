/**
 * PATCH/DELETE /api/ai/turns/[turnId] — queued-turn edit and remove.
 *
 * Delete is idempotent: a row that already left the queue (completed /
 * cancelled, or already gone) reports `{removed:true}` without fighting
 * the settler. Edit is pending-only and optimistic: if the row changed
 * between click and write, the client gets 409 instead of silently
 * overwriting a now-running turn.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { cancelMock } = vi.hoisted(() => ({
  cancelMock: vi.fn(),
}));

const state = vi.hoisted(() => ({
  turn: {
    id: 'turn-1',
    conversationId: 'conversation-1',
    status: 'pending',
    message: 'Original queued text',
  } as Record<string, unknown> | null,
  conversation: {
    id: 'conversation-1',
    title: 'Follow up',
  } as Record<string, unknown> | null,
  updatedTurn: null as Record<string, unknown> | null,
  updateError: null as unknown,
}));

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(async () => ({ userId: 'user-1' })),
}));

vi.mock('@/lib/space', () => ({
  getSpaceForUser: vi.fn(async () => ({ id: 'space-1' })),
}));

vi.mock('@/lib/chat/turn-control', () => ({
  cancelQueuedConversationTurn: (...args: unknown[]) => cancelMock(...args),
}));

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string, op: 'select' | 'update') {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = vi.fn(self);
    chain.eq = vi.fn(self);
    chain.in = vi.fn(self);
    chain.order = vi.fn(self);
    chain.limit = vi.fn(self);
    chain.update = vi.fn(() => makeChain(table, 'update'));
    chain.maybeSingle = vi.fn(async () => {
      if (table === 'Conversation') return { data: state.conversation, error: null };
      if (table === 'ConversationTurn' && op === 'update') {
        return { data: state.updatedTurn, error: state.updateError };
      }
      if (table === 'ConversationTurn') return { data: state.turn, error: null };
      return { data: null, error: null };
    });
    return chain;
  }

  return {
    supabase: {
      from: vi.fn((table: string) => makeChain(table, 'select')),
    },
  };
});

import { DELETE, PATCH } from '@/app/api/ai/turns/[turnId]/route';

function deleteRequest() {
  return new NextRequest('http://localhost/api/ai/turns/turn-1', { method: 'DELETE' });
}

function patchRequest(message: string) {
  return new NextRequest('http://localhost/api/ai/turns/turn-1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message }),
  });
}

const params = Promise.resolve({ turnId: 'turn-1' });

beforeEach(() => {
  cancelMock.mockReset().mockResolvedValue({
    id: 'turn-1',
    conversationId: 'conversation-1',
    status: 'cancelled',
    message: 'Original queued text',
  });
  state.turn = {
    id: 'turn-1',
    conversationId: 'conversation-1',
    status: 'pending',
    message: 'Original queued text',
  };
  state.conversation = { id: 'conversation-1', title: 'Follow up' };
  state.updatedTurn = {
    id: 'turn-1',
    conversationId: 'conversation-1',
    status: 'pending',
    message: 'Edited queued text',
  };
  state.updateError = null;
});

describe('DELETE /api/ai/turns/[turnId]', () => {
  it('treats an already-completed turn as removed without cancelling it', async () => {
    state.turn = { ...state.turn!, status: 'completed' };

    const response = await DELETE(deleteRequest(), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ removed: true, turn: { id: 'turn-1', status: 'completed' } });
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it('cancels a still-queued turn', async () => {
    const response = await DELETE(deleteRequest(), { params });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ removed: true, turn: { status: 'cancelled' } });
    expect(cancelMock).toHaveBeenCalledWith(expect.anything(), {
      turnId: 'turn-1',
      spaceId: 'space-1',
      conversationId: 'conversation-1',
    });
  });

  it('returns 409 when cancel loses the race and the turn is still live', async () => {
    cancelMock.mockRejectedValue(new Error('conversation queue is held'));
    state.turn = { ...state.turn!, status: 'running' };

    const response = await DELETE(deleteRequest(), { params });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Turn cannot be removed' });
  });
});

describe('PATCH /api/ai/turns/[turnId]', () => {
  it('refuses to edit a turn that is no longer queued', async () => {
    state.turn = { ...state.turn!, status: 'running' };

    const response = await PATCH(patchRequest('Please call them instead'), { params });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Only a queued message can be edited' });
  });

  it('returns 409 when the pending row changes before the write lands', async () => {
    state.updatedTurn = null;

    const response = await PATCH(patchRequest('Please call them instead'), { params });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Queued message changed before it could be edited',
    });
  });

  it('updates a still-pending queued message', async () => {
    const response = await PATCH(patchRequest('Please call them instead'), { params });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      turn: {
        id: 'turn-1',
        conversationId: 'conversation-1',
        status: 'pending',
        message: 'Edited queued text',
      },
    });
  });
});
