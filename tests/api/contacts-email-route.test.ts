/**
 * POST /api/contacts/[id]/email — the contact-page "Send email" dialog.
 *
 * The load-bearing send contract: sendEmailFromCRM is called with spaceId
 * (and contactId). Without spaceId the consumer compliance gate fail-closes
 * and every realtor-composed email 502s.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { sendEmailFromCRMMock } = vi.hoisted(() => ({
  sendEmailFromCRMMock: vi.fn(async () => undefined),
}));

vi.mock('@/lib/email', () => ({
  sendEmailFromCRM: sendEmailFromCRMMock,
  EmailSendError: class EmailSendError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'EmailSendError';
    }
  },
}));
vi.mock('@/lib/api-auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/space', () => ({ getSpaceForUser: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

type Terminal = { data?: unknown; error?: unknown };
const queues: Record<string, Terminal[]> = {};
const updates: Array<{ table: string; values: unknown }> = [];
const inserts: Array<{ table: string; values: unknown }> = [];

function queueFor(table: string) {
  if (!queues[table]) queues[table] = [];
  return queues[table];
}

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const q = queueFor(table);
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.limit = vi.fn(() => chain);
    chain.update = vi.fn((values: unknown) => {
      updates.push({ table, values });
      return chain;
    });
    chain.insert = vi.fn((values: unknown) => {
      inserts.push({ table, values });
      return chain;
    });
    const next = (): Terminal => q.shift() ?? { data: null, error: null };
    chain.maybeSingle = vi.fn(() => Promise.resolve(next()));
    chain.single = vi.fn(() => Promise.resolve(next()));
    chain.then = (resolve: (v: Terminal) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(next()).then(resolve, reject);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

import { POST } from '@/app/api/contacts/[id]/email/route';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

function invoke(contactId: string, body: unknown) {
  const req = new NextRequest(`http://localhost/api/contacts/${contactId}/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST(req, { params: Promise.resolve({ id: contactId }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(queues)) delete queues[k];
  updates.length = 0;
  inserts.length = 0;
  sendEmailFromCRMMock.mockResolvedValue(undefined);
  vi.mocked(requireAuth).mockResolvedValue({ userId: 'user_1' } as never);
  vi.mocked(getSpaceForUser).mockResolvedValue({
    id: 'space_1',
    slug: 'jane',
    name: 'Jane Realty',
  } as never);
});

describe('POST /api/contacts/[id]/email', () => {
  it('sends with the space + contact so the compliance gate can run', async () => {
    queueFor('Contact').push({
      data: [{ spaceId: 'space_1', name: 'Sam', email: 'sam@example.com' }],
      error: null,
    });
    queueFor('User').push({
      data: [{ email: 'jane@realty.test', name: 'Jane' }],
      error: null,
    });
    queueFor('Contact').push({ data: null, error: null }); // lastContactedAt
    queueFor('ContactActivity').push({ data: null, error: null });

    const res = await invoke('contact_1', { subject: 'Hello', body: 'Are you free Thursday?' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    expect(sendEmailFromCRMMock).toHaveBeenCalledTimes(1);
    expect(sendEmailFromCRMMock).toHaveBeenCalledWith(
      expect.objectContaining({
        audience: 'consumer',
        category: 'marketing',
        spaceId: 'space_1',
        contactId: 'contact_1',
        toEmail: 'sam@example.com',
        subject: 'Hello',
        body: 'Are you free Thursday?',
      }),
    );
  });

  it('does not call the transport when the contact has no email', async () => {
    queueFor('Contact').push({
      data: [{ spaceId: 'space_1', name: 'Sam', email: null }],
      error: null,
    });

    const res = await invoke('contact_1', { subject: 'Hello', body: 'Hi' });
    expect(res.status).toBe(400);
    expect(sendEmailFromCRMMock).not.toHaveBeenCalled();
  });

  it('returns 502 when the transport throws — never a false success', async () => {
    queueFor('Contact').push({
      data: [{ spaceId: 'space_1', name: 'Sam', email: 'sam@example.com' }],
      error: null,
    });
    queueFor('User').push({
      data: [{ email: 'jane@realty.test', name: 'Jane' }],
      error: null,
    });
    sendEmailFromCRMMock.mockRejectedValueOnce(new Error('Resend rejected'));

    const res = await invoke('contact_1', { subject: 'Hello', body: 'Hi' });
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: 'Email delivery failed' });
  });
});
