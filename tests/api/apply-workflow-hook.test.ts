/**
 * Route-level test for POST /api/public/apply — workflow-engine hook.
 *
 * The contract under test (lead-event wiring):
 *   - A successful submission fires runWorkflowsForEvent for `lead_created` AND,
 *     when a numeric score is known, `lead_score_threshold` — passing the real
 *     spaceId and the persisted lead/contact row (with its score).
 *   - The dispatch is fire-and-forget via Next's after(): a workflow error MUST
 *     NOT change the lead-creation outcome (the route still returns 201).
 *
 * after() is mocked to invoke its callback inline so we can assert the dispatch
 * deterministically. Supabase is a per-table terminal queue mirroring
 * tests/api/apply-conditional-required.test.ts.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { IntakeFormConfig } from '@/lib/types';

// ── after(): run the deferred callback inline so the dispatch is observable ──
vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, after: (cb: () => unknown | Promise<unknown>) => cb() };
});

// ── The workflow engine entry point under assertion ──────────────────────────
const { runWorkflowsForEventMock } = vi.hoisted(() => ({
  runWorkflowsForEventMock: vi.fn<(input: { spaceId: string; triggerType: string; context: { lead: Record<string, unknown> }; triggerEvent: unknown }) => Promise<void>>(async () => undefined),
}));
vi.mock('@/lib/workflows/executor', () => ({
  runWorkflowsForEvent: runWorkflowsForEventMock,
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
  runWorkflowsForEventMock.mockReset().mockResolvedValue(undefined);
});

describe('POST /api/public/apply — workflow hook', () => {
  it('fires runWorkflowsForEvent for lead_created AND lead_score_threshold', async () => {
    queueSuccessfulInsert();
    const res = await POST(makeReq(goodBody));
    expect(res.status).toBe(201);

    const types = runWorkflowsForEventMock.mock.calls.map(
      (c) => (c[0] as { triggerType: string }).triggerType,
    );
    expect(types).toContain('lead_created');
    expect(types).toContain('lead_score_threshold');

    const created = runWorkflowsForEventMock.mock.calls.find(
      (c) => (c[0] as { triggerType: string }).triggerType === 'lead_created',
    )![0] as { spaceId: string; context: { lead: Record<string, unknown> } };
    expect(created.spaceId).toBe('space_1');
    expect(created.context.lead.id).toBe('contact_1');

    const threshold = runWorkflowsForEventMock.mock.calls.find(
      (c) => (c[0] as { triggerType: string }).triggerType === 'lead_score_threshold',
    )![0] as { context: { lead: Record<string, unknown> } };
    // The scored value (85) is on the lead row for a score>=N condition to gate on.
    expect(threshold.context.lead.leadScore).toBe(85);
  });

  it('still returns 201 when the workflow dispatch throws', async () => {
    queueSuccessfulInsert();
    runWorkflowsForEventMock.mockRejectedValue(new Error('workflow boom'));

    const res = await POST(makeReq(goodBody));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
  });

  it('skips lead_score_threshold when no numeric score is present', async () => {
    const { scoreLeadApplicationDynamic } = await import('@/lib/lead-scoring');
    (scoreLeadApplicationDynamic as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      scoringStatus: 'failed',
      leadScore: null,
      scoreLabel: 'unscored',
      scoreSummary: 'n/a',
      scoreDetails: null,
    });
    queueSuccessfulInsert();

    const res = await POST(makeReq(goodBody));
    expect(res.status).toBe(201);

    const types = runWorkflowsForEventMock.mock.calls.map(
      (c) => (c[0] as { triggerType: string }).triggerType,
    );
    expect(types).toContain('lead_created');
    expect(types).not.toContain('lead_score_threshold');
  });
});
