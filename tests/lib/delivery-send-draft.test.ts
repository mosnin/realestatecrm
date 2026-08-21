/**
 * sendDraft routes an approved draft to a channel and must never "pretend we
 * sent": a note short-circuits to sent; an unconfigured email/SMS provider
 * returns not_configured (config gap) rather than a false success; and a
 * configured provider with no recipient address returns a clear error before
 * any network call. Pin those guard branches (no provider env, null
 * recipients -> no real send).
 */

import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from 'vitest';
import { sendDraft, type ContactPayload } from '@/lib/delivery';

const ENV_KEYS = ['RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'FROM_EMAIL', 'TELNYX_API_KEY', 'TELNYX_FROM_NUMBER'] as const;
const saved: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) saved[k] = process.env[k];

beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});
afterAll(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const noContact: ContactPayload = { name: 'X', email: null, phone: null };

describe('sendDraft', () => {
  it('marks a note as sent immediately (internal, no external delivery)', async () => {
    const r = await sendDraft({ channel: 'note', subject: null, content: 'hi' }, noContact, 'Space');
    expect(r).toEqual({ sent: true, method: 'note' });
  });

  it('email with no provider configured returns not_configured, not a false success', async () => {
    const r = await sendDraft(
      { channel: 'email', subject: 'Hi', content: 'body' },
      { name: 'X', email: 'a@b.com', phone: null },
      'Space',
    );
    expect(r).toEqual({ sent: false, method: 'email', error: 'not_configured' });
  });

  it('sms with no provider configured returns not_configured', async () => {
    const r = await sendDraft(
      { channel: 'sms', subject: null, content: 'body' },
      { name: 'X', email: null, phone: '+15555550123' },
      'Space',
    );
    expect(r).toEqual({ sent: false, method: 'sms', error: 'not_configured' });
  });

  it('configured email but no recipient address fails clearly before sending', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM_EMAIL = 'noreply@example.com';
    const r = await sendDraft({ channel: 'email', subject: 'Hi', content: 'b' }, noContact, 'Space');
    expect(r).toEqual({ sent: false, method: 'email', error: 'Contact has no email address' });
  });

  it('configured sms but no recipient phone fails clearly before sending', async () => {
    process.env.TELNYX_API_KEY = 'KEY';
    process.env.TELNYX_FROM_NUMBER = '+15555550000';
    const r = await sendDraft({ channel: 'sms', subject: null, content: 'b' }, noContact, 'Space');
    expect(r).toEqual({ sent: false, method: 'sms', error: 'Contact has no phone number' });
  });
});

describe('sendDraft SMS E.164', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    process.env.TELNYX_API_KEY = 'KEY';
    process.env.TELNYX_FROM_NUMBER = '+15555550000';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalizes a formatted US number before calling Telnyx', async () => {
    const r = await sendDraft(
      { channel: 'sms', subject: null, content: 'Tour tomorrow?' },
      { name: 'Sam', email: null, phone: '(415) 555-0123' },
      'Space',
    );
    expect(r).toEqual({ sent: true, method: 'sms' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body.to).toBe('+14155550123');
    expect(body.text).toBe('Tour tomorrow?');
  });

  it('does not double-prefix a stored leading-1 NANP number', async () => {
    const r = await sendDraft(
      { channel: 'sms', subject: null, content: 'hi' },
      { name: 'Sam', email: null, phone: '14155550123' },
      'Space',
    );
    expect(r.sent).toBe(true);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body.to).toBe('+14155550123');
  });

  it('rejects an unusable phone before any network call', async () => {
    const r = await sendDraft(
      { channel: 'sms', subject: null, content: 'hi' },
      { name: 'Sam', email: null, phone: '123' },
      'Space',
    );
    expect(r).toEqual({ sent: false, method: 'sms', error: 'Contact phone is not a valid number' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
