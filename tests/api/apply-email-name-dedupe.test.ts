/**
 * Route-level tests for POST /api/public/apply — email+name identity merge.
 *
 * An email is not an identity. Returning a prior contact's applicationRef when
 * the name differs would hand applicant B applicant A's status portal (a
 * cross-applicant PII leak). Merge only on email + name; a same-email,
 * different-name submit must insert a fresh Contact with its own ref.
 *
 * Also proves the ILIKE lookup is scoped to the resolved space and escapes
 * `%` / `_` so a crafted local-part cannot widen the match.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
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

type Terminal = { data?: unknown; error?: unknown };
const queues: Record<string, Terminal[]> = {};
function queueFor(table: string): Terminal[] {
  if (!queues[table]) queues[table] = [];
  return queues[table];
}

const { observed } = vi.hoisted(() => ({
  observed: {
    inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
    ilikes: [] as Array<{ table: string; column: string; value: string }>,
    eqs: [] as Array<{ table: string; column: string; value: unknown }>,
  },
}));

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const q = queueFor(table);
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn((column: string, value: unknown) => {
      observed.eqs.push({ table, column, value });
      return chain;
    });
    chain.ilike = vi.fn((column: string, value: string) => {
      observed.ilikes.push({ table, column, value });
      return chain;
    });
    chain.contains = vi.fn(() => chain);
    chain.gte = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.limit = vi.fn(() => chain);
    chain.insert = vi.fn((row: Record<string, unknown>) => {
      observed.inserts.push({ table, row });
      return chain;
    });
    chain.update = vi.fn(() => chain);
    const next = (): Terminal => q.shift() ?? { data: null, error: null };
    chain.maybeSingle = vi.fn(() => Promise.resolve(next()));
    chain.single = vi.fn(() => Promise.resolve(next()));
    chain.then = (resolve: (v: Terminal) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(next()).then(resolve, reject);
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

function queueSuccessfulInsert(contactId = 'contact_new') {
  queueFor('Contact').push({ data: [], error: null }); // 5-min name window
  queueFor('SpaceSetting').push({
    data: { privacyPolicyUrl: null, businessName: null, intakeConfirmationEmail: null },
    error: null,
  });
  queueFor('Contact').push({
    data: [{ id: contactId, name: 'Bob Jones', spaceId: 'space_1' }],
    error: null,
  });
  queueFor('ApplicationStatusUpdate').push({ data: null, error: null });
  queueFor('Contact').push({ data: null, error: null });
}

const sharedInbox = {
  slug: 'acme',
  leadType: 'rental' as const,
  email: 'family@example.com',
  phone: '(555) 123-4567',
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(queues)) delete queues[k];
  observed.inserts.length = 0;
  observed.ilikes.length = 0;
  observed.eqs.length = 0;
  getFormConfigsMock.mockResolvedValue({ rental: CONFIG, buyer: null, source: 'custom' });
});

describe('POST /api/public/apply — email is not an identity', () => {
  it('returns the prior ref when email and name match (case-insensitive), without inserting', async () => {
    queueFor('Contact').push({
      data: [{ id: 'contact_prior', name: 'JANE DOE', applicationRef: 'ref_alice' }],
      error: null,
    });

    const res = await POST(makeReq({ ...sharedInbox, name: 'Jane Doe' }));
    const body = (await res.json()) as { id: string; applicationRef?: string };

    expect(res.status).toBe(200);
    expect(body.id).toBe('contact_prior');
    expect(body.applicationRef).toBe('ref_alice');
    expect(observed.inserts).toHaveLength(0);
    expect(observed.eqs).toContainEqual({ table: 'Contact', column: 'spaceId', value: 'space_1' });
  });

  it('does not return a prior portal ref when the same email belongs to a different name', async () => {
    queueFor('Contact').push({
      data: [{ id: 'contact_alice', name: 'Alice Smith', applicationRef: 'SECRET_REF_ALICE' }],
      error: null,
    });
    queueSuccessfulInsert('contact_bob');

    const res = await POST(makeReq({ ...sharedInbox, name: 'Bob Jones' }));
    const body = (await res.json()) as {
      id: string;
      applicationRef?: string;
      statusPortalToken?: string;
    };

    expect(res.status).toBe(201);
    expect(body.id).toBe('contact_bob');
    expect(body.applicationRef).toBeTruthy();
    expect(body.applicationRef).not.toBe('SECRET_REF_ALICE');
    expect(body.statusPortalToken).toEqual(expect.any(String));

    const contactInsert = observed.inserts.find((c) => c.table === 'Contact');
    expect(contactInsert).toBeTruthy();
    expect(contactInsert?.row).toMatchObject({
      spaceId: 'space_1',
      name: 'Bob Jones',
      email: 'family@example.com',
    });
    expect(contactInsert?.row.applicationRef).not.toBe('SECRET_REF_ALICE');
    expect(contactInsert?.row.applicationRef).toBe(body.applicationRef);
  });

  it('escapes ILIKE wildcards in the email so a_b@example.com cannot match aXb', async () => {
    // `%` is not a valid email local-part under the Zod `.email()` gate, but
    // `_` is — and without escapeLike it is a single-character ILIKE wildcard.
    queueFor('Contact').push({
      data: [{ id: 'contact_prior', name: 'Jane Doe', applicationRef: 'ref_1' }],
      error: null,
    });

    const res = await POST(
      makeReq({ ...sharedInbox, name: 'Jane Doe', email: 'a_buyer@example.com' }),
    );

    expect(res.status).toBe(200);
    expect(observed.ilikes).toContainEqual({
      table: 'Contact',
      column: 'email',
      value: 'a\\_buyer@example.com',
    });
    expect(observed.inserts).toHaveLength(0);
  });
});
