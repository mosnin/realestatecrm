/**
 * Public form-draft resume-link sender — enumeration + tenant + token leak.
 *
 * Anyone can POST an email + spaceId. The route must never reveal whether a
 * draft exists, must look up FormDraft inside that space, and must email the
 * resume token only when an active draft is found.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { checkRateLimit, sendDraftResumeEmail } = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  sendDraftResumeEmail: vi.fn(),
}));

type Terminal = { data?: unknown; error?: unknown };
const queues: Record<string, Terminal[]> = {};
const filterCalls: { table: string; method: string; column: string; value: unknown }[] = [];

function queueFor(table: string): Terminal[] {
  if (!queues[table]) queues[table] = [];
  return queues[table];
}

function makeChain(table: string) {
  const chain: Record<string, unknown> = {};
  const next = (): Promise<Terminal> => Promise.resolve(queueFor(table).shift() ?? { data: null });
  chain.select = vi.fn(() => chain);
  for (const method of ['eq', 'gt', 'is'] as const) {
    chain[method] = vi.fn((column: string, value: unknown) => {
      filterCalls.push({ table, method, column, value });
      return chain;
    });
  }
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(() => next());
  (chain as { then: unknown }).then = (resolve: (v: Terminal) => unknown, reject?: (e: unknown) => unknown) =>
    next().then(resolve, reject);
  return chain;
}

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit,
  getClientIp: vi.fn(() => '127.0.0.1'),
}));
vi.mock('@/lib/email', () => ({ sendDraftResumeEmail }));
vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn((table: string) => makeChain(table)) },
}));

import { POST } from '@/app/api/form-draft/send-link/route';

function post(body: unknown) {
  return POST(
    new NextRequest('http://localhost/api/form-draft/send-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(queues)) delete queues[k];
  filterCalls.length = 0;
  checkRateLimit.mockResolvedValue({ allowed: true });
  sendDraftResumeEmail.mockResolvedValue(undefined);
  vi.spyOn(global, 'setTimeout').mockImplementation((fn: TimerHandler) => {
    if (typeof fn === 'function') fn();
    return 0 as unknown as NodeJS.Timeout;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/form-draft/send-link', () => {
  it('400s invalid input before rate-limit or lookup', async () => {
    expect((await post({ spaceId: 's1', email: 'not-an-email' })).status).toBe(400);
    expect((await post({ email: 'a@b.com' })).status).toBe(400);
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(sendDraftResumeEmail).not.toHaveBeenCalled();
  });

  it('429s when the per-email cap is hit and never reads FormDraft', async () => {
    checkRateLimit.mockResolvedValue({ allowed: false });
    const res = await post({ spaceId: 's1', email: 'Lead@Example.com' });
    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith('draft:email:lead@example.com', 3, 3600);
    expect(filterCalls.some((c) => c.table === 'FormDraft')).toBe(false);
    expect(sendDraftResumeEmail).not.toHaveBeenCalled();
  });

  it('returns sent:true for a missing draft and does not email a token', async () => {
    queueFor('FormDraft').push({ data: null });
    const res = await post({ spaceId: 's1', email: 'lead@example.com' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: true });
    expect(sendDraftResumeEmail).not.toHaveBeenCalled();
    expect(filterCalls).toContainEqual({
      table: 'FormDraft',
      method: 'eq',
      column: 'spaceId',
      value: 's1',
    });
    expect(filterCalls).toContainEqual({
      table: 'FormDraft',
      method: 'eq',
      column: 'email',
      value: 'lead@example.com',
    });
  });

  it('emails the resume token only when an active draft exists in that space', async () => {
    queueFor('FormDraft').push({ data: { id: 'd1', resumeToken: 'tok_secret' } });
    queueFor('Space').push({ data: { slug: 'acme', name: 'Acme Realty' } });
    queueFor('SpaceSetting').push({ data: { businessName: 'Acme' } });

    const res = await post({ spaceId: 's1', email: 'Lead@Example.com' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: true });
    expect(sendDraftResumeEmail).toHaveBeenCalledTimes(1);
    expect(sendDraftResumeEmail).toHaveBeenCalledWith({
      toEmail: 'lead@example.com',
      businessName: 'Acme',
      resumeUrl: expect.stringContaining('/apply/acme?resume=tok_secret'),
    });
    expect(filterCalls).toContainEqual({
      table: 'FormDraft',
      method: 'eq',
      column: 'spaceId',
      value: 's1',
    });
  });
});
