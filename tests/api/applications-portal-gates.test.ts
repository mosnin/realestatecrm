/**
 * Public applicant-portal capability-token gates.
 *
 * GET /api/applications/portal, POST .../message, and POST .../tour-request
 * authorize with applicationRef + statusPortalToken (not Clerk / client-session).
 * These tests lock the fail-closed rules:
 *
 *   1. Missing or malformed tokens never hit the directory (404, not 403).
 *   2. A real ref with the wrong token 404s and does not list, insert, or
 *      mark messages read.
 *   3. Allowed writes insert into the contact's space as senderType=applicant
 *      and never accept a caller-supplied spaceId.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { checkRateLimit, eqCalls, inserts, updates, OWNED, makeChain } = vi.hoisted(() => {
  const eqCalls: { table: string; column: string; value: unknown }[] = [];
  const inserts: { table: string; values: Record<string, unknown> }[] = [];
  const updates: { table: string; payload: Record<string, unknown> }[] = [];
  const OWNED = {
    id: 'c_own',
    spaceId: 'sp_own',
    name: 'Pat Applicant',
    email: 'pat@example.com',
    applicationStatus: 'received',
    applicationStatusNote: null,
    applicationRef: 'appref_owned01',
    statusPortalToken: 'tok_abcdefghijklmnopqrstuvwxyz012345',
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  function makeChain(table: string) {
    const filters: { column: string; value: unknown }[] = [];
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = vi.fn(self);
    chain.order = vi.fn(self);
    chain.in = vi.fn(self);
    chain.eq = vi.fn((column: string, value: unknown) => {
      filters.push({ column, value });
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
    chain.maybeSingle = vi.fn(async () => {
      if (table === 'Contact') {
        const ref = filters.find((f) => f.column === 'applicationRef')?.value;
        const token = filters.find((f) => f.column === 'statusPortalToken')?.value;
        return ref === OWNED.applicationRef && token === OWNED.statusPortalToken
          ? { data: OWNED, error: null }
          : { data: null, error: null };
      }
      if (table === 'SpaceSetting') {
        return { data: { businessName: 'Acme Realty' }, error: null };
      }
      return { data: null, error: null };
    });
    chain.single = vi.fn(async () => {
      if (table === 'ApplicationMessage') {
        return {
          data: {
            id: 'msg_1',
            senderType: inserts.at(-1)?.values.senderType,
            content: inserts.at(-1)?.values.content,
            createdAt: '2026-01-02T00:00:00.000Z',
          },
          error: null,
        };
      }
      if (table === 'AgentQuestion') {
        return { data: { id: 'q_1' }, error: null };
      }
      return { data: null, error: null };
    });
    (chain as { then: unknown }).then = (
      resolve: (value: { data: unknown; error: null }) => unknown,
      reject?: (error: unknown) => unknown,
    ) => {
      const data =
        table === 'ApplicationStatusUpdate'
          ? []
          : table === 'ApplicationMessage'
            ? []
            : table === 'Tour'
              ? []
              : null;
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    };
    return chain;
  }

  return {
    checkRateLimit: vi.fn(async () => ({ allowed: true })),
    eqCalls,
    inserts,
    updates,
    OWNED,
    makeChain,
  };
});

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit,
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: vi.fn() };
});

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn((table: string) => makeChain(table)) },
}));

import { GET as getPortal } from '@/app/api/applications/portal/route';
import { POST as postMessage } from '@/app/api/applications/portal/message/route';
import { POST as postTourRequest } from '@/app/api/applications/portal/tour-request/route';

const VALID_TOKEN = OWNED.statusPortalToken;
const VALID_REF = OWNED.applicationRef;

function getReq(query: Record<string, string>) {
  const url = new URL('http://localhost/api/applications/portal');
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

function postReq(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimit.mockResolvedValue({ allowed: true });
  eqCalls.length = 0;
  inserts.length = 0;
  updates.length = 0;
});

describe('GET /api/applications/portal — token gate', () => {
  it('400s when ref or token is missing and does not look up Contact', async () => {
    const missing = await getPortal(getReq({}));
    expect(missing.status).toBe(400);
    const noToken = await getPortal(getReq({ ref: VALID_REF }));
    expect(noToken.status).toBe(400);
    expect(eqCalls.filter((c) => c.table === 'Contact')).toHaveLength(0);
  });

  it('404s a short token before the directory lookup', async () => {
    const res = await getPortal(getReq({ ref: VALID_REF, token: 'too-short' }));
    expect(res.status).toBe(404);
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(eqCalls.filter((c) => c.table === 'Contact')).toHaveLength(0);
  });

  it('429s after format checks and does not look up Contact', async () => {
    checkRateLimit.mockResolvedValue({ allowed: false });
    const res = await getPortal(getReq({ ref: VALID_REF, token: VALID_TOKEN }));
    expect(res.status).toBe(429);
    expect(eqCalls.filter((c) => c.table === 'Contact')).toHaveLength(0);
  });

  it('404s a real ref with the wrong token and does not list messages or mark read', async () => {
    const res = await getPortal(
      getReq({ ref: VALID_REF, token: 'tok_WRONG_abcdefghijklmnopqrstuvwxyz' }),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Application not found' });
    expect(eqCalls.some((c) => c.table === 'ApplicationMessage')).toBe(false);
    expect(updates.filter((u) => u.table === 'ApplicationMessage')).toHaveLength(0);
  });

  it('returns the owned application when ref + token match', async () => {
    const res = await getPortal(getReq({ ref: VALID_REF, token: VALID_TOKEN }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.contact).toEqual({
      name: 'Pat Applicant',
      status: 'received',
      statusNote: null,
      applicationRef: VALID_REF,
      createdAt: OWNED.createdAt,
    });
    expect(body.contact).not.toHaveProperty('email');
    expect(body.contact).not.toHaveProperty('statusPortalToken');
    expect(body.contact).not.toHaveProperty('id');
    expect(eqCalls).toEqual(
      expect.arrayContaining([
        { table: 'Contact', column: 'applicationRef', value: VALID_REF },
        { table: 'Contact', column: 'statusPortalToken', value: VALID_TOKEN },
      ]),
    );
  });
});

describe('POST /api/applications/portal/message — token + tenant write', () => {
  it('400s empty or over-long content and does not insert', async () => {
    const empty = await postMessage(
      postReq('/api/applications/portal/message', {
        applicationRef: VALID_REF,
        token: VALID_TOKEN,
        content: '   ',
      }),
    );
    expect(empty.status).toBe(400);

    const tooLong = await postMessage(
      postReq('/api/applications/portal/message', {
        applicationRef: VALID_REF,
        token: VALID_TOKEN,
        content: 'x'.repeat(2001),
      }),
    );
    expect(tooLong.status).toBe(400);
    expect(inserts).toHaveLength(0);
  });

  it('404s a short token before rate-limit or insert', async () => {
    const res = await postMessage(
      postReq('/api/applications/portal/message', {
        applicationRef: VALID_REF,
        token: 'short',
        content: 'Hello',
      }),
    );
    expect(res.status).toBe(404);
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
  });

  it('404s a wrong token and does not insert a message', async () => {
    const res = await postMessage(
      postReq('/api/applications/portal/message', {
        applicationRef: VALID_REF,
        token: 'tok_WRONG_abcdefghijklmnopqrstuvwxyz',
        content: 'Hello from the wrong token',
      }),
    );
    expect(res.status).toBe(404);
    expect(inserts).toHaveLength(0);
  });

  it('inserts senderType=applicant scoped to the contact spaceId', async () => {
    const res = await postMessage(
      postReq('/api/applications/portal/message', {
        applicationRef: VALID_REF,
        token: VALID_TOKEN,
        content: 'Can we tour Saturday?',
        spaceId: 'sp_attacker',
      }),
    );
    expect(res.status).toBe(201);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toEqual({
      table: 'ApplicationMessage',
      values: {
        contactId: 'c_own',
        spaceId: 'sp_own',
        senderType: 'applicant',
        content: 'Can we tour Saturday?',
      },
    });
  });
});

describe('POST /api/applications/portal/tour-request — token + tenant write', () => {
  it('400s without preferredTimes and does not insert', async () => {
    const res = await postTourRequest(
      postReq('/api/applications/portal/tour-request', {
        applicationRef: VALID_REF,
        token: VALID_TOKEN,
      }),
    );
    expect(res.status).toBe(400);
    expect(inserts).toHaveLength(0);
  });

  it('404s a wrong token and does not insert a message or question', async () => {
    const res = await postTourRequest(
      postReq('/api/applications/portal/tour-request', {
        applicationRef: VALID_REF,
        token: 'tok_WRONG_abcdefghijklmnopqrstuvwxyz',
        preferredTimes: 'Saturday morning',
      }),
    );
    expect(res.status).toBe(404);
    expect(inserts).toHaveLength(0);
  });

  it('inserts the applicant message and AgentQuestion in the contact space', async () => {
    const res = await postTourRequest(
      postReq('/api/applications/portal/tour-request', {
        applicationRef: VALID_REF,
        token: VALID_TOKEN,
        preferredTimes: 'Saturday 10am',
        propertyAddress: '7 Oak Ave',
        notes: 'Need evening if Saturday fills',
        spaceId: 'sp_attacker',
      }),
    );
    expect(res.status).toBe(201);
    expect(inserts.map((i) => i.table).sort()).toEqual(['AgentQuestion', 'ApplicationMessage']);
    const message = inserts.find((i) => i.table === 'ApplicationMessage')!;
    expect(message.values.spaceId).toBe('sp_own');
    expect(message.values.contactId).toBe('c_own');
    expect(message.values.senderType).toBe('applicant');
    expect(String(message.values.content)).toContain('7 Oak Ave');
    expect(String(message.values.content)).toContain('Saturday 10am');

    const question = inserts.find((i) => i.table === 'AgentQuestion')!;
    expect(question.values.spaceId).toBe('sp_own');
    expect(question.values.contactId).toBe('c_own');
    expect(question.values.status).toBe('pending');
    expect(question.values.agentType).toBe('applicant_portal');
    expect(question.values).not.toEqual(expect.objectContaining({ spaceId: 'sp_attacker' }));
  });
});
