/**
 * Route-level test for POST /api/public/apply — Instant First Touch wiring.
 *
 * The contract under test:
 *   - A successful fresh submission dispatches fireFirstTouch exactly once
 *     with the authenticated space's id and the persisted contact's id.
 *   - The dispatch is fire-and-forget: even a synchronously-throwing
 *     first-touch module must not change the submission outcome (201).
 *   - Dedupe paths that return an existing contact do NOT fire a first
 *     touch (nothing new landed).
 *
 * Mirrors tests/api/apply-workflow-hook.test.ts: after() runs inline,
 * Supabase is a per-table terminal queue.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { IntakeFormConfig } from '@/lib/types';

// ── after(): run the deferred callback inline so dispatches are observable ──
vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, after: (cb: () => unknown | Promise<unknown>) => cb() };
});

// ── The module under assertion ───────────────────────────────────────────────
const { fireFirstTouchMock } = vi.hoisted(() => ({
  fireFirstTouchMock: vi.fn(
    (_input: { spaceId: string; contactId: string }) =>
      Promise.resolve({ created: true, draftId: 'draft_1' }),
  ),
}));
vi.mock('@/lib/leads/first-touch', () => ({
  fireFirstTouch: fireFirstTouchMock,
}));

// ── Mocks for all non-DB side effects ────────────────────────────────────────
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

// ── Supabase: per-table terminal queue ───────────────────────────────────────
type Terminal = { data?: unknown; error?: unknown };
const queues: Record<string, Terminal[]> = {};
function queueFor(table: string): Terminal[] {
  if (!queues[table]) queues[table] = [];
  return queues[table];
}

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const q = queueFor(table);
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.ilike = vi.fn(() => chain);
    chain.contains = vi.fn(() => chain);
    chain.gte = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.limit = vi.fn(() => chain);
    chain.insert = vi.fn(() => chain);
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

// Order matches the route: Contact(emailDedupe empty) → Contact(recentDupe empty)
// → SpaceSetting(settings) → Contact(insert row) → ApplicationStatusUpdate →
// Contact(update scoring).
function queueSuccessfulInsert() {
  queueFor('Contact').push({ data: [], error: null });
  queueFor('Contact').push({ data: [], error: null });
  queueFor('SpaceSetting').push({
    data: { privacyPolicyUrl: null, businessName: null, intakeConfirmationEmail: null },
    error: null,
  });
  queueFor('Contact').push({ data: [{ id: 'contact_1', name: 'Jane Doe', spaceId: 'space_1' }], error: null });
  queueFor('ApplicationStatusUpdate').push({ data: null, error: null });
  queueFor('Contact').push({ data: null, error: null }); // scoring update
}

const goodBody = {
  slug: 'acme',
  leadType: 'rental',
  name: 'Jane Doe',
  email: 'jane@example.com',
  phone: '(555) 123-4567',
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(queues)) delete queues[k];
  getFormConfigsMock.mockResolvedValue({ rental: CONFIG, buyer: null, source: 'custom' });
  fireFirstTouchMock
    .mockReset()
    .mockImplementation(() => Promise.resolve({ created: true, draftId: 'draft_1' }));
});

describe('POST /api/public/apply — instant first touch wiring', () => {
  it('fires exactly one first touch with the real spaceId and contactId', async () => {
    queueSuccessfulInsert();

    const res = await POST(makeReq(goodBody));
    expect(res.status).toBe(201);

    expect(fireFirstTouchMock).toHaveBeenCalledTimes(1);
    expect(fireFirstTouchMock).toHaveBeenCalledWith({
      spaceId: 'space_1',
      contactId: 'contact_1',
    });
  });

  it('still returns 201 when the first-touch module throws synchronously', async () => {
    queueSuccessfulInsert();
    fireFirstTouchMock.mockImplementation(() => {
      throw new Error('first-touch boom');
    });

    const res = await POST(makeReq(goodBody));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { success: boolean; id: string };
    expect(body.success).toBe(true);
    expect(body.id).toBe('contact_1');
  });

  it('does NOT fire a first touch when the submission dedupes to an existing contact', async () => {
    // Email-dedupe hit: same email + same name → route returns the prior
    // contact without inserting anything new.
    queueFor('Contact').push({
      data: [{ id: 'contact_prior', name: 'Jane Doe', applicationRef: 'ref_1' }],
      error: null,
    });

    const res = await POST(makeReq(goodBody));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string };
    expect(body.id).toBe('contact_prior');

    expect(fireFirstTouchMock).not.toHaveBeenCalled();
  });
});
