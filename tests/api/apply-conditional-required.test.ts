/**
 * Route-level test for POST /api/public/apply — conditional "required"
 * enforcement.
 *
 * The contract under test (BUG: conditional required questions silently
 * skipped):
 *   - A required question whose visibleWhen condition IS met but whose answer
 *     is empty/missing MUST block the submission (400). It is not "hidden", so
 *     it is not optional.
 *   - The SAME required question whose visibleWhen condition is NOT met (truly
 *     hidden) MUST NOT block the submission — the client never shows it, so the
 *     server must not demand it. A valid submission succeeds (201).
 *
 * The validation lives inline in the route (buildDynamicSchemaForSubmission),
 * so we drive it through the real POST handler with all I/O dependencies
 * mocked. Supabase is a per-table queue mirroring tests/api/contacts-merge.ts.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { IntakeFormConfig } from '@/lib/types';

// ── Mocks for all non-DB side effects ────────────────────────────────────────
vi.mock('@/lib/redis', () => ({
  redis: { set: vi.fn(async () => 'OK') },
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
  getClientIp: vi.fn(() => '127.0.0.1'),
}));
vi.mock('@/lib/lead-scoring', () => ({
  scoreLeadApplicationDynamic: vi.fn(async () => ({
    scoringStatus: 'scored',
    leadScore: 50,
    scoreLabel: 'warm',
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

// The route resolves the form config via getFormConfigs (form-builder).
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

// ── A form config with a conditional REQUIRED field ──────────────────────────
// "hasPets" (radio yes/no) gates "petDetails" (required text). When hasPets is
// 'yes', petDetails is shown AND required. When 'no', petDetails is hidden.
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
    {
      id: 'sec_pets',
      title: 'Pets',
      position: 1,
      questions: [
        {
          id: 'hasPets',
          type: 'radio',
          label: 'Do you have pets?',
          required: true,
          position: 0,
          options: [
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
          ],
        },
        {
          id: 'petDetails',
          type: 'text',
          label: 'Tell us about your pets',
          required: true,
          position: 1,
          visibleWhen: { questionId: 'hasPets', operator: 'equals', value: 'yes' },
        },
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

// Queue the supabase terminals for a full successful insert flow. Order matches
// the route: SpaceSetting(settings) → Contact(insert) → ApplicationStatusUpdate(insert)
// → Contact(update scoring). Contact dedupe selects also pull from the Contact
// queue (we keep them empty → no dupe).
function queueSuccessfulInsert() {
  // Contact: [emailDedupe(empty), recentDupe(empty), insert(row)]
  queueFor('Contact').push({ data: [], error: null });
  queueFor('Contact').push({ data: [], error: null });
  queueFor('Contact').push({ data: [{ id: 'contact_1' }], error: null });
  queueFor('SpaceSetting').push({
    data: { privacyPolicyUrl: null, businessName: null, intakeConfirmationEmail: null },
    error: null,
  });
  queueFor('ApplicationStatusUpdate').push({ data: null, error: null });
  queueFor('Contact').push({ data: null, error: null }); // scoring update
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(queues)) delete queues[k];
  getFormConfigsMock.mockResolvedValue({ rental: CONFIG, buyer: null, source: 'custom' });
});

describe('POST /api/public/apply — conditional required enforcement', () => {
  it('BLOCKS submission when a required conditional field is shown but empty', async () => {
    // hasPets = 'yes' → petDetails is visible AND required, but omitted.
    const res = await POST(
      makeReq({
        slug: 'acme',
        leadType: 'rental',
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: '(555) 123-4567',
        hasPets: 'yes',
        // petDetails intentionally missing
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; issues?: { path: unknown[] }[] };
    expect(body.error).toBe('Invalid submission data');
    // The failure must be attributable to the conditional field.
    const paths = (body.issues ?? []).flatMap((i) => i.path);
    expect(paths).toContain('petDetails');
  });

  it('ALSO blocks when the shown required conditional field is present but blank', async () => {
    const res = await POST(
      makeReq({
        slug: 'acme',
        leadType: 'rental',
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: '(555) 123-4567',
        hasPets: 'yes',
        petDetails: '   ', // whitespace-only → trimmed empty
      }),
    );
    expect(res.status).toBe(400);
  });

  it('does NOT block when the required conditional field is hidden (condition unmet)', async () => {
    queueSuccessfulInsert();
    // hasPets = 'no' → petDetails is hidden, so its absence must NOT block.
    const res = await POST(
      makeReq({
        slug: 'acme',
        leadType: 'rental',
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: '(555) 123-4567',
        hasPets: 'no',
        // petDetails absent — correct, it's hidden
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
  });

  it('accepts the submission when the shown required conditional field is filled', async () => {
    queueSuccessfulInsert();
    const res = await POST(
      makeReq({
        slug: 'acme',
        leadType: 'rental',
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: '(555) 123-4567',
        hasPets: 'yes',
        petDetails: 'One cat named Mittens',
      }),
    );
    expect(res.status).toBe(201);
  });
});
