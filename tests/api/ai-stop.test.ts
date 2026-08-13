/**
 * POST /api/ai/stop — the explicit stop for in-flight chat turns. The
 * boundary that matters: only the conversation's own tenant can stop it,
 * and the route degrades honestly when Redis is unconfigured.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  requireAuthMock,
  getSpaceMock,
  maybeSingleMock,
  requestStopMock,
  requestTurnCancellationMock,
  resolveBrokerMock,
} =
  vi.hoisted(() => ({
    requireAuthMock: vi.fn(),
    getSpaceMock: vi.fn(),
    maybeSingleMock: vi.fn(),
    requestStopMock: vi.fn(),
    requestTurnCancellationMock: vi.fn(),
    resolveBrokerMock: vi.fn(),
  }));

vi.mock('@/lib/api-auth', () => ({ requireAuth: requireAuthMock }));
vi.mock('@/lib/space', () => ({ getSpaceForUser: getSpaceMock }));
vi.mock('@/lib/chat/stop-signal', () => ({ requestChatStop: requestStopMock }));
vi.mock('@/lib/chat/turn-control', () => ({
  requestConversationTurnCancellationV2: requestTurnCancellationMock,
}));
vi.mock('@/lib/agent/broker-context', () => ({ resolveBrokerContext: resolveBrokerMock }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.maybeSingle = maybeSingleMock;
      return chain;
    },
  },
}));

import { POST } from '@/app/api/ai/stop/route';

function req(body: unknown) {
  return new NextRequest('http://t/api/ai/stop', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  requireAuthMock.mockReset().mockResolvedValue({ userId: 'user_1' });
  getSpaceMock.mockReset().mockResolvedValue({ id: 'space_1' });
  maybeSingleMock.mockReset()
    .mockResolvedValueOnce({ data: { id: 'conv_1' } })
    .mockResolvedValueOnce({ data: { id: 'turn_1', attemptToken: 'attempt_1', status: 'running' } });
  requestStopMock.mockReset().mockResolvedValue(true);
  requestTurnCancellationMock.mockReset().mockResolvedValue({ id: 'turn_1' });
  // Default: caller is not a broker. Broker tests override this.
  resolveBrokerMock.mockReset().mockResolvedValue(null);
});

describe('POST /api/ai/stop', () => {
  it('signals a stop for a conversation in the caller tenant', async () => {
    const res = await POST(req({ conversationId: 'conv_1', turnId: 'turn_1' }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, durable: true, accelerated: true });
    expect(requestTurnCancellationMock).toHaveBeenCalledWith(
      expect.anything(),
      { turnId: 'turn_1', spaceId: 'space_1', conversationId: 'conv_1', attemptToken: 'attempt_1' },
    );
    expect(requestStopMock).toHaveBeenCalledWith('turn_1');
  });

  it("404s a conversation outside the caller's space without signalling", async () => {
    maybeSingleMock.mockReset().mockResolvedValueOnce({ data: null });
    const res = await POST(req({ conversationId: 'someone_elses', turnId: 'turn_other' }));
    expect(res.status).toBe(404);
    expect(requestStopMock).not.toHaveBeenCalled();
  });

  it('requires a conversationId', async () => {
    const res = await POST(req({ turnId: 'turn_1' }));
    expect(res.status).toBe(400);
    expect(requestStopMock).not.toHaveBeenCalled();
  });

  it('requires an exact turnId', async () => {
    const res = await POST(req({ conversationId: 'conv_1' }));
    expect(res.status).toBe(400);
    expect(requestStopMock).not.toHaveBeenCalled();
  });

  it('reports signalled:false when Redis is unavailable (client-only stop)', async () => {
    requestStopMock.mockResolvedValue(false);
    const res = await POST(req({ conversationId: 'conv_1', turnId: 'turn_1' }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, durable: true, accelerated: false });
  });
});

describe('POST /api/ai/stop — broker surface', () => {
  it('lets a broker stop their own broker conversation (separate BrokerConversation table)', async () => {
    // The broker conversation is NOT in the realtor Conversation table, so the
    // realtor lookup misses; the broker branch authenticates via
    // resolveBrokerContext and confirms the BrokerConversation is theirs.
    maybeSingleMock.mockReset()
      .mockResolvedValueOnce({ data: null }) // realtor Conversation miss
      .mockResolvedValueOnce({ data: { id: 'bconv_1' } }); // BrokerConversation hit
    resolveBrokerMock.mockResolvedValue({ brokerage: { id: 'brk_1' } });

    const res = await POST(req({ conversationId: 'bconv_1', turnId: 'broker_turn_1' }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, durable: false, accelerated: true });
    expect(requestStopMock).toHaveBeenCalledWith('broker_turn_1');
  });

  it("404s a broker conversation belonging to another brokerage without signalling", async () => {
    maybeSingleMock.mockReset()
      .mockResolvedValueOnce({ data: null }) // realtor miss
      .mockResolvedValueOnce({ data: null }); // BrokerConversation not in this brokerage
    resolveBrokerMock.mockResolvedValue({ brokerage: { id: 'brk_1' } });

    const res = await POST(
      req({ conversationId: 'someone_elses_broker', turnId: 'broker_turn_other' }),
    );
    expect(res.status).toBe(404);
    expect(requestStopMock).not.toHaveBeenCalled();
  });

  it('404s a non-broker caller for an id not in their realtor space', async () => {
    maybeSingleMock.mockReset().mockResolvedValueOnce({ data: null }); // realtor miss
    resolveBrokerMock.mockResolvedValue(null); // not a broker

    const res = await POST(req({ conversationId: 'bconv_1', turnId: 'broker_turn_1' }));
    expect(res.status).toBe(404);
    expect(requestStopMock).not.toHaveBeenCalled();
  });

  it('stops a broker conversation even when the caller has no personal realtor space', async () => {
    getSpaceMock.mockResolvedValue(null); // broker owner without a personal space
    maybeSingleMock.mockReset().mockResolvedValueOnce({ data: { id: 'bconv_1' } }); // BrokerConversation hit
    resolveBrokerMock.mockResolvedValue({ brokerage: { id: 'brk_1' } });

    const res = await POST(req({ conversationId: 'bconv_1', turnId: 'broker_turn_1' }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, durable: false, accelerated: true });
    expect(requestStopMock).toHaveBeenCalledWith('broker_turn_1');
  });
});
