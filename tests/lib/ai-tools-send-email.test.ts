import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock supabase chain + email delivery + logger ──────────────────────────
let mockByTable: Record<
  string,
  { rows?: Array<Record<string, unknown>>; error?: { message: string } | null; single?: Record<string, unknown> | null }
> = {};

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const override = mockByTable[table];
    const rows = override?.rows ?? [];
    const error = override?.error ?? null;
    const single = override?.single;

    const termThen = Promise.resolve({ data: rows, error });
    const singleThen = Promise.resolve({ data: single ?? rows[0] ?? null, error });

    const chain: Record<string, unknown> = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      is: vi.fn(() => chain),
      insert: vi.fn(() => ({
        ...chain,
        then: (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) => termThen.then(r, e),
        catch: (e: (x: unknown) => unknown) => termThen.catch(e),
      })),
      maybeSingle: vi.fn(() => singleThen),
      abortSignal: vi.fn(() => termThen),
      then: (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) => termThen.then(r, e),
    };
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

const { sendEmailFromCRMMock, sendDraftMock, checkSendAllowedMock, recordOutboundMock } = vi.hoisted(() => ({
  sendEmailFromCRMMock: vi.fn(async () => undefined),
  sendDraftMock: vi.fn(),
  checkSendAllowedMock: vi.fn(),
  recordOutboundMock: vi.fn(async () => ({ threadId: 't1', messageId: 'm1', deduped: false })),
}));
vi.mock('@/lib/email', () => ({
  sendEmailFromCRM: sendEmailFromCRMMock,
  ComplianceBlockedError: class ComplianceBlockedError extends Error {
    reason: string;
    durableDisposition = 'terminal_failure' as const;
    constructor(reason: string, detail: string) {
      super(detail);
      this.reason = reason;
      this.name = 'ComplianceBlockedError';
    }
  },
  EmailSendError: class EmailSendError extends Error {
    durableDisposition: string;
    constructor(message: string, _cause?: unknown, durableDisposition = 'retryable') {
      super(message);
      this.name = 'EmailSendError';
      this.durableDisposition = durableDisposition;
    }
  },
}));
vi.mock('@/lib/delivery', () => ({
  sendDraft: sendDraftMock,
  describeDelivery: (r: { method?: string; fallback?: boolean }) =>
    r.method === 'gmail'
      ? 'from your Gmail'
      : r.fallback
        ? "from Chippi's sender (your inbox failed — reconnect to send as yourself)"
        : "from Chippi's sender (connect Gmail or Outlook to send as yourself)",
}));
vi.mock('@/lib/messaging/compliance', () => ({ checkSendAllowed: checkSendAllowedMock }));
vi.mock('@/lib/inbox', () => ({ recordOutboundMessageSafe: recordOutboundMock }));

import { sendEmailTool } from '@/lib/ai-tools/tools/send-email';
import type { ToolContext } from '@/lib/ai-tools/types';

function makeCtx(): ToolContext {
  return {
    userId: 'user_1',
    space: { id: 'space_1', slug: 'jane', name: 'Jane Realty', ownerId: 'u1' },
    signal: new AbortController().signal,
  };
}

beforeEach(() => {
  mockByTable = {};
  sendEmailFromCRMMock.mockClear();
  sendDraftMock.mockClear();
  checkSendAllowedMock.mockClear();
  recordOutboundMock.mockClear();
  sendDraftMock.mockResolvedValue({ sent: true, method: 'gmail' });
  checkSendAllowedMock.mockResolvedValue({ allowed: true });
});

describe('sendEmailTool schema', () => {
  it('requires either contactId or toEmail', () => {
    expect(() =>
      sendEmailTool.parameters.parse({ subject: 's', body: 'b' }),
    ).toThrow();
  });

  it('requires a subject + body', () => {
    expect(() =>
      sendEmailTool.parameters.parse({ toEmail: 'a@b.com', body: 'b' }),
    ).toThrow();
    expect(() =>
      sendEmailTool.parameters.parse({ toEmail: 'a@b.com', subject: 's' }),
    ).toThrow();
  });

  it('rejects malformed email addresses', () => {
    expect(() =>
      sendEmailTool.parameters.parse({ toEmail: 'not-an-email', subject: 's', body: 'b' }),
    ).toThrow();
  });

  it('caps body + subject length', () => {
    expect(() =>
      sendEmailTool.parameters.parse({
        toEmail: 'a@b.com',
        subject: 'x'.repeat(250),
        body: 'b',
      }),
    ).toThrow();
  });

  it('requires approval before the handler runs', () => {
    expect(sendEmailTool.requiresApproval).toBe(true);
  });
});

