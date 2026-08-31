/**
 * Clerk webhook — Svix verification before any User/audit/Mailchimp work,
 * plus login/logout audit and user.created Mailchimp sync.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  verify: vi.fn(),
  audit: vi.fn(),
  syncUserToMailchimp: vi.fn(),
  userRow: null as { id: string } | null,
  userLookups: [] as Array<{ clerkId: string }>,
}));

vi.mock('svix', () => ({
  Webhook: class {
    constructor(_secret: string) {}
    verify(rawBody: string, headers: Record<string, string>) {
      return h.verify(rawBody, headers);
    }
  },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const chain = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          filters[col] = val;
          return chain;
        },
        maybeSingle: async () => {
          if (table === 'User' && typeof filters.clerkId === 'string') {
            h.userLookups.push({ clerkId: filters.clerkId });
          }
          return { data: h.userRow, error: null };
        },
      };
      return chain;
    },
  },
}));

vi.mock('@/lib/audit', () => ({
  audit: (input: unknown) => h.audit(input),
}));

vi.mock('@/lib/mailchimp', () => ({
  syncUserToMailchimp: (input: unknown) => h.syncUserToMailchimp(input),
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { POST } from '@/app/api/webhooks/clerk/route';

function webhookReq(args?: {
  body?: string;
  headers?: Record<string, string>;
}): NextRequest {
  return new NextRequest('http://localhost/api/webhooks/clerk', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(args?.headers ?? {
        'svix-id': 'msg_1',
        'svix-timestamp': '1710000000',
        'svix-signature': 'v1,sig',
      }),
    },
    body: args?.body ?? '{}',
  });
}

const PREV_CLERK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

beforeEach(() => {
  h.verify.mockReset();
  h.audit.mockReset();
  h.syncUserToMailchimp.mockReset();
  h.userLookups.length = 0;
  h.userRow = { id: 'user_db_1' };
  h.audit.mockResolvedValue(undefined);
  h.syncUserToMailchimp.mockResolvedValue({ ok: true, memberStatus: 'subscribed' });
  process.env.CLERK_WEBHOOK_SECRET = 'whsec_test';
});

afterEach(() => {
  if (PREV_CLERK_SECRET === undefined) delete process.env.CLERK_WEBHOOK_SECRET;
  else process.env.CLERK_WEBHOOK_SECRET = PREV_CLERK_SECRET;
});

describe('POST /api/webhooks/clerk', () => {
  it('returns 500 and skips verification when the secret is missing', async () => {
    delete process.env.CLERK_WEBHOOK_SECRET;
    const res = await POST(webhookReq());
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'Webhook not configured' });
    expect(h.verify).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
  });

  it('returns 400 when Svix headers are missing and does not verify', async () => {
    const res = await POST(webhookReq({ headers: {} }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'Missing Svix signature headers',
    });
    expect(h.verify).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
  });

  it('returns 400 on a failed signature and does not write audit or Mailchimp', async () => {
    h.verify.mockImplementation(() => {
      throw new Error('bad signature');
    });
    const res = await POST(webhookReq({ body: '{"type":"session.created"}' }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid signature' });
    expect(h.audit).not.toHaveBeenCalled();
    expect(h.syncUserToMailchimp).not.toHaveBeenCalled();
  });

  it('records LOGIN against the User looked up by clerkId', async () => {
    h.verify.mockReturnValue({
      type: 'session.created',
      object: 'event',
      data: {
        id: 'sess_1',
        user_id: 'clerk_jane',
        client_id: 'client_1',
      },
    });

    const res = await POST(
      webhookReq({
        headers: {
          'svix-id': 'msg_1',
          'svix-timestamp': '1710000000',
          'svix-signature': 'v1,sig',
          'x-forwarded-for': '203.0.113.10',
        },
      }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
    expect(h.verify).toHaveBeenCalledWith('{}', {
      'svix-id': 'msg_1',
      'svix-timestamp': '1710000000',
      'svix-signature': 'v1,sig',
    });
    expect(h.userLookups).toEqual([{ clerkId: 'clerk_jane' }]);
    expect(h.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorClerkId: 'clerk_jane',
        action: 'LOGIN',
        resource: 'Session',
        resourceId: 'sess_1',
        metadata: expect.objectContaining({
          sessionId: 'sess_1',
          userId: 'user_db_1',
          clientId: 'client_1',
          ip: '203.0.113.10',
        }),
      }),
    );
    expect(h.syncUserToMailchimp).not.toHaveBeenCalled();
  });

  it('records LOGOUT for session.ended without Mailchimp', async () => {
    h.verify.mockReturnValue({
      type: 'session.ended',
      object: 'event',
      data: { id: 'sess_2', user_id: 'clerk_jane' },
    });

    const res = await POST(webhookReq());
    expect(res.status).toBe(200);
    expect(h.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorClerkId: 'clerk_jane',
        action: 'LOGOUT',
        resource: 'Session',
        resourceId: 'sess_2',
        metadata: expect.objectContaining({
          eventType: 'session.ended',
          userId: 'user_db_1',
        }),
      }),
    );
    expect(h.syncUserToMailchimp).not.toHaveBeenCalled();
  });

  it('syncs user.created to Mailchimp using the primary email and skips audit', async () => {
    h.verify.mockReturnValue({
      type: 'user.created',
      object: 'event',
      data: {
        id: 'clerk_new',
        primary_email_address_id: 'em_2',
        first_name: 'Pat',
        last_name: 'Doe',
        email_addresses: [
          { id: 'em_1', email_address: 'other@example.com' },
          { id: 'em_2', email_address: 'pat@example.com' },
        ],
      },
    });

    const res = await POST(webhookReq());
    expect(res.status).toBe(200);
    expect(h.syncUserToMailchimp).toHaveBeenCalledWith({
      email: 'pat@example.com',
      name: 'Pat Doe',
    });
    expect(h.audit).not.toHaveBeenCalled();
    expect(h.userLookups).toEqual([]);
  });

  it('acknowledges user.created with no email without calling Mailchimp', async () => {
    h.verify.mockReturnValue({
      type: 'user.created',
      object: 'event',
      data: { id: 'clerk_new', email_addresses: [] },
    });

    const res = await POST(webhookReq());
    expect(res.status).toBe(200);
    expect(h.syncUserToMailchimp).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
  });

  it('still returns 200 when audit throws so Clerk does not retry', async () => {
    h.verify.mockReturnValue({
      type: 'session.created',
      object: 'event',
      data: { id: 'sess_3', user_id: 'clerk_jane' },
    });
    h.audit.mockRejectedValue(new Error('db down'));

    const res = await POST(webhookReq());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
  });
});
