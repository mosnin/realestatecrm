/**
 * WhatsApp routes — slug auth, connection lookup scoped to the caller space,
 * and send validation before the Composio write.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const h = vi.hoisted(() => ({
  requireSpaceOwner: vi.fn(),
  findWhatsAppConnection: vi.fn(),
  sendWhatsAppThrough: vi.fn(),
  executeToolForEntity: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  requireSpaceOwner: (slug: string) => h.requireSpaceOwner(slug),
}));

vi.mock('@/lib/communication/connect', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/communication/connect')>();
  return {
    ...actual,
    findWhatsAppConnection: (spaceId: string) => h.findWhatsAppConnection(spaceId),
    sendWhatsAppThrough: (input: unknown) => h.sendWhatsAppThrough(input),
  };
});

vi.mock('@/lib/integrations/composio', () => ({
  executeToolForEntity: (input: unknown) => h.executeToolForEntity(input),
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { GET as listConversations } from '@/app/api/whatsapp/route';
import { GET as getConversation } from '@/app/api/whatsapp/[id]/route';
import { POST as sendWhatsApp } from '@/app/api/whatsapp/send/route';

const CALLER_SPACE = {
  id: 'space_caller',
  slug: 'jane',
  name: 'Jane',
  ownerId: 'u_caller',
};

const CONN = { id: 'conn_1', userId: 'clerk_jane', toolkit: 'whatsapp' as const };

function listReq(query = 'slug=jane'): NextRequest {
  return new NextRequest(`http://localhost/api/whatsapp?${query}`);
}

function sendReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/whatsapp/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function threadReq(id: string, query = 'slug=jane'): NextRequest {
  return new NextRequest(`http://localhost/api/whatsapp/${encodeURIComponent(id)}?${query}`);
}

beforeEach(() => {
  h.requireSpaceOwner.mockReset();
  h.findWhatsAppConnection.mockReset();
  h.sendWhatsAppThrough.mockReset();
  h.executeToolForEntity.mockReset();
  h.requireSpaceOwner.mockResolvedValue({
    userId: 'u_caller',
    space: CALLER_SPACE,
  });
  h.findWhatsAppConnection.mockResolvedValue(null);
  h.sendWhatsAppThrough.mockResolvedValue({
    ok: true,
    externalMessageId: 'wa_ext_1',
  });
});

describe('GET /api/whatsapp', () => {
  it('requires slug before auth or connection lookup', async () => {
    const res = await listConversations(listReq(''));
    expect(res.status).toBe(400);
    expect(h.requireSpaceOwner).not.toHaveBeenCalled();
    expect(h.findWhatsAppConnection).not.toHaveBeenCalled();
  });

  it('propagates requireSpaceOwner deny and does not look up WhatsApp', async () => {
    h.requireSpaceOwner.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );
    const res = await listConversations(listReq('slug=victim'));
    expect(res.status).toBe(403);
    expect(h.findWhatsAppConnection).not.toHaveBeenCalled();
    expect(h.executeToolForEntity).not.toHaveBeenCalled();
  });

  it('returns connected:false without calling Composio when nothing is linked', async () => {
    const res = await listConversations(listReq());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ connected: false });
    expect(h.findWhatsAppConnection).toHaveBeenCalledWith('space_caller');
    expect(h.executeToolForEntity).not.toHaveBeenCalled();
  });

  it('surfaces noteSlugUnresolved when every list slug is declined', async () => {
    h.findWhatsAppConnection.mockResolvedValue(CONN);
    h.executeToolForEntity.mockResolvedValue({ successful: false });

    const res = await listConversations(listReq());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      connected: true,
      conversations: [],
      noteSlugUnresolved: true,
    });
    expect(h.executeToolForEntity.mock.calls.length).toBeGreaterThan(1);
  });

  it('groups flat messages by phone and keeps the newest snippet', async () => {
    h.findWhatsAppConnection.mockResolvedValue(CONN);
    h.executeToolForEntity.mockResolvedValue({
      successful: true,
      data: {
        messages: [
          {
            phone: '+15551110000',
            contactName: 'Pat',
            text: 'older',
            timestamp: 1_700_000_000,
          },
          {
            phone: '+15551110000',
            contactName: 'Pat',
            text: `${'x'.repeat(200)}`,
            timestamp: 1_700_000_100,
          },
          {
            contact: { name: 'Sam', phone: '+15552220000' },
            lastMessage: { text: 'hi', timestamp: '2024-01-02T00:00:00.000Z' },
          },
          { text: 'orphan with no identity' },
        ],
      },
    });

    const res = await listConversations(listReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.connected).toBe(true);
    expect(body.noteSlugUnresolved).toBeUndefined();
    expect(body.conversations).toHaveLength(2);
    expect(body.conversations[0]).toMatchObject({
      contactPhone: '+15552220000',
      contactName: 'Sam',
      snippet: 'hi',
    });
    expect(body.conversations[1]).toMatchObject({
      contactPhone: '+15551110000',
      contactName: 'Pat',
    });
    expect(body.conversations[1].snippet).toHaveLength(160);
    expect(h.executeToolForEntity).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'clerk_jane' }),
    );
  });
});

describe('POST /api/whatsapp/send', () => {
  it('rejects invalid JSON before auth', async () => {
    const res = await sendWhatsApp(sendReq('{'));
    expect(res.status).toBe(400);
    expect(h.requireSpaceOwner).not.toHaveBeenCalled();
    expect(h.sendWhatsAppThrough).not.toHaveBeenCalled();
  });

  it('requires slug before auth or send', async () => {
    const res = await sendWhatsApp(sendReq({ to: '+15551112222', body: 'Hi' }));
    expect(res.status).toBe(400);
    expect(h.requireSpaceOwner).not.toHaveBeenCalled();
    expect(h.sendWhatsAppThrough).not.toHaveBeenCalled();
  });

  it('propagates requireSpaceOwner deny and does not send', async () => {
    h.requireSpaceOwner.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );
    const res = await sendWhatsApp(
      sendReq({ slug: 'victim', to: '+15551112222', body: 'Hi' }),
    );
    expect(res.status).toBe(403);
    expect(h.findWhatsAppConnection).not.toHaveBeenCalled();
    expect(h.sendWhatsAppThrough).not.toHaveBeenCalled();
  });

  it('rejects a non-phone recipient before looking up the connection', async () => {
    const res = await sendWhatsApp(
      sendReq({ slug: 'jane', to: 'not-a-phone', body: 'Hi' }),
    );
    expect(res.status).toBe(400);
    expect(h.findWhatsAppConnection).not.toHaveBeenCalled();
    expect(h.sendWhatsAppThrough).not.toHaveBeenCalled();
  });

  it('rejects an empty body after auth and before send', async () => {
    const res = await sendWhatsApp(
      sendReq({ slug: 'jane', to: '+15551112222', body: '   ' }),
    );
    expect(res.status).toBe(400);
    expect(h.findWhatsAppConnection).not.toHaveBeenCalled();
    expect(h.sendWhatsAppThrough).not.toHaveBeenCalled();
  });

  it('returns 400 when WhatsApp is not connected for the caller space', async () => {
    const res = await sendWhatsApp(
      sendReq({ slug: 'jane', to: '+15551112222', body: 'Hi there' }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Connect WhatsApp first.' });
    expect(h.findWhatsAppConnection).toHaveBeenCalledWith('space_caller');
    expect(h.sendWhatsAppThrough).not.toHaveBeenCalled();
  });

  it('returns a generic 502 when the provider send fails', async () => {
    h.findWhatsAppConnection.mockResolvedValue(CONN);
    h.sendWhatsAppThrough.mockResolvedValue({
      ok: false,
      error: 'provider leaked internals',
    });
    const res = await sendWhatsApp(
      sendReq({ slug: 'jane', to: '+15551112222', body: 'Hi there' }),
    );
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: 'That didn’t go through.' });
  });

  it('sends through the space connection and returns the external id', async () => {
    h.findWhatsAppConnection.mockResolvedValue(CONN);
    const res = await sendWhatsApp(
      sendReq({ slug: 'jane', to: '+15551112222', body: 'Hi there' }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      externalMessageId: 'wa_ext_1',
    });
    expect(h.sendWhatsAppThrough).toHaveBeenCalledWith({
      entityId: 'clerk_jane',
      to: '+15551112222',
      body: 'Hi there',
    });
  });
});

describe('GET /api/whatsapp/[id]', () => {
  it('requires slug before auth or Composio', async () => {
    const res = await getConversation(threadReq('+15551112222', ''), {
      params: Promise.resolve({ id: encodeURIComponent('+15551112222') }),
    });
    expect(res.status).toBe(400);
    expect(h.requireSpaceOwner).not.toHaveBeenCalled();
    expect(h.findWhatsAppConnection).not.toHaveBeenCalled();
  });

  it('returns 400 when WhatsApp is not connected', async () => {
    const res = await getConversation(threadReq('chat_1'), {
      params: Promise.resolve({ id: 'chat_1' }),
    });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      ok: false,
      error: 'Connect WhatsApp first.',
    });
    expect(h.executeToolForEntity).not.toHaveBeenCalled();
  });

  it('returns 502 when no get slug resolves', async () => {
    h.findWhatsAppConnection.mockResolvedValue(CONN);
    h.executeToolForEntity.mockResolvedValue({ successful: false });
    const res = await getConversation(threadReq('chat_1'), {
      params: Promise.resolve({ id: 'chat_1' }),
    });
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({
      ok: false,
      error: 'Could not load this conversation.',
    });
  });

  it('loads messages oldest-first using the caller space connection', async () => {
    h.findWhatsAppConnection.mockResolvedValue(CONN);
    h.executeToolForEntity.mockResolvedValue({
      successful: true,
      data: {
        messages: [
          {
            id: 'm2',
            from: '+15551110000',
            sender: { name: 'Pat', phone: '+15551110000' },
            text: 'later',
            timestamp: 1_700_000_200,
            direction: 'inbound',
          },
          {
            id: 'm1',
            from: 'me',
            text: 'first',
            timestamp: 1_700_000_100,
            fromMe: true,
          },
        ],
      },
    });

    const res = await getConversation(threadReq('chat_1'), {
      params: Promise.resolve({ id: 'chat_1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.conversation).toEqual({
      id: 'chat_1',
      contactName: 'Pat',
      contactPhone: '+15551110000',
    });
    expect(body.messages.map((m: { id: string }) => m.id)).toEqual(['m1', 'm2']);
    expect(body.messages[0].fromMe).toBe(true);
    expect(body.messages[1].fromMe).toBe(false);
    expect(h.findWhatsAppConnection).toHaveBeenCalledWith('space_caller');
    expect(h.executeToolForEntity).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'clerk_jane',
        arguments: expect.objectContaining({ conversation_id: 'chat_1' }),
      }),
    );
  });
});