describe('sendEmailTool handler — contactId path', () => {
  it('sends to the contact\'s email on file', async () => {
    mockByTable = {
      Contact: {
        single: { id: 'c_1', email: 'jane@example.com', name: 'Jane' },
      },
      SpaceSetting: { single: { businessName: 'Jane Realty' } },
    };
    const result = await sendEmailTool.handler(
      {
        contactId: 'c_1',
        subject: 'Tour Friday',
        body: 'Looking forward to it.',
      },
      makeCtx(),
    );

    expect(sendEmailFromCRMMock).not.toHaveBeenCalled();
    expect(sendDraftMock).toHaveBeenCalledTimes(1);
    expect(sendDraftMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'email',
        subject: 'Tour Friday',
        content: 'Looking forward to it.',
      }),
      expect.objectContaining({ email: 'jane@example.com' }),
      'Jane Realty',
      { spaceId: 'space_1', userId: 'user_1' },
    );
    expect(result.summary).toContain('jane@example.com');
    expect(result.summary).toContain('from your Gmail');
    expect(result.display).toBe('success');
    expect((result.data as { contactId: string; method: string }).contactId).toBe('c_1');
    expect((result.data as { method: string }).method).toBe('gmail');
    expect(recordOutboundMock).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: 'space_1',
        contactId: 'c_1',
        channel: 'email',
        metadata: expect.objectContaining({ source: 'send_email', method: 'gmail' }),
      }),
      expect.objectContaining({ route: 'tools.send_email' }),
    );
  });

  it('refuses to send when the contact has no email', async () => {
    mockByTable = {
      Contact: {
        single: { id: 'c_2', email: null, name: 'Phoneless' },
      },
    };
    const result = await sendEmailTool.handler(
      { contactId: 'c_2', subject: 'Hi', body: 'Hi.' },
      makeCtx(),
    );
    expect(sendEmailFromCRMMock).not.toHaveBeenCalled();
    expect(sendDraftMock).not.toHaveBeenCalled();
    expect(result.summary).toMatch(/no email on file/);
    expect(result.display).toBe('error');
  });

  it('refuses when contactId does not exist in this space', async () => {
    mockByTable = { Contact: { single: null } };
    const result = await sendEmailTool.handler(
      { contactId: 'bogus', subject: 'Hi', body: 'Hi.' },
      makeCtx(),
    );
    expect(sendEmailFromCRMMock).not.toHaveBeenCalled();
    expect(sendDraftMock).not.toHaveBeenCalled();
    expect(result.summary).toMatch(/No contact with id/);
    expect(result.display).toBe('error');
  });
});

describe('sendEmailTool handler — toEmail path', () => {
  it('sends to a bare address even without a matching contact', async () => {
    mockByTable = {
      Contact: { single: null },
      SpaceSetting: { single: { businessName: 'Jane Realty' } },
    };
    const result = await sendEmailTool.handler(
      { toEmail: 'stranger@elsewhere.com', subject: 'Hi', body: 'Hi.' },
      makeCtx(),
    );
    expect(sendEmailFromCRMMock).not.toHaveBeenCalled();
    expect(sendDraftMock).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Hi.' }),
      expect.objectContaining({ email: 'stranger@elsewhere.com' }),
      'Jane Realty',
      { spaceId: 'space_1', userId: 'user_1' },
    );
    expect(result.display).toBe('success');
    expect((result.data as { contactId: string | null }).contactId).toBeNull();
  });
});

describe('sendEmailTool handler — idempotency key', () => {
  // The in-memory dedup store (no Redis configured under test) persists across
  // calls within the process, which is exactly the surface these tests exercise.
  // Each test uses a unique subject so it can't collide with sibling tests.

  it('sends BOTH of two same-subject emails with DIFFERENT bodies to the same recipient', async () => {
    mockByTable = {
      Contact: { single: null },
      SpaceSetting: { single: { businessName: 'Jane Realty' } },
    };
    const recipient = 'samesubject@example.com';
    const subject = 'Following up [diff-body]';

    const first = await sendEmailTool.handler(
      { toEmail: recipient, subject, body: 'Just checking in after the tour.' },
      makeCtx(),
    );
    const second = await sendEmailTool.handler(
      { toEmail: recipient, subject, body: 'Wanted to add the financing details too.' },
      makeCtx(),
    );

    // Different bodies must NOT be deduped — both go out.
    expect(sendDraftMock).toHaveBeenCalledTimes(2);
    expect(first.display).toBe('success');
    expect(second.display).toBe('success');
  });

  it('dedupes an identical retry (same recipient + subject + body) to a single send', async () => {
    mockByTable = {
      Contact: { single: null },
      SpaceSetting: { single: { businessName: 'Jane Realty' } },
    };
    const args = {
      toEmail: 'retry@example.com',
      subject: 'Following up [retry]',
      body: 'Same exact message body.',
    };

    const first = await sendEmailTool.handler(args, makeCtx());
    const second = await sendEmailTool.handler(args, makeCtx());

    // True retry of an identical message must collapse to one delivery.
    expect(sendDraftMock).toHaveBeenCalledTimes(1);
    expect(first.display).toBe('success');
    expect(second.display).toBe('success');
  });

  it('uses and forwards the durable action key instead of deriving it from message content', async () => {
    mockByTable = {
      Contact: { single: null },
      SpaceSetting: { single: { businessName: 'Jane Realty' } },
    };
    const ctx = makeCtx();
    ctx.executionIdempotencyKey = 'work-session-action-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    await sendEmailTool.handler(
      { toEmail: 'durable@example.com', subject: 'First content', body: 'First body.' },
      ctx,
    );
    await sendEmailTool.handler(
      { toEmail: 'durable@example.com', subject: 'Changed content', body: 'Changed body.' },
      ctx,
    );

    expect(sendDraftMock).toHaveBeenCalledTimes(1);
  });
});

