/**
 * Email routes — slug auth, connection lookup scoped to the caller space,
 * send validation before the Composio write, and HTML sanitization on read.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const h = vi.hoisted(() => ({
  requireSpaceOwner: vi.fn(),
  findEmailConnection: vi.fn(),
  sendEmailThrough: vi.fn(),
  setEmailStar: vi.fn(),
  executeToolForEntity: vi.fn(),
  markExpiredByToolkit: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  requireSpaceOwner: (slug: string) => h.requireSpaceOwner(slug),
}));

vi.mock('@/lib/communication/connect', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/communication/connect')>();
  return {
    ...actual,
    findEmailConnection: (spaceId: string) => h.findEmailConnection(spaceId),
    sendEmailThrough: (input: unknown) => h.sendEmailThrough(input),
    setEmailStar: (input: unknown) => h.setEmailStar(input),
  };
});

vi.mock('@/lib/integrations/composio', () => ({
  executeToolForEntity: (input: unknown) => h.executeToolForEntity(input),
}));

vi.mock('@/lib/integrations/connections', () => ({
  markExpiredByToolkit: (input: unknown) => h.markExpiredByToolkit(input),
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/with-observability', () => ({
  withObservability: (fn: unknown) => fn,
}));

import { GET as listEmail } from '@/app/api/email/route';
import { GET as getEmail } from '@/app/api/email/[id]/route';
import { POST as sendEmail } from '@/app/api/email/send/route';
import { POST as starEmail } from '@/app/api/email/star/route';

const CALLER_SPACE = {
  id: 'space_caller',
  slug: 'jane',
  name: 'Jane',
  ownerId: 'u_caller',
};

const GMAIL_CONN = { id: 'conn_1', userId: 'clerk_jane', toolkit: 'gmail' as const };
const OUTLOOK_CONN = { id: 'conn_2', userId: 'clerk_jane', toolkit: 'outlook' as const };

function listReq(query = 'slug=jane'): NextRequest {
  return new NextRequest(`http://localhost/api/email?${query}`);
}

function sendReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function starReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/email/star', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function messageReq(id: string, query = 'slug=jane'): NextRequest {
  return new NextRequest(
    `http://localhost/api/email/${encodeURIComponent(id)}?${query}`,
  );
}

beforeEach(() => {
  h.requireSpaceOwner.mockReset();
  h.findEmailConnection.mockReset();
  h.sendEmailThrough.mockReset();
  h.setEmailStar.mockReset();
  h.executeToolForEntity.mockReset();
  h.markExpiredByToolkit.mockReset();
  h.requireSpaceOwner.mockResolvedValue({
    userId: 'u_caller',
    space: CALLER_SPACE,
  });
  h.findEmailConnection.mockResolvedValue(null);
  h.sendEmailThrough.mockResolvedValue({
    ok: true,
    externalMessageId: 'gmail_ext_1',
  });
  h.setEmailStar.mockResolvedValue({ ok: true });
  h.markExpiredByToolkit.mockResolvedValue(undefined);
});

describe('GET /api/email', () => {
  it('requires slug before auth or connection lookup', async () => {
    const res = await listEmail(listReq(''));
    expect(res.status).toBe(400);
    expect(h.requireSpaceOwner).not.toHaveBeenCalled();
    expect(h.findEmailConnection).not.toHaveBeenCalled();
  });

  it('propagates requireSpaceOwner deny and does not look up email', async () => {
    h.requireSpaceOwner.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );
    const res = await listEmail(listReq('slug=victim'));
    expect(res.status).toBe(403);
    expect(h.findEmailConnection).not.toHaveBeenCalled();
    expect(h.executeToolForEntity).not.toHaveBeenCalled();
  });

  it('returns connected:false without calling Composio when nothing is linked', async () => {
    const res = await listEmail(listReq());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ connected: false });
    expect(h.findEmailConnection).toHaveBeenCalledWith('space_caller');
    expect(h.executeToolForEntity).not.toHaveBeenCalled();
  });

  it('surfaces Outlook as connected with an honest pending note and skips Composio', async () => {
    h.findEmailConnection.mockResolvedValue(OUTLOOK_CONN);
    const res = await listEmail(listReq('slug=jane&filter=starred'));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      connected: true,
      provider: 'outlook',
      filter: 'starred',
      items: [],
      nextPageToken: null,
      noteOutlookReadPending: true,
    });
    expect(h.executeToolForEntity).not.toHaveBeenCalled();
  });

  it('maps Gmail messages, caps snippets at 160, and uses the caller space connection', async () => {
    h.findEmailConnection.mockResolvedValue(GMAIL_CONN);
    h.executeToolForEntity.mockResolvedValue({
      successful: true,
      data: {
        messages: [
          {
            messageId: 'm1',
            threadId: 't1',
            sender: 'Pat Doe <pat@example.com>',
            to: 'Jane <jane@example.com>',
            subject: '  Hello  ',
            messageText: `${'x'.repeat(200)}`,
            messageTimestamp: '2024-01-02T00:00:00.000Z',
            labelIds: ['UNREAD', 'INBOX'],
          },
          {
            messageId: 'm2',
            sender: 'sam@example.com',
            preview: { body: 'preview body' },
            messageTimestamp: '2024-01-01T00:00:00.000Z',
            labelIds: ['STARRED'],
          },
          { subject: 'orphan without messageId' },
        ],
        next_page_token: 'page_2',
      },
    });

    const res = await listEmail(listReq('slug=jane&filter=inbox'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.connected).toBe(true);
    expect(body.provider).toBe('gmail');
    expect(body.filter).toBe('inbox');
    expect(body.nextPageToken).toBe('page_2');
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({
      id: 'm1',
      threadId: 't1',
      fromName: 'Pat Doe',
      fromAddress: 'pat@example.com',
      toName: 'Jane',
      toAddress: 'jane@example.com',
      subject: 'Hello',
      unread: true,
      starred: false,
      sentAt: '2024-01-02T00:00:00.000Z',
    });
    expect(body.items[0].snippet).toHaveLength(160);
    expect(body.items[1]).toMatchObject({
      id: 'm2',
      fromName: '',
      fromAddress: 'sam@example.com',
      snippet: 'preview body',
      unread: false,
      starred: true,
    });
    expect(h.executeToolForEntity).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'clerk_jane',
        slug: 'GMAIL_FETCH_EMAILS',
        arguments: expect.objectContaining({
          label_ids: ['INBOX'],
          max_results: 30,
        }),
      }),
    );
  });

  it('omits label filters when a search query is present', async () => {
    h.findEmailConnection.mockResolvedValue(GMAIL_CONN);
    h.executeToolForEntity.mockResolvedValue({
      successful: true,
      data: { messages: [] },
    });

    const res = await listEmail(listReq('slug=jane&filter=sent&q=from:pat'));
    expect(res.status).toBe(200);
    expect(h.executeToolForEntity).toHaveBeenCalledWith(
      expect.objectContaining({
        arguments: expect.objectContaining({
          q: 'from:pat',
          query: 'from:pat',
        }),
      }),
    );
    const args = h.executeToolForEntity.mock.calls[0][0] as {
      arguments: Record<string, unknown>;
    };
    expect(args.arguments.label_ids).toBeUndefined();
  });

  it('returns empty items when Gmail list is unsuccessful without leaking the error', async () => {
    h.findEmailConnection.mockResolvedValue(GMAIL_CONN);
    h.executeToolForEntity.mockResolvedValue({
      successful: false,
      error: 'provider leaked internals',
    });

    const res = await listEmail(listReq());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      connected: true,
      provider: 'gmail',
      filter: 'inbox',
      items: [],
      nextPageToken: null,
    });
  });

  it('treats a stale Composio auth error as disconnected and marks the toolkit expired', async () => {
    h.findEmailConnection.mockResolvedValue(GMAIL_CONN);
    h.executeToolForEntity.mockRejectedValue({
      statusCode: 401,
      message: 'no connected account found',
    });

    const res = await listEmail(listReq());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ connected: false });
    expect(h.markExpiredByToolkit).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: 'space_caller',
        userId: 'clerk_jane',
        toolkit: 'gmail',
      }),
    );
  });

  it('returns a generic 502 when Gmail list throws a non-auth error', async () => {
    h.findEmailConnection.mockResolvedValue(GMAIL_CONN);
    h.executeToolForEntity.mockRejectedValue(new Error('socket hang up'));

    const res = await listEmail(listReq());
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({
      error: 'Could not load your email.',
    });
  });
});

describe('POST /api/email/send', () => {
  it('rejects invalid JSON before auth', async () => {
    const res = await sendEmail(sendReq('{'));
    expect(res.status).toBe(400);
    expect(h.requireSpaceOwner).not.toHaveBeenCalled();
    expect(h.sendEmailThrough).not.toHaveBeenCalled();
  });

  it('requires slug before auth or send', async () => {
    const res = await sendEmail(
      sendReq({ to: 'pat@example.com', subject: 'Hi', body: 'Hello' }),
    );
    expect(res.status).toBe(400);
    expect(h.requireSpaceOwner).not.toHaveBeenCalled();
    expect(h.sendEmailThrough).not.toHaveBeenCalled();
  });

  it('propagates requireSpaceOwner deny and does not send', async () => {
    h.requireSpaceOwner.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );
    const res = await sendEmail(
      sendReq({
        slug: 'victim',
        to: 'pat@example.com',
        subject: 'Hi',
        body: 'Hello',
      }),
    );
    expect(res.status).toBe(403);
    expect(h.findEmailConnection).not.toHaveBeenCalled();
    expect(h.sendEmailThrough).not.toHaveBeenCalled();
  });

  it('rejects a non-email recipient before looking up the connection', async () => {
    const res = await sendEmail(
      sendReq({ slug: 'jane', to: 'not-an-email', subject: 'Hi', body: 'Hello' }),
    );
    expect(res.status).toBe(400);
    expect(h.findEmailConnection).not.toHaveBeenCalled();
    expect(h.sendEmailThrough).not.toHaveBeenCalled();
  });

  it('rejects a missing subject after auth and before send', async () => {
    const res = await sendEmail(
      sendReq({ slug: 'jane', to: 'pat@example.com', subject: '  ', body: 'Hello' }),
    );
    expect(res.status).toBe(400);
    expect(h.findEmailConnection).not.toHaveBeenCalled();
    expect(h.sendEmailThrough).not.toHaveBeenCalled();
  });

  it('returns 400 when email is not connected for the caller space', async () => {
    const res = await sendEmail(
      sendReq({
        slug: 'jane',
        to: 'pat@example.com',
        subject: 'Hi',
        body: 'Hello there',
      }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Connect email first.' });
    expect(h.findEmailConnection).toHaveBeenCalledWith('space_caller');
    expect(h.sendEmailThrough).not.toHaveBeenCalled();
  });

  it('rejects Outlook send without calling the provider', async () => {
    h.findEmailConnection.mockResolvedValue(OUTLOOK_CONN);
    const res = await sendEmail(
      sendReq({
        slug: 'jane',
        to: 'pat@example.com',
        subject: 'Hi',
        body: 'Hello there',
      }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'Outlook send isn’t supported yet. Connect Gmail to send.',
    });
    expect(h.sendEmailThrough).not.toHaveBeenCalled();
  });

  it('returns a generic 502 when the provider send fails', async () => {
    h.findEmailConnection.mockResolvedValue(GMAIL_CONN);
    h.sendEmailThrough.mockResolvedValue({
      ok: false,
      error: 'provider leaked internals',
    });
    const res = await sendEmail(
      sendReq({
        slug: 'jane',
        to: 'pat@example.com',
        subject: 'Hi',
        body: 'Hello there',
      }),
    );
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: 'That didn’t go through.' });
  });

  it('sends through the space connection and returns the external id', async () => {
    h.findEmailConnection.mockResolvedValue(GMAIL_CONN);
    const res = await sendEmail(
      sendReq({
        slug: 'jane',
        to: 'pat@example.com, sam@example.com',
        cc: 'cc@example.com',
        subject: '  Tour tomorrow  ',
        body: 'See you at 2.',
      }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      externalMessageId: 'gmail_ext_1',
    });
    expect(h.sendEmailThrough).toHaveBeenCalledWith({
      entityId: 'clerk_jane',
      provider: 'gmail',
      to: ['pat@example.com', 'sam@example.com'],
      cc: ['cc@example.com'],
      bcc: undefined,
      subject: 'Tour tomorrow',
      body: 'See you at 2.',
    });
  });
});

describe('GET /api/email/[id]', () => {
  it('requires slug before auth or Composio', async () => {
    const res = await getEmail(messageReq('msg_1', ''), {
      params: Promise.resolve({ id: 'msg_1' }),
    });
    expect(res.status).toBe(400);
    expect(h.requireSpaceOwner).not.toHaveBeenCalled();
    expect(h.findEmailConnection).not.toHaveBeenCalled();
  });

  it('propagates requireSpaceOwner deny and does not fetch the message', async () => {
    h.requireSpaceOwner.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );
    const res = await getEmail(messageReq('msg_1', 'slug=victim'), {
      params: Promise.resolve({ id: 'msg_1' }),
    });
    expect(res.status).toBe(403);
    expect(h.findEmailConnection).not.toHaveBeenCalled();
    expect(h.executeToolForEntity).not.toHaveBeenCalled();
  });

  it('returns 400 when email is not connected', async () => {
    const res = await getEmail(messageReq('msg_1'), {
      params: Promise.resolve({ id: 'msg_1' }),
    });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      ok: false,
      error: 'Connect email first.',
    });
    expect(h.executeToolForEntity).not.toHaveBeenCalled();
  });

  it('returns 400 for Outlook without fetching the message', async () => {
    h.findEmailConnection.mockResolvedValue(OUTLOOK_CONN);
    const res = await getEmail(messageReq('msg_1'), {
      params: Promise.resolve({ id: 'msg_1' }),
    });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      ok: false,
      error: 'Outlook read is on the way.',
    });
    expect(h.executeToolForEntity).not.toHaveBeenCalled();
  });

  it('returns a generic 502 when Gmail get is unsuccessful', async () => {
    h.findEmailConnection.mockResolvedValue(GMAIL_CONN);
    h.executeToolForEntity.mockResolvedValue({
      successful: false,
      error: 'provider leaked internals',
    });
    const res = await getEmail(messageReq('msg_1'), {
      params: Promise.resolve({ id: 'msg_1' }),
    });
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({
      ok: false,
      error: 'Could not load this email.',
    });
  });

  it('loads the message via the caller space connection and sanitizes HTML', async () => {
    h.findEmailConnection.mockResolvedValue(GMAIL_CONN);
    h.executeToolForEntity.mockResolvedValue({
      successful: true,
      data: {
        messageId: 'msg_1',
        threadId: 'thr_1',
        sender: 'Pat Doe <pat@example.com>',
        to: 'Jane <jane@example.com>, sam@example.com',
        cc: 'cc@example.com',
        subject: '  Hello  ',
        messageText: '<p>Hi</p><script>alert(1)</script><img src=x onerror=alert(2)>',
        messageTimestamp: '2024-01-02T00:00:00.000Z',
        labelIds: ['STARRED'],
        webLink: 'https://mail.google.com/mail/u/0/#inbox/msg_1',
      },
    });

    const res = await getEmail(messageReq('msg_1'), {
      params: Promise.resolve({ id: 'msg_1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.message).toMatchObject({
      id: 'msg_1',
      threadId: 'thr_1',
      fromName: 'Pat Doe',
      fromAddress: 'pat@example.com',
      subject: 'Hello',
      starred: true,
      sentAt: '2024-01-02T00:00:00.000Z',
      webLink: 'https://mail.google.com/mail/u/0/#inbox/msg_1',
    });
    expect(body.message.to).toEqual([
      { name: 'Jane', address: 'jane@example.com' },
      { name: '', address: 'sam@example.com' },
    ]);
    expect(body.message.cc).toEqual([{ name: '', address: 'cc@example.com' }]);
    expect(body.message.body).toContain('Hi');
    expect(body.message.bodyHtml).toContain('<p>Hi</p>');
    expect(body.message.bodyHtml).not.toMatch(/<script/i);
    expect(body.message.bodyHtml).not.toMatch(/onerror/i);
    expect(h.findEmailConnection).toHaveBeenCalledWith('space_caller');
    expect(h.executeToolForEntity).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'clerk_jane',
        slug: 'GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID',
        arguments: expect.objectContaining({
          message_id: 'msg_1',
          messageId: 'msg_1',
          format: 'full',
        }),
      }),
    );
  });
});

describe('POST /api/email/star', () => {
  it('rejects invalid JSON before auth', async () => {
    const res = await starEmail(starReq('{'));
    expect(res.status).toBe(400);
    expect(h.requireSpaceOwner).not.toHaveBeenCalled();
    expect(h.setEmailStar).not.toHaveBeenCalled();
  });

  it('requires slug before auth', async () => {
    const res = await starEmail(starReq({ messageId: 'msg_1', starred: true }));
    expect(res.status).toBe(400);
    expect(h.requireSpaceOwner).not.toHaveBeenCalled();
    expect(h.setEmailStar).not.toHaveBeenCalled();
  });

  it('requires messageId after slug and before auth', async () => {
    const res = await starEmail(starReq({ slug: 'jane', starred: true }));
    expect(res.status).toBe(400);
    expect(h.requireSpaceOwner).not.toHaveBeenCalled();
    expect(h.setEmailStar).not.toHaveBeenCalled();
  });

  it('propagates requireSpaceOwner deny and does not toggle the star', async () => {
    h.requireSpaceOwner.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );
    const res = await starEmail(
      starReq({ slug: 'victim', messageId: 'msg_1', starred: true }),
    );
    expect(res.status).toBe(403);
    expect(h.findEmailConnection).not.toHaveBeenCalled();
    expect(h.setEmailStar).not.toHaveBeenCalled();
  });

  it('returns 400 when email is not connected', async () => {
    const res = await starEmail(
      starReq({ slug: 'jane', messageId: 'msg_1', starred: true }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Connect email first.' });
    expect(h.findEmailConnection).toHaveBeenCalledWith('space_caller');
    expect(h.setEmailStar).not.toHaveBeenCalled();
  });

  it('rejects Outlook starring without calling the provider', async () => {
    h.findEmailConnection.mockResolvedValue(OUTLOOK_CONN);
    const res = await starEmail(
      starReq({ slug: 'jane', messageId: 'msg_1', starred: true }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'Starring is Gmail-only for now.',
    });
    expect(h.setEmailStar).not.toHaveBeenCalled();
  });

  it('returns a generic 502 when the provider star fails', async () => {
    h.findEmailConnection.mockResolvedValue(GMAIL_CONN);
    h.setEmailStar.mockResolvedValue({
      ok: false,
      error: 'provider leaked internals',
    });
    const res = await starEmail(
      starReq({ slug: 'jane', messageId: 'msg_1', starred: true }),
    );
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({
      error: 'Could not update the star.',
    });
  });

  it('stars through the space connection and coerces non-true starred to false', async () => {
    h.findEmailConnection.mockResolvedValue(GMAIL_CONN);
    const res = await starEmail(
      starReq({ slug: 'jane', messageId: 'msg_1', starred: 'true' }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, starred: false });
    expect(h.setEmailStar).toHaveBeenCalledWith({
      entityId: 'clerk_jane',
      provider: 'gmail',
      messageId: 'msg_1',
      starred: false,
    });
  });
});
