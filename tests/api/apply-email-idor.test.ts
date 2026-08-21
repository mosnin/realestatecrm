/**
 * POST /api/public/apply — email ILIKE wildcard IDOR.
 *
 * The same-email dedupe used `.ilike('email', contactEmail)` without escaping
 * LIKE metacharacters. `_` is "any one character" and `%` is "any run", and
 * both are legal in email local-parts. Submitting `jane_doe@example.com` with
 * the victim's name therefore matched `jane.doe@example.com` and returned that
 * person's contact id + applicationRef — enough to open the public status
 * page and read their application status / realtor notes.
 *
 * The route must pass an escaped literal so Postgres treats `_`/`%` as
 * characters. This test implements ILIKE semantics in the mock: an unescaped
 * pattern matches the victim and leaks their ref; an escaped pattern does not.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { IntakeFormConfig } from '@/lib/types';

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, after: (cb: () => unknown | Promise<unknown>) => cb() };
});

vi.mock('@/lib/leads/first-touch', () => ({
  fireFirstTouch: vi.fn(async () => ({ created: true, draftId: 'draft_1' })),
}));
vi.mock('@/lib/redis', () => ({ redis: { set: vi.fn(async () => 'OK') } }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
  getClientIp: vi.fn(() => '127.0.0.1'),
}));
vi.mock('@/lib/lead-scoring', () => ({
  scoreLeadApplicationDynamic: vi.fn(async () => ({
    scoringStatus: 'scored',
    leadScore: 85,
    scoreLabel: 'hot',
    scoreSummary: 'ok',
    scoreDetails: null,
  })),
}));
vi.mock('@/lib/notify', () => ({ notifyNewLead: vi.fn(async () => undefined) }));
vi.mock('@/lib/email', () => ({ sendApplicationConfirmation: vi.fn(async () => undefined) }));
vi.mock('@/lib/agent/fire-trigger', () => ({ fireAgentTrigger: vi.fn(async () => undefined) }));
vi.mock('@/lib/workflows/executor', () => ({ runWorkflowsForEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/space', () => ({
  getSpaceFromSlug: vi.fn(async () => ({
    id: 'space_1',
    slug: 'acme',
    name: 'Acme Realty',
    emoji: null,
    ownerId: 'user_1',
    brokerageId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    stripeSubscriptionStatus: 'active',
  })),
}));

const { getFormConfigsMock } = vi.hoisted(() => ({ getFormConfigsMock: vi.fn() }));
vi.mock('@/lib/form-builder', () => ({
  getFormConfigs: getFormConfigsMock,
  getDefaultFormConfig: vi.fn(() => null),
}));

const VICTIM = {
  id: 'contact_victim',
  name: 'Jane Doe',
  email: 'jane.doe@example.com',
  applicationRef: 'victim-application-ref-should-not-leak',
};

/** Minimal SQL ILIKE: `_` = any char, `%` = any run, `\` escapes the next char. */
function sqlIlike(value: string, pattern: string): boolean {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\' && i + 1 < pattern.length) {
      re += pattern[i + 1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      i++;
      continue;
    }
    if (c === '%') {
      re += '.*';
      continue;
    }
    if (c === '_') {
      re += '.';
      continue;
    }
    re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, 'i').test(value);
}

type Terminal = { data?: unknown; error?: unknown };
const queues: Record<string, Terminal[]> = {};
function queueFor(table: string): Terminal[] {
  if (!queues[table]) queues[table] = [];
  return queues[table];
}

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const q = queueFor(table);
    let emailPattern: string | null = null;
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.ilike = vi.fn((column: string, value: string) => {
      if (table === 'Contact' && column === 'email') emailPattern = value;
      return chain;
    });
    chain.contains = vi.fn(() => chain);
    chain.gte = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.limit = vi.fn(() => chain);
    chain.insert = vi.fn(() => chain);
    chain.update = vi.fn(() => chain);
    const resolve = (): Terminal => {
      if (table === 'Contact' && emailPattern !== null && q.length === 0) {
        const hit = sqlIlike(VICTIM.email, emailPattern);
        emailPattern = null;
        return hit
          ? { data: [{ id: VICTIM.id, name: VICTIM.name, applicationRef: VICTIM.applicationRef }] }
          : { data: [], error: null };
      }
      emailPattern = null;
      return q.shift() ?? { data: null, error: null };
    };
    chain.maybeSingle = vi.fn(() => Promise.resolve(resolve()));
    chain.single = vi.fn(() => Promise.resolve(resolve()));
    chain.then = (resolveFn: (v: Terminal) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(resolve()).then(resolveFn, reject);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

import { POST } from '@/app/api/public/apply/route';

const CONFIG: IntakeFormConfig = {
  version: 1,
  leadType: 'rental',
  sections: [
    {
      id: 'sec_contact',
      title: 'Your details',
      position: 0,
      questions: [
        { id: 'name', type: 'text', label: 'Name', required: true, position: 0, system: true },
        { id: 'email', type: 'email', label: 'Email', required: true, position: 1, system: true },
        { id: 'phone', type: 'phone', label: 'Phone', required: true, position: 2, system: true },
      ],
    },
  ],
};

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/public/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function queueFreshInsert() {
  // Recent-name dupe window (second Contact read) — empty.
  queueFor('Contact').push({ data: [], error: null });
  queueFor('SpaceSetting').push({
    data: { privacyPolicyUrl: null, businessName: null, intakeConfirmationEmail: null },
    error: null,
  });
  queueFor('Contact').push({
    data: [{ id: 'contact_attacker', name: 'Jane Doe', spaceId: 'space_1' }],
    error: null,
  });
  queueFor('ApplicationStatusUpdate').push({ data: null, error: null });
  queueFor('Contact').push({ data: null, error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(queues)) delete queues[k];
  getFormConfigsMock.mockResolvedValue({ rental: CONFIG, buyer: null, source: 'custom' });
});

describe('POST /api/public/apply — email ILIKE IDOR', () => {
  it('does not return another applicant\'s applicationRef when `_` would wildcard-match their email', async () => {
    queueFreshInsert();

    const res = await POST(
      makeReq({
        slug: 'acme',
        leadType: 'rental',
        name: 'Jane Doe',
        // `_` matches `.` under unescaped ILIKE — this is the exploit.
        email: 'jane_doe@example.com',
        phone: '(555) 123-4567',
      }),
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { id?: string; applicationRef?: string };
    expect(body.id).not.toBe(VICTIM.id);
    expect(body.applicationRef).not.toBe(VICTIM.applicationRef);
  });

  it('still dedupes an exact (case-insensitive) same-email + same-name resubmit', async () => {
    const res = await POST(
      makeReq({
        slug: 'acme',
        leadType: 'rental',
        name: 'Jane Doe',
        email: 'Jane.Doe@example.com',
        phone: '(555) 123-4567',
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; applicationRef?: string };
    expect(body.id).toBe(VICTIM.id);
    expect(body.applicationRef).toBe(VICTIM.applicationRef);
  });
});