describe('sendEmailTool handler — errors', () => {
  it('surfaces a delivery failure without throwing', async () => {
    mockByTable = {
      Contact: { single: null },
      SpaceSetting: { single: null },
    };
    sendDraftMock.mockResolvedValueOnce({ sent: false, method: 'email', error: 'Resend quota exhausted' });

    const result = await sendEmailTool.handler(
      { toEmail: 'a@b.com', subject: 'Hi', body: 'Hi.' },
      makeCtx(),
    );
    expect(result.summary).toMatch(/Send failed.*Resend quota exhausted/);
    expect(result.display).toBe('error');
  });

  it('throws a durable delivery failure so the leased executor can retry it', async () => {
    mockByTable = {
      Contact: { single: null },
      SpaceSetting: { single: null },
    };
    sendDraftMock.mockResolvedValueOnce({ sent: false, method: 'email', error: 'Resend temporarily unavailable' });
    const ctx = makeCtx();
    ctx.executionIdempotencyKey = 'work-session-action-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

    await expect(sendEmailTool.handler(
      { toEmail: 'durable-error@example.com', subject: 'Hi', body: 'Hi.' },
      ctx,
    )).rejects.toThrow(/Resend temporarily unavailable/);
  });

  it('returns a typed terminal receipt instead of retrying a known provider rejection', async () => {
    mockByTable = {
      Contact: { single: null },
      SpaceSetting: { single: null },
    };
    sendDraftMock.mockRejectedValueOnce(Object.assign(
      new Error('same key used with changed payload'),
      { durableDisposition: 'reconciliation_required' },
    ));
    const ctx = makeCtx();
    ctx.executionIdempotencyKey = 'work-session-action-cccccccccccccccccccccccccccccccc';

    await expect(sendEmailTool.handler(
      { toEmail: 'durable-conflict@example.com', subject: 'Hi', body: 'Hi.' },
      ctx,
    )).resolves.toMatchObject({
      display: 'error',
      durableExecutionDisposition: 'reconciliation_required',
    });
  });

  it('names a compliance hold instead of claiming a send', async () => {
    mockByTable = {
      Contact: { single: null },
      SpaceSetting: { single: { businessName: 'Jane Realty' } },
    };
    checkSendAllowedMock.mockResolvedValue({
      allowed: false,
      reason: 'quiet_hours',
      detail: 'Outside the 8:00-21:00 window in America/New_York.',
    });

    const result = await sendEmailTool.handler(
      { toEmail: 'night@example.com', subject: 'Hi', body: 'Hi.' },
      makeCtx(),
    );

    expect(sendDraftMock).not.toHaveBeenCalled();
    expect(result.display).toBe('error');
    expect(result.summary).toMatch(/Blocked because quiet hours/);
    expect(result.summary).toContain('Outside the 8:00-21:00 window');
  });

  it('labels a platform-sender fallback instead of claiming inbox send', async () => {
    mockByTable = {
      Contact: { single: { id: 'c_1', email: 'jane@example.com', name: 'Jane' } },
      SpaceSetting: { single: { businessName: 'Jane Realty' } },
    };
    sendDraftMock.mockResolvedValueOnce({
      sent: true,
      method: 'email',
      fallback: true,
      primaryError: 'inbox_send_failed',
    });

    const result = await sendEmailTool.handler(
      { contactId: 'c_1', subject: 'Hi', body: 'Hi.' },
      makeCtx(),
    );

    expect(result.display).toBe('success');
    expect(result.summary).toContain("Chippi's sender");
    expect((result.data as { fallback?: boolean }).fallback).toBe(true);
  });
});
