/**
 * POST /api/ai/stop — the explicit stop for in-flight chat turns. The
 * boundary that matters: only the conversation's own tenant can stop it,
 * and the route degrades honestly when Redis is unconfigured.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { requireAuthMock, getSpaceMock, maybeSingleMock, requestStopMock, resolveBrokerMock } =
  vi.hoisted(() => ({
    requireAuthMock: vi.fn(),
    getSpaceMock: vi.fn(),
    maybeSingleMock: vi.fn(),
    requestStopMock: vi.fn(),
    resolveBrokerMock: vi.fn(),
  }));

vi.mock('@/lib/api-auth', () => ({ requireAuth: requireAuthMock }));
vi.mock('@/lib/space', () => ({ getSpaceForUser: getSpaceMock }));
vi.mock('@/lib/chat/stop-signal', () => ({ requestChatStop: requestStopMock }));
vi.mock('@/lib/agent/broker-context', () => ({ resolveBrokerContext: resolveBrokerMock }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: maybeSingleMock }),
        }),
      }),
    }),
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
  maybeSingleMock.mockReset().mockResolvedValue({ data: { id: 'conv_1' } });
  requestStopMock.mockReset().mockResolvedValue(true);
  // Default: caller is not a broker. Broker tests override this.
  resolveBrokerMock.mockReset().mockResolvedValue(null);
});

describe('POST /api/ai/stop', () => {
  it('signals a stop for a conversation in the caller tenant', async () => {
    const res = await POST(req({ conversationId: 'conv_1' }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, signalled: true });
    expect(requestStopMock).toHaveBeenCalledWith('conv_1');
  });

  it("404s a conversation outside the caller's space without signalling", async () => {
    maybeSingleMock.mockResolvedValue({ data: null });
    const res = await POST(req({ conversationId: 'someone_elses' }));
    expect(res.status).toBe(404);
    expect(requestStopMock).not.toHaveBeenCalled();
  });

  it('requires a conversationId', async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    expect(requestStopMock).not.toHaveBeenCalled();
  });

  it('reports signalled:false when Redis is unavailable (client-only stop)', async () => {
    requestStopMock.mockResolvedValue(false);
    const res = await POST(req({ conversationId: 'conv_1' }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, signalled: false });
  });
});

describe('POST /api/ai/stop — broker surface', () => {
  it('lets a broker stop their own broker conversation (separate BrokerConversation table)', async () => {
    // The broker conversation is NOT in the realtor Conversation table, so the
    // realtor lookup misses; the broker branch authenticates via
    // resolveBrokerContext and confirms the BrokerConversation is theirs.
    maybeSingleMock
      .mockResolvedValueOnce({ data: null }) // realtor Conversation miss
      .mockResolvedValueOnce({ data: { id: 'bconv_1' } }); // BrokerConversation hit
    resolveBrokerMock.mockResolvedValue({ brokerage: { id: 'brk_1' } });

    const res = await POST(req({ conversationId: 'bconv_1' }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, signalled: true });
    expect(requestStopMock).toHaveBeenCalledWith('bconv_1');
  });

  it("404s a broker conversation belonging to another brokerage without signalling", async () => {
    maybeSingleMock
      .mockResolvedValueOnce({ data: null }) // realtor miss
      .mockResolvedValueOnce({ data: null }); // BrokerConversation not in this brokerage
    resolveBrokerMock.mockResolvedValue({ brokerage: { id: 'brk_1' } });

    const res = await POST(req({ conversationId: 'someone_elses_broker' }));
    expect(res.status).toBe(404);
    expect(requestStopMock).not.toHaveBeenCalled();
  });

  it('404s a non-broker caller for an id not in their realtor space', async () => {
    maybeSingleMock.mockResolvedValue({ data: null }); // realtor miss
    resolveBrokerMock.mockResolvedValue(null); // not a broker

    const res = await POST(req({ conversationId: 'bconv_1' }));
    expect(res.status).toBe(404);
    expect(requestStopMock).not.toHaveBeenCalled();
  });

  it('stops a broker conversation even when the caller has no personal realtor space', async () => {
    getSpaceMock.mockResolvedValue(null); // broker owner without a personal space
    maybeSingleMock.mockResolvedValueOnce({ data: { id: 'bconv_1' } }); // BrokerConversation hit
    resolveBrokerMock.mockResolvedValue({ brokerage: { id: 'brk_1' } });

    const res = await POST(req({ conversationId: 'bconv_1' }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, signalled: true });
    expect(requestStopMock).toHaveBeenCalledWith('bconv_1');
  });
});
