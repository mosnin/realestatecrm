/**
 * POST /api/public/apply when the realtor turns off the bundled contact step.
 *
 * The schema then allows a config without name/email/phone. Submit must still
 * succeed: empty name, null email, and empty phone are OK. Dedup already
 * handles a missing email.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { IntakeFormConfig } from '@/lib/types';

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

const { getFormConfigsMock } = vi.hoisted(() => ({ getFormConfigsMock: vi.fn() }));
vi.mock('@/lib/form-builder', () => ({
  getFormConfigs: getFormConfigsMock,
  getDefaultFormConfig: vi.fn(() => null),
}));

type Terminal = { data?: unknown; error?: unknown };
const queues: Record<string, Terminal[]> = {};
const insertedContacts: Record<string, unknown>[] = [];
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
    chain.insert = vi.fn((row: Record<string, unknown>) => {
      if (table === 'Contact') insertedContacts.push(row);
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

const OFF_CONFIG: IntakeFormConfig = {
  version: 1,
  leadType: 'rental',
  captureContactStep: false,
  sections: [
    {
      id: 'sec_timing',
      title: 'Timing',
      position: 0,
      questions: [
        {
          id: 'when',
          type: 'text',
          label: 'When are you moving?',
          required: true,
          position: 0,
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

function queueSuccessfulInsert(opts: { hasEmail?: boolean } = {}) {
  // Email dedupe only runs when an email is present.
  if (opts.hasEmail) {
    queueFor('Contact').push({ data: [], error: null });
  }
  queueFor('Contact').push({ data: [], error: null }); // recent name+phone window
  queueFor('Contact').push({ data: [{ id: 'contact_1' }], error: null });
  queueFor('SpaceSetting').push({
    data: { privacyPolicyUrl: null, businessName: null, intakeConfirmationEmail: null },
    error: null,
  });
  queueFor('ApplicationStatusUpdate').push({ data: null, error: null });
  queueFor('Contact').push({ data: null, error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(queues)) delete queues[k];
  insertedContacts.length = 0;
  getFormConfigsMock.mockResolvedValue({ rental: OFF_CONFIG, buyer: null, source: 'custom' });
});

describe('POST /api/public/apply — contact step off', () => {
  it('accepts a submission with no name, email, or phone', async () => {
    queueSuccessfulInsert({ hasEmail: false });
    const res = await POST(
      makeReq({
        slug: 'acme',
        leadType: 'rental',
        when: 'ASAP',
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
    expect(insertedContacts).toHaveLength(1);
    expect(insertedContacts[0].name).toBe('');
    expect(insertedContacts[0].email).toBeNull();
    expect(insertedContacts[0].phone).toBe('');
  });

  it('still maps name/email/phone when those ids are present', async () => {
    queueSuccessfulInsert({ hasEmail: true });
    const res = await POST(
      makeReq({
        slug: 'acme',
        leadType: 'rental',
        when: 'ASAP',
        name: 'Alex Johnson',
        email: 'alex@example.com',
        phone: '(555) 123-4567',
      }),
    );
    expect(res.status).toBe(201);
    expect(insertedContacts).toHaveLength(1);
    expect(insertedContacts[0].name).toBe('Alex Johnson');
    expect(insertedContacts[0].email).toBe('alex@example.com');
    expect(insertedContacts[0].phone).toBe('(555) 123-4567');
  });
});
