/**
 * GET /api/ai/turns — queue reconciliation after #578.
 *
 * A closed tab can leave an expired running lease that made every new send
 * queue forever. The route must recover expired turns before reading the
 * queue, and it must load running/paused/failed blockers separately so a
 * long pending list cannot hide the row that makes dispatch unsafe.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { recoverMock, events } = vi.hoisted(() => ({
  recoverMock: vi.fn(),
  events: [] as string[],
}));

const state = vi.hoisted(() => ({
  conversation: {
    id: 'conversation-1',
    spaceId: 'space-1',
    title: 'Follow up',
    mode: 'chat',
  } as Record<string, unknown> | null,
  blockers: [] as Array<Record<string, unknown>>,
  pending: [] as Array<Record<string, unknown>>,
  blockersError: null as unknown,
  pendingError: null as unknown,
}));

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(async () => ({ userId: 'user-1' })),
}));

vi.mock('@/lib/space', () => ({
  getSpaceForUser: vi.fn(async () => ({ id: 'space-1' })),
}));

vi.mock('@/lib/chat/turn-control', () => ({
  recoverExpiredConversationTurns: (...args: unknown[]) => recoverMock(...args),
  enqueueConversationTurn: vi.fn(),
}));

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string) {
    const filters = { inStatus: null as string[] | null, eqStatus: null as string | null };
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = vi.fn(self);
    chain.eq = vi.fn((column: string, value: unknown) => {
      if (column === 'status') filters.eqStatus = String(value);
      return chain;
    });
    chain.in = vi.fn((column: string, value: unknown) => {
      if (column === 'status') filters.inStatus = value as string[];
      return chain;
    });
    chain.order = vi.fn(self);
    chain.limit = vi.fn(self);
    chain.maybeSingle = vi.fn(async () => {
      if (table === 'Conversation') return { data: state.conversation, error: null };
      return { data: null, error: null };
    });
    chain.then = (
      resolve: (value: { data: unknown; error: unknown }) => unknown,
      reject?: (error: unknown) => unknown,
    ) => {
      if (table === 'ConversationTurn') {
        if (filters.inStatus) {
          return Promise.resolve({ data: state.blockers, error: state.blockersError }).then(resolve, reject);
        }
        if (filters.eqStatus === 'pending') {
          return Promise.resolve({ data: state.pending, error: state.pendingError }).then(resolve, reject);
        }
      }
      return Promise.resolve({ data: [], error: null }).then(resolve, reject);
    };
    return chain;
  }

  return {
    supabase: {
      from: vi.fn((table: string) => {
        events.push(table);
        return makeChain(table);
      }),
    },
  };
});

import { GET } from '@/app/api/ai/turns/route';

function turn(over: Record<string, unknown>) {
  return {
    id: 'turn-1',
    spaceId: 'space-1',
    conversationId: 'conversation-1',
    mode: 'chat',
    source: 'typed',
    clientRequestId: 'req-1',
    message: 'Follow up',
    attachmentIds: [],
    attachments: [],
    priority: 0,
    enqueueSeq: 1,
    status: 'pending',
    lastError: null,
    ...over,
  };
}

function request(conversationId?: string) {
  const url = new URL('http://localhost/api/ai/turns');
  if (conversationId) url.searchParams.set('conversationId', conversationId);
  return new NextRequest(url);
}

beforeEach(() => {
  events.length = 0;
  recoverMock.mockReset().mockImplementation(async () => {
    events.push('recover');
    return [];
  });
  state.conversation = {
    id: 'conversation-1',
    spaceId: 'space-1',
    title: 'Follow up',
    mode: 'chat',
  };
  state.blockers = [];
  state.pending = [];
  state.blockersError = null;
  state.pendingError = null;
});

describe('GET /api/ai/turns queue reconciliation', () => {
  it('recovers expired leases before reading the conversation queue', async () => {
    state.pending = [turn({ id: 'p1' })];

    const response = await GET(request('conversation-1'));

    expect(response.status).toBe(200);
    expect(recoverMock).toHaveBeenCalledWith(expect.anything(), 20);
    expect(events).toEqual(['Conversation', 'recover', 'ConversationTurn', 'ConversationTurn']);
  });

  it('keeps a failed blocker visible even when the pending list is long', async () => {
    state.blockers = [turn({ id: 'failed-1', status: 'failed', lastError: 'provider down', enqueueSeq: 1 })];
    state.pending = Array.from({ length: 8 }, (_, index) =>
      turn({ id: `p${index + 1}`, enqueueSeq: index + 2, lastError: 'should strip' }),
    );

    const response = await GET(request('conversation-1'));
    const body = await response.json() as { turns: Array<{ id: string; status: string; lastError: unknown }> };

    expect(response.status).toBe(200);
    expect(body.turns[0]).toMatchObject({ id: 'failed-1', status: 'failed' });
    expect(body.turns.some((row) => row.id === 'p1')).toBe(true);
    expect(body.turns.every((row) => row.lastError === null)).toBe(true);
  });

  it('still loads the queue when lease recovery fails', async () => {
    recoverMock.mockImplementation(async () => {
      events.push('recover');
      throw new Error('rpc unavailable');
    });
    state.pending = [turn({ id: 'p1' })];

    const response = await GET(request('conversation-1'));
    const body = await response.json() as { turns: Array<{ id: string }> };

    expect(response.status).toBe(200);
    expect(body.turns).toEqual([expect.objectContaining({ id: 'p1' })]);
  });

  it('rejects a missing conversationId and 404s an unknown conversation', async () => {
    expect((await GET(request())).status).toBe(400);

    state.conversation = null;
    expect((await GET(request('missing'))).status).toBe(404);
    expect(recoverMock).not.toHaveBeenCalled();
  });
});
