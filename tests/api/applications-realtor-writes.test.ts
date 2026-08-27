/**
 * Realtor-facing application writes.
 *
 * POST/GET /api/applications/[id]/message and PATCH .../status sit behind
 * requireContactAccess. These tests lock the remaining fail-closed rules
 * that IDOR suites do not cover:
 *
 *   1. A denied contact never inserts, updates, or lists.
 *   2. Empty / over-long / invalid payloads 400 before Contact lookup.
 *   3. Allowed messages insert senderType=realtor in the caller's space,
 *      with HTML stripped. A missing contact 404s and does not insert.
 *   4. GET marks unread applicant messages read in that space only.
 *   5. Allowed status changes write Contact + ApplicationStatusUpdate in
 *      the caller's space and reject unknown statuses.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const {
  requireContactAccess,
  sendStatusUpdateEmail,
  after,
  eqCalls,
  inserts,
  updates,
  CALLER,
  CONTACT,
  makeChain,
  setContact,
  setMessages,
} = vi.hoisted(() => {
  const eqCalls: { table: string; column: string; value: unknown }[] = [];
  const inserts: { table: string; values: Record<string, unknown> }[] = [];
  const updates: { table: string; payload: Record<string, unknown> }[] = [];
  const CALLER = { id: 'sp_own', slug: 'jane', name: 'Jane', ownerId: 'u_caller' };
  const CONTACT = {
    id: 'c_own',
    email: 'pat@example.com',
    name: 'Pat Applicant',
    spaceId: 'sp_own',
    applicationRef: 'appref_owned01',
    statusPortalToken: 'tok_abcdefghijklmnopqrstuvwxyz012345',
    applicationStatus: 'received',
  };

  let contact: typeof CONTACT | null = CONTACT;
  let messages: Array<Record<string, unknown>> = [];

  function makeChain(table: string) {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    for (const m of ['select', 'order', 'limit', 'in', 'is', 'gt', 'neq']) {
      chain[m] = vi.fn(self);
    }
    chain.eq = vi.fn((column: string, value: unknown) => {
      eqCalls.push({ table, column, value });
      return chain;
    });
    chain.insert = vi.fn((values: Record<string, unknown>) => {
      inserts.push({ table, values });
      return chain;
    });
    chain.update = vi.fn((payload: Record<string, unknown>) => {
      updates.push({ table, payload });
      return chain;
    });
    chain.maybeSingle = vi.fn(async () =>
      table === 'Contact' ? { data: contact, error: null } : { data: null, error: null },
    );
    chain.single = vi.fn(async () => {
      if (table === 'Contact') {
        return contact
          ? { data: contact, error: null }
          : { data: null, error: { message: 'not found' } };
      }
      if (table === 'ApplicationMessage') {
        const last = inserts.at(-1)?.values;
        return {
          data: {
            id: 'msg_realtor',
            senderType: last?.senderType,
            content: last?.content,
            createdAt: '2026-01-02T00:00:00.000Z',
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });
    (chain as { then: unknown }).then = (
      resolve: (value: { data: unknown; error: null }) => unknown,
      reject?: (error: unknown) => unknown,
    ) => {
      const data = table === 'ApplicationMessage' ? messages : null;
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    };
    return chain;
  }

  return {
    requireContactAccess: vi.fn(),
    sendStatusUpdateEmail: vi.fn(async () => undefined),
    after: vi.fn((fn: () => unknown) => {
      void fn();
    }),
    eqCalls,
    inserts,
    updates,
    CALLER,
    CONTACT,
    makeChain,
    setContact: (row: typeof CONTACT | null) => {
      contact = row;
    },
    setMessages: (rows: Array<Record<string, unknown>>) => {
      messages = rows;
    },
  };
});

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after };
});

vi.mock('@/lib/api-auth', () => ({
  requireContactAccess,
}));

vi.mock('@/lib/email', () => ({
  sendStatusUpdateEmail,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn((table: string) => makeChain(table)) },
}));

import { GET as getMessage, POST as postMessage } from '@/app/api/applications/[id]/message/route';
import { PATCH as patchStatus } from '@/app/api/applications/[id]/status/route';

const DENY = NextResponse.json({ error: 'Not found' }, { status: 404 });
const AUTH = { userId: 'u_caller', space: CALLER };

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function jsonReq(method: string, path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  eqCalls.length = 0;
  inserts.length = 0;
  updates.length = 0;
  setContact(CONTACT);
  setMessages([]);
  requireContactAccess.mockResolvedValue(AUTH);
});

describe('POST /api/applications/[id]/message — access + tenant write', () => {
  it('returns the deny response and does not look up Contact or insert', async () => {
    requireContactAccess.mockResolvedValue(DENY);

    const res = await postMessage(
      jsonReq('POST', '/api/applications/c_victim/message', { content: 'Hello' }),
      params('c_victim'),
    );
    expect(res.status).toBe(404);
    expect(eqCalls).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it('400s empty or over-long content before Contact lookup', async () => {
    const empty = await postMessage(
      jsonReq('POST', `/api/applications/${CONTACT.id}/message`, { content: '   ' }),
      params(CONTACT.id),
    );
    expect(empty.status).toBe(400);

    const tooLong = await postMessage(
      jsonReq('POST', `/api/applications/${CONTACT.id}/message`, { content: 'x'.repeat(2001) }),
      params(CONTACT.id),
    );
    expect(tooLong.status).toBe(400);
    expect(eqCalls.filter((c) => c.table === 'Contact')).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it('404s when the scoped Contact row is missing and does not insert', async () => {
    setContact(null);

    const res = await postMessage(
      jsonReq('POST', `/api/applications/${CONTACT.id}/message`, { content: 'Hello' }),
      params(CONTACT.id),
    );
    expect(res.status).toBe(404);
    expect(eqCalls).toEqual(
      expect.arrayContaining([
        { table: 'Contact', column: 'spaceId', value: CALLER.id },
        { table: 'Contact', column: 'id', value: CONTACT.id },
      ]),
    );
    expect(inserts.filter((row) => row.table === 'ApplicationMessage')).toHaveLength(0);
  });

  it('inserts senderType=realtor in the caller space and strips HTML', async () => {
    const res = await postMessage(
      jsonReq('POST', `/api/applications/${CONTACT.id}/message`, {
        content: 'Please send <b>paystubs</b>',
      }),
      params(CONTACT.id),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.message).toEqual(
      expect.objectContaining({
        senderType: 'realtor',
        content: 'Please send paystubs',
      }),
    );

    const created = inserts.find((row) => row.table === 'ApplicationMessage');
    expect(created?.values).toEqual(
      expect.objectContaining({
        contactId: CONTACT.id,
        spaceId: CALLER.id,
        senderType: 'realtor',
        content: 'Please send paystubs',
      }),
    );
    expect(eqCalls).toEqual(
      expect.arrayContaining([{ table: 'Contact', column: 'spaceId', value: CALLER.id }]),
    );
  });
});

describe('GET /api/applications/[id]/message — mark applicant read', () => {
  it('returns the deny response and does not list or mark read', async () => {
    requireContactAccess.mockResolvedValue(DENY);

    const res = await getMessage(
      new NextRequest('http://localhost/api/applications/c_victim/message'),
      params('c_victim'),
    );
    expect(res.status).toBe(404);
    expect(eqCalls).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it('lists messages scoped to the caller space and marks unread applicant rows read', async () => {
    setMessages([
      { id: 'm_app', senderType: 'applicant', readAt: null, content: 'Hi', createdAt: '2026-01-01' },
      { id: 'm_rea', senderType: 'realtor', readAt: null, content: 'Thanks', createdAt: '2026-01-02' },
      { id: 'm_old', senderType: 'applicant', readAt: '2026-01-01T00:00:00.000Z', content: 'Old', createdAt: '2025-12-01' },
    ]);

    const res = await getMessage(
      new NextRequest(`http://localhost/api/applications/${CONTACT.id}/message`),
      params(CONTACT.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages).toHaveLength(3);
    expect(eqCalls).toEqual(
      expect.arrayContaining([
        { table: 'ApplicationMessage', column: 'spaceId', value: CALLER.id },
        { table: 'ApplicationMessage', column: 'contactId', value: CONTACT.id },
      ]),
    );
    expect(updates).toEqual([
      expect.objectContaining({
        table: 'ApplicationMessage',
        payload: { readAt: expect.any(String) },
      }),
    ]);
  });

  it('does not mark read when every applicant message is already read', async () => {
    setMessages([
      { id: 'm_app', senderType: 'applicant', readAt: '2026-01-01T00:00:00.000Z', content: 'Hi' },
      { id: 'm_rea', senderType: 'realtor', readAt: null, content: 'Thanks' },
    ]);

    const res = await getMessage(
      new NextRequest(`http://localhost/api/applications/${CONTACT.id}/message`),
      params(CONTACT.id),
    );
    expect(res.status).toBe(200);
    expect(updates).toHaveLength(0);
  });
});

describe('PATCH /api/applications/[id]/status — validation + audit write', () => {
  it('returns the deny response and does not update Contact', async () => {
    requireContactAccess.mockResolvedValue(DENY);

    const res = await patchStatus(
      jsonReq('PATCH', '/api/applications/c_victim/status', { status: 'approved' }),
      params('c_victim'),
    );
    expect(res.status).toBe(404);
    expect(updates.filter((row) => row.table === 'Contact')).toHaveLength(0);
    expect(inserts.filter((row) => row.table === 'ApplicationStatusUpdate')).toHaveLength(0);
  });

  it('400s a missing or unknown status before Contact lookup', async () => {
    const missing = await patchStatus(
      jsonReq('PATCH', `/api/applications/${CONTACT.id}/status`, {}),
      params(CONTACT.id),
    );
    expect(missing.status).toBe(400);

    const invalid = await patchStatus(
      jsonReq('PATCH', `/api/applications/${CONTACT.id}/status`, { status: 'needs_info' }),
      params(CONTACT.id),
    );
    expect(invalid.status).toBe(400);
    expect(eqCalls.filter((c) => c.table === 'Contact')).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it('404s when the scoped Contact row is missing and does not write', async () => {
    setContact(null);

    const res = await patchStatus(
      jsonReq('PATCH', `/api/applications/${CONTACT.id}/status`, { status: 'approved' }),
      params(CONTACT.id),
    );
    expect(res.status).toBe(404);
    expect(updates.filter((row) => row.table === 'Contact')).toHaveLength(0);
    expect(inserts.filter((row) => row.table === 'ApplicationStatusUpdate')).toHaveLength(0);
  });

  it('updates status in the caller space and inserts a scoped audit row', async () => {
    const res = await patchStatus(
      jsonReq('PATCH', `/api/applications/${CONTACT.id}/status`, {
        status: 'under_review',
        note: '  checking income  ',
      }),
      params(CONTACT.id),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, status: 'under_review' });

    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'Contact',
          payload: expect.objectContaining({
            applicationStatus: 'under_review',
            applicationStatusNote: 'checking income',
          }),
        }),
      ]),
    );
    expect(inserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'ApplicationStatusUpdate',
          values: expect.objectContaining({
            contactId: CONTACT.id,
            spaceId: CALLER.id,
            fromStatus: 'received',
            toStatus: 'under_review',
            note: 'checking income',
          }),
        }),
      ]),
    );
    expect(eqCalls).toEqual(
      expect.arrayContaining([
        { table: 'Contact', column: 'spaceId', value: CALLER.id },
        { table: 'Contact', column: 'id', value: CONTACT.id },
      ]),
    );
  });
});
