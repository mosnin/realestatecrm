/**
 * Behavioral tests for POST /api/contacts/[id]/email — the CRM Send button.
 * Asserts send-as-realtor (sendDraft + clerk userId), compliance holds, and
 * honest failures. No source-text contracts.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { sendDraftMock, checkSendAllowedMock, recordOutboundMock } = vi.hoisted(() => ({
  sendDraftMock: vi.fn(),
  checkSendAllowedMock: vi.fn(),
  recordOutboundMock: vi.fn(async () => ({ threadId: 't1', messageId: 'm1', deduped: false })),
}));

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(async () => ({ userId: 'clerk_1' })),
}));
vi.mock('@/lib/space', () => ({
  getSpaceForUser: vi.fn(async () => ({ id: 'space_1', slug: 'acme', name: 'Acme Realty', ownerId: 'u1' })),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));
vi.mock('@/lib/delivery', () => ({
  sendDraft: sendDraftMock,
  describeDelivery: () => 'from your Gmail',
}));
vi.mock('@/lib/messaging/compliance', () => ({ checkSendAllowed: checkSendAllowedMock }));
vi.mock('@/lib/inbox', () => ({ recordOutboundMessageSafe: recordOutboundMock }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

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
    const next = (): Promise<Terminal> => Promise.resolve(q.shift() ?? { data: null, error: null });
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.limit = vi.fn(() => chain);
    chain.update = vi.fn(() => chain);
    chain.insert = vi.fn(() => chain);
    chain.then = (resolve: (v: Terminal) => unknown, reject?: (e: unknown) => unknown) =>
      next().then(resolve, reject);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

import { POST } from '@/app/api/contacts/[id]/email/route';

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/contacts/c1/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const ctx = { params: Promise.resolve({ id: 'c1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(queues)) delete queues[k];
  sendDraftMock.mockResolvedValue({ sent: true, method: 'gmail' });
  checkSendAllowedMock.mockResolvedValue({ allowed: true });
});

function queueHappyLookups() {
  queueFor('Contact').push({
    data: [{ spaceId: 'space_1', name: 'Jane', email: 'jane@example.com' }],
    error: null,
  });
  queueFor('User').push({ data: [{ email: 'realtor@acme.test', name: 'Pat' }], error: null });
}

describe('POST /api/contacts/[id]/email', () => {
  it('sends as the realtor via sendDraft and reports the inbox method', async () => {
    queueHappyLookups();

    const res = await POST(makeReq({ subject: 'Hello', body: 'Thanks for applying.' }), ctx);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; method: string; via: string };
    expect(json.success).toBe(true);
    expect(json.method).toBe('gmail');
    expect(json.via).toContain('Gmail');

    expect(sendDraftMock).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'email', subject: 'Hello', content: 'Thanks for applying.' }),
      expect.objectContaining({ email: 'jane@example.com' }),
      'Pat',
      { spaceId: 'space_1', userId: 'clerk_1' },
    );
    expect(recordOutboundMock).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: 'space_1',
        contactId: 'c1',
        channel: 'email',
        metadata: expect.objectContaining({ source: 'contacts_email', method: 'gmail' }),
      }),
      expect.objectContaining({ route: 'contacts/[id]/email' }),
    );
  });

  it('returns 403 with Blocked because when compliance holds', async () => {
    queueHappyLookups();
    checkSendAllowedMock.mockResolvedValue({
      allowed: false,
      reason: 'suppressed',
      detail: 'Recipient opted out of messages from this workspace.',
    });

    const res = await POST(makeReq({ subject: 'Hello', body: 'Hi' }), ctx);
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/Blocked because/);
    expect(sendDraftMock).not.toHaveBeenCalled();
  });

  it('returns 502 and does not claim success when delivery fails', async () => {
    queueHappyLookups();
    sendDraftMock.mockResolvedValue({ sent: false, method: 'email', error: 'not_configured' });

    const res = await POST(makeReq({ subject: 'Hello', body: 'Hi' }), ctx);
    expect(res.status).toBe(502);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/not_configured/);
    expect(recordOutboundMock).not.toHaveBeenCalled();
  });
});
