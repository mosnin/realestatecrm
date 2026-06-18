/**
 * Delivery fallback — when the realtor's connected-inbox send fails, a
 * human-approved transactional email must NOT be dropped. lib/delivery.ts
 * falls back to the shared Resend sender (best-effort, well-logged) and
 * records that it did so via { fallback, primaryError } while `method`
 * reflects the path that actually delivered.
 *
 * What these tests pin:
 *   - inbox send THROWS               → Resend fallback fires, sent:true,
 *                                       method:'email', fallback:true, primaryError set
 *   - inbox send returns not-successful → same fallback behavior
 *   - inbox + Resend BOTH fail        → sent:false, error names both failures
 *   - inbox fails + Resend unconfigured → sent:false, 'not_configured' preserved
 *   - no connected inbox + Resend ok  → first-choice Resend, NO fallback flag
 *     (the not-configured-vs-failed distinction stays intact)
 *   - inbox send SUCCEEDS             → returns method:'gmail', Resend untouched
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── IntegrationConnection lookup mock (activeInboxToolkit) ──────────────────
// activeInboxToolkit does: from('IntegrationConnection').select('toolkit')
//   .eq(...).eq(...).eq(...).in('toolkit', [...]) → awaited as { data, error }.
let inboxRows: Array<{ toolkit: string }> = [];
let inboxLookupError: { message: string } | null = null;

vi.mock('@/lib/supabase', () => {
  function makeChain() {
    const result = Promise.resolve({
      data: inboxLookupError ? null : inboxRows,
      error: inboxLookupError,
    });
    const chain: Record<string, unknown> = {};
    const pass = () => chain;
    chain.select = vi.fn(pass);
    chain.eq = vi.fn(pass);
    chain.in = vi.fn(() => result);
    chain.then = (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) => result.then(r, e);
    return chain;
  }
  return { supabase: { from: vi.fn(() => makeChain()) } };
});

// ── Composio mock ───────────────────────────────────────────────────────────
const { composioConfiguredMock, executeToolForEntityMock } = vi.hoisted(() => ({
  composioConfiguredMock: vi.fn(() => true),
  executeToolForEntityMock: vi.fn(async () => ({ successful: true })),
}));
vi.mock('@/lib/integrations/composio', () => ({
  composioConfigured: composioConfiguredMock,
  executeToolForEntity: executeToolForEntityMock,
}));

// ── Logger mock ─────────────────────────────────────────────────────────────
const { loggerMock } = vi.hoisted(() => ({
  loggerMock: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/logger', () => ({ logger: loggerMock }));

// ── Resend mock ─────────────────────────────────────────────────────────────
// delivery.ts imports `import { Resend } from 'resend'` and calls
// `new Resend(key).emails.send(...)`. Mock the class so `send` is observable.
const { resendSendMock } = vi.hoisted(() => ({
  resendSendMock: vi.fn(async () => ({ data: { id: 're_1' }, error: null })),
}));
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({ emails: { send: resendSendMock } })),
}));

import { sendDraft } from '@/lib/delivery';
import type { DraftPayload, ContactPayload } from '@/lib/delivery';

const draft: DraftPayload = { channel: 'email', subject: 'Hello', content: 'Body text.' };
const contact: ContactPayload = { name: 'Sam Buyer', email: 'sam@example.com', phone: null };
const OPTS = { spaceId: 's_1', userId: 'u_1' };

beforeEach(() => {
  inboxRows = [];
  inboxLookupError = null;
  composioConfiguredMock.mockReset().mockReturnValue(true);
  executeToolForEntityMock.mockReset().mockResolvedValue({ successful: true });
  resendSendMock.mockReset().mockResolvedValue({ data: { id: 're_1' }, error: null });
  loggerMock.error.mockClear();
  loggerMock.warn.mockClear();
  loggerMock.info.mockClear();
  // Shared sender fully configured by default.
  process.env.RESEND_API_KEY = 'test-resend-key';
  process.env.RESEND_FROM_EMAIL = 'notifications@chippi.test';
  delete process.env.FROM_EMAIL;
});

describe('sendDraft — inbox primary path succeeds (no fallback)', () => {
  it('returns method:gmail and never touches Resend', async () => {
    inboxRows = [{ toolkit: 'gmail' }];
    executeToolForEntityMock.mockResolvedValueOnce({ successful: true });

    const res = await sendDraft(draft, contact, 'Jane Realty', OPTS);

    expect(res.sent).toBe(true);
    expect(res.method).toBe('gmail');
    expect(res.fallback).toBeUndefined();
    expect(resendSendMock).not.toHaveBeenCalled();
  });
});

describe('sendDraft — inbox throws → Resend fallback fires', () => {
  it('falls back to Resend and reports sent:true via the fallback path', async () => {
    inboxRows = [{ toolkit: 'gmail' }];
    executeToolForEntityMock.mockRejectedValueOnce(new Error('Composio 503 upstream'));

    const res = await sendDraft(draft, contact, 'Jane Realty', OPTS);

    expect(res.sent).toBe(true);
    // method reflects the path that actually delivered (shared Resend sender).
    expect(res.method).toBe('email');
    expect(res.fallback).toBe(true);
    expect(res.primaryError).toContain('Composio 503 upstream');
    expect(resendSendMock).toHaveBeenCalledTimes(1);
    // The recipient and content were preserved into the fallback send.
    expect((resendSendMock.mock.calls[0] as unknown[])[0]).toMatchObject({
      to: 'sam@example.com',
      subject: 'Hello',
      text: 'Body text.',
    });
  });
});

describe('sendDraft — inbox returns not-successful → Resend fallback fires', () => {
  it('treats a not-successful inbox response as a failure and falls back', async () => {
    inboxRows = [{ toolkit: 'outlook' }];
    executeToolForEntityMock.mockResolvedValueOnce({
      successful: false,
      error: 'OUTLOOK_TOKEN_EXPIRED',
    } as never);

    const res = await sendDraft(draft, contact, 'Jane Realty', OPTS);

    expect(res.sent).toBe(true);
    expect(res.method).toBe('email');
    expect(res.fallback).toBe(true);
    expect(res.primaryError).toBe('OUTLOOK_TOKEN_EXPIRED');
    expect(resendSendMock).toHaveBeenCalledTimes(1);
  });
});

describe('sendDraft — both paths fail', () => {
  it('returns sent:false with an error naming BOTH the inbox and Resend failures', async () => {
    inboxRows = [{ toolkit: 'gmail' }];
    executeToolForEntityMock.mockRejectedValueOnce(new Error('Composio 503 upstream'));
    resendSendMock.mockResolvedValueOnce({
      data: null,
      error: { name: 'rate_limit', message: 'Resend quota exhausted' },
    } as never);

    const res = await sendDraft(draft, contact, 'Jane Realty', OPTS);

    expect(res.sent).toBe(false);
    expect(res.method).toBe('email');
    expect(res.fallback).toBe(true);
    expect(res.primaryError).toContain('Composio 503 upstream');
    // Combined error mentions both legs so the realtor sees the full story.
    expect(res.error).toContain('Composio 503 upstream');
    expect(res.error).toContain('Resend quota exhausted');
    expect(loggerMock.error).toHaveBeenCalled();
  });

  it('preserves the not_configured marker when the fallback sender is unconfigured', async () => {
    delete process.env.RESEND_API_KEY; // shared sender not set up
    inboxRows = [{ toolkit: 'gmail' }];
    executeToolForEntityMock.mockRejectedValueOnce(new Error('Composio 503 upstream'));

    const res = await sendDraft(draft, contact, 'Jane Realty', OPTS);

    expect(res.sent).toBe(false);
    expect(res.error).toContain('not_configured');
    expect(res.error).toContain('Composio 503 upstream');
    // We never attempted a Resend send when the key was missing.
    expect(resendSendMock).not.toHaveBeenCalled();
  });
});

describe('sendDraft — not-configured-vs-failed distinction intact', () => {
  it('uses Resend as the FIRST choice (no fallback flag) when no inbox is connected', async () => {
    inboxRows = []; // no active gmail/outlook connection

    const res = await sendDraft(draft, contact, 'Jane Realty', OPTS);

    expect(res.sent).toBe(true);
    expect(res.method).toBe('email');
    // Not a fallback — Resend was the primary path here.
    expect(res.fallback).toBeUndefined();
    expect(res.primaryError).toBeUndefined();
    // Inbox send was never attempted (no toolkit).
    expect(executeToolForEntityMock).not.toHaveBeenCalled();
    expect(resendSendMock).toHaveBeenCalledTimes(1);
  });

  it('returns plain not_configured (no fallback metadata) when neither inbox nor Resend is set up', async () => {
    delete process.env.RESEND_API_KEY;
    inboxRows = []; // no inbox either

    const res = await sendDraft(draft, contact, 'Jane Realty', OPTS);

    expect(res.sent).toBe(false);
    expect(res.method).toBe('email');
    expect(res.error).toBe('not_configured');
    expect(res.fallback).toBeUndefined();
  });
});
