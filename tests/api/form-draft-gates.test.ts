/**
 * Public apply-form draft gates.
 *
 * POST /api/form-draft is unauthenticated: anyone who knows a spaceId can
 * create or update a FormDraft. These tests lock the fail-closed rules:
 *
 *   1. Invalid / oversized payloads never hit rate-limit or the directory.
 *   2. Rate-limit 429s before Space or FormDraft lookups.
 *   3. Unknown spaceId 404s and does not insert.
 *   4. Allowed creates write the caller's spaceId + normalized email and
 *      mint a 64-hex resume token. Allowed updates do not mint a new token.
 *
 * GET /api/form-draft is a capability-token surface (64-hex resumeToken).
 * Missing / malformed tokens 400 before the directory. Expired or completed
 * drafts 410. A hit never returns email or the token itself.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  checkRateLimit,
  sendDraftResumeEmail,
  after,
  eqCalls,
  inserts,
  updates,
  SPACE,
  EXISTING,
  makeChain,
  setExistingDraft,
  setGetDraft,
} = vi.hoisted(() => {
  const eqCalls: { table: string; column: string; value: unknown }[] = [];
  const inserts: { table: string; values: Record<string, unknown> }[] = [];
  const updates: { table: string; payload: Record<string, unknown> }[] = [];
  const SPACE = { id: 'sp_draft', slug: 'acme', name: 'Acme Realty' };
  const EXISTING = {
    id: 'draft_existing',
    resumeToken: 'a'.repeat(64),
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  let existingDraft: typeof EXISTING | null = null;
  let getDraft: Record<string, unknown> | null = null;

  function makeChain(table: string) {
    const filters: { column: string; value: unknown }[] = [];
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = vi.fn(self);
    chain.order = vi.fn(self);
    chain.limit = vi.fn(self);
    chain.is = vi.fn(self);
    chain.gt = vi.fn(self);
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
      if (table === 'Space') {
        const id = filters.find((f) => f.column === 'id')?.value;
        return id === SPACE.id ? { data: SPACE, error: null } : { data: null, error: null };
      }
      if (table === 'FormDraft' && existingDraft) {
        return { data: existingDraft, error: null };
      }
      if (table === 'FormDraft' && getDraft) {
        const token = filters.find((f) => f.column === 'resumeToken')?.value;
        return token === getDraft.resumeToken
          ? { data: getDraft, error: null }
          : { data: null, error: null };
      }
      if (table === 'SpaceSetting') {
        return { data: { businessName: 'Acme Realty' }, error: null };
      }
      return { data: null, error: null };
    });
    chain.single = vi.fn(async () => {
      if (table === 'FormDraft') {
        return { data: { id: 'draft_new' }, error: null };
      }
      return { data: null, error: null };
    });
    (chain as { then: unknown }).then = (
      resolve: (value: { data: unknown; error: null }) => unknown,
      reject?: (error: unknown) => unknown,
    ) => Promise.resolve({ data: null, error: null }).then(resolve, reject);
    return chain;
  }

  return {
    checkRateLimit: vi.fn(async () => ({ allowed: true })),
    sendDraftResumeEmail: vi.fn(async () => undefined),
    after: vi.fn((fn: () => unknown) => {
      void fn();
    }),
    eqCalls,
    inserts,
    updates,
    SPACE,
    EXISTING,
    makeChain,
    setExistingDraft: (draft: typeof EXISTING | null) => {
      existingDraft = draft;
    },
    setGetDraft: (draft: Record<string, unknown> | null) => {
      getDraft = draft;
    },
  };
});

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit,
  getClientIp: vi.fn(() => '203.0.113.9'),
}));

vi.mock('@/lib/email', () => ({
  sendDraftResumeEmail,
}));

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after };
});

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn((table: string) => makeChain(table)) },
}));

import { GET as getDraft, POST as postDraft } from '@/app/api/form-draft/route';

const VALID_TOKEN = 'a'.repeat(64);

function postReq(body: unknown) {
  return new NextRequest('http://localhost/api/form-draft', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function getReq(token?: string) {
  const url = new URL('http://localhost/api/form-draft');
  if (token !== undefined) url.searchParams.set('token', token);
  return new NextRequest(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimit.mockResolvedValue({ allowed: true });
  eqCalls.length = 0;
  inserts.length = 0;
  updates.length = 0;
  setExistingDraft(null);
  setGetDraft(null);
});

describe('POST /api/form-draft — validation, rate, space, tenant write', () => {
  it('400s invalid JSON or missing fields and does not rate-limit or look up Space', async () => {
    const badJson = await postDraft(postReq('not-json'));
    expect(badJson.status).toBe(400);

    const missing = await postDraft(postReq({ answers: {} }));
    expect(missing.status).toBe(400);

    const badEmail = await postDraft(
      postReq({ spaceId: SPACE.id, email: 'not-an-email', answers: {} }),
    );
    expect(badEmail.status).toBe(400);

    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(eqCalls.filter((c) => c.table === 'Space')).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it('413s oversized answers before rate-limit or Space lookup', async () => {
    const res = await postDraft(
      postReq({
        spaceId: SPACE.id,
        email: 'pat@example.com',
        answers: { blob: 'x'.repeat(512_001) },
      }),
    );
    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toEqual({ error: 'Draft data too large' });
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(eqCalls.filter((c) => c.table === 'Space')).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it('400s more than 500 answer keys before rate-limit or Space lookup', async () => {
    const answers: Record<string, number> = {};
    for (let i = 0; i < 501; i += 1) answers[`k${i}`] = i;

    const res = await postDraft(
      postReq({ spaceId: SPACE.id, email: 'pat@example.com', answers }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Too many answer fields' });
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
  });

  it('429s the IP bucket before email rate-limit or Space lookup', async () => {
    checkRateLimit.mockResolvedValueOnce({ allowed: false });

    const res = await postDraft(
      postReq({ spaceId: SPACE.id, email: 'pat@example.com', answers: { a: 1 } }),
    );
    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledTimes(1);
    expect(checkRateLimit).toHaveBeenCalledWith('draft:save:ip:203.0.113.9', 60, 3600);
    expect(eqCalls.filter((c) => c.table === 'Space')).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it('429s the email bucket after IP is allowed and does not look up Space', async () => {
    checkRateLimit
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false });

    const res = await postDraft(
      postReq({ spaceId: SPACE.id, email: 'Pat@Example.COM ', answers: { a: 1 } }),
    );
    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenNthCalledWith(2, 'draft:save:pat@example.com', 30, 3600);
    expect(eqCalls.filter((c) => c.table === 'Space')).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it('404s an unknown spaceId and does not insert a FormDraft', async () => {
    const res = await postDraft(
      postReq({ spaceId: 'sp_missing', email: 'pat@example.com', answers: { a: 1 } }),
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'Space not found' });
    expect(inserts.filter((row) => row.table === 'FormDraft')).toHaveLength(0);
  });

  it('updates an existing open draft in that space and does not mint a new token', async () => {
    setExistingDraft(EXISTING);

    const res = await postDraft(
      postReq({
        spaceId: SPACE.id,
        email: 'pat@example.com',
        answers: { pets: true },
        currentStep: 2,
        completed: true,
      }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ draftId: EXISTING.id, updated: true });
    expect(inserts).toHaveLength(0);
    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'FormDraft',
          payload: expect.objectContaining({
            answers: { pets: true },
            currentStep: 2,
            completedAt: expect.any(String),
          }),
        }),
      ]),
    );
    expect(eqCalls).toEqual(
      expect.arrayContaining([
        { table: 'FormDraft', column: 'spaceId', value: SPACE.id },
        { table: 'FormDraft', column: 'email', value: 'pat@example.com' },
        { table: 'FormDraft', column: 'id', value: EXISTING.id },
      ]),
    );
    expect(sendDraftResumeEmail).not.toHaveBeenCalled();
  });

  it('creates a new draft scoped to the space with a 64-hex token and normalized email', async () => {
    const res = await postDraft(
      postReq({
        spaceId: SPACE.id,
        email: 'Pat@Example.COM ',
        answers: { name: 'Pat' },
        currentStep: 0,
      }),
    );
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ draftId: 'draft_new', updated: false });

    const created = inserts.find((row) => row.table === 'FormDraft');
    expect(created).toBeDefined();
    expect(created?.values.spaceId).toBe(SPACE.id);
    expect(created?.values.email).toBe('pat@example.com');
    expect(created?.values.answers).toEqual({ name: 'Pat' });
    expect(created?.values.resumeToken).toMatch(/^[a-f0-9]{64}$/);
    expect(eqCalls).toEqual(
      expect.arrayContaining([{ table: 'FormDraft', column: 'spaceId', value: SPACE.id }]),
    );
    expect(sendDraftResumeEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        toEmail: 'pat@example.com',
        businessName: 'Acme Realty',
        resumeUrl: expect.stringContaining(`/apply/${SPACE.slug}?resume=`),
      }),
    );
  });
});

describe('GET /api/form-draft — resume token gate', () => {
  it('400s a missing, short, or non-hex token before rate-limit or FormDraft lookup', async () => {
    const missing = await getDraft(getReq());
    expect(missing.status).toBe(400);

    const short = await getDraft(getReq('abc'));
    expect(short.status).toBe(400);

    const notHex = await getDraft(getReq('G'.repeat(64)));
    expect(notHex.status).toBe(400);

    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(eqCalls.filter((c) => c.table === 'FormDraft')).toHaveLength(0);
  });

  it('429s after format checks and does not look up FormDraft', async () => {
    checkRateLimit.mockResolvedValue({ allowed: false });
    const res = await getDraft(getReq(VALID_TOKEN));
    expect(res.status).toBe(429);
    expect(eqCalls.filter((c) => c.table === 'FormDraft')).toHaveLength(0);
  });

  it('404s an unknown token', async () => {
    const res = await getDraft(getReq(VALID_TOKEN));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'Draft not found' });
  });

  it('410s an expired draft and does not return answers', async () => {
    setGetDraft({
      id: 'draft_old',
      answers: { secret: 'do-not-leak' },
      currentStep: 1,
      formConfigVersion: 1,
      spaceId: SPACE.id,
      completedAt: null,
      expiresAt: '2020-01-01T00:00:00.000Z',
      resumeToken: VALID_TOKEN,
    });

    const res = await getDraft(getReq(VALID_TOKEN));
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body).toEqual({ error: 'This link has expired' });
    expect(JSON.stringify(body)).not.toContain('do-not-leak');
  });

  it('410s a completed draft and does not return answers', async () => {
    setGetDraft({
      id: 'draft_done',
      answers: { secret: 'already-submitted' },
      currentStep: 4,
      formConfigVersion: 1,
      spaceId: SPACE.id,
      completedAt: '2026-01-02T00:00:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z',
      resumeToken: VALID_TOKEN,
    });

    const res = await getDraft(getReq(VALID_TOKEN));
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body).toEqual({ error: 'This application has already been submitted' });
    expect(JSON.stringify(body)).not.toContain('already-submitted');
  });

  it('returns answers and space slug without email or the resume token', async () => {
    setGetDraft({
      id: 'draft_open',
      answers: { pets: false },
      currentStep: 1,
      formConfigVersion: 3,
      spaceId: SPACE.id,
      completedAt: null,
      expiresAt: '2099-01-01T00:00:00.000Z',
      resumeToken: VALID_TOKEN,
      email: 'pat@example.com',
    });

    const res = await getDraft(getReq(VALID_TOKEN));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      answers: { pets: false },
      currentStep: 1,
      formConfigVersion: 3,
      spaceSlug: SPACE.slug,
    });
    expect(body).not.toHaveProperty('email');
    expect(body).not.toHaveProperty('resumeToken');
    expect(eqCalls).toEqual(
      expect.arrayContaining([
        { table: 'FormDraft', column: 'resumeToken', value: VALID_TOKEN },
        { table: 'Space', column: 'id', value: SPACE.id },
      ]),
    );
  });
});
