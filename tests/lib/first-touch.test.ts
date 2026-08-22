/**
 * Behavioral tests for lib/leads/first-touch.ts — the Instant First Touch
 * engine. Executes fireFirstTouch with mocked collaborators and asserts on
 * outcomes and side effects (draft insert payloads, sendDraft calls, push
 * payloads), never on source text.
 *
 * Contract under test:
 *   - Happy inbound path creates a pending AgentDraft, then sendDraft, then
 *     marks sent, records outbound, and notifies "first touch sent".
 *   - autoFirstTouchSend === false keeps the draft pending and says "ready".
 *   - Compliance block / send failure leave the draft pending with an honest
 *     hold notification — never a fake success.
 *   - inbound → transactional; manual (and omitted origin) → marketing.
 *   - Channel choice, dedupe, daily cap, premium gate, compose fallback,
 *     never-reject — same as before.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  checkRateLimitMock,
  sendPushMock,
  composeMock,
  createAppNotificationMock,
  sendDraftMock,
  checkSendAllowedMock,
  recordOutboundMessageSafeMock,
  advanceDealFromEventMock,
} = vi.hoisted(() => ({
  checkRateLimitMock: vi.fn(async () => ({ allowed: true })),
  sendPushMock: vi.fn(async () => 1),
  composeMock: vi.fn(
    async (): Promise<{ subject: string | null; body: string; subjectLabel: string } | null> => ({
      subject: 'Quick hello',
      body: 'Thanks for your note about renting. What timing works for a call?',
      subjectLabel: 'Jane Doe',
    }),
  ),
  createAppNotificationMock: vi.fn(async () => true),
  sendDraftMock: vi.fn(
    async (): Promise<{
      sent: boolean;
      method: string;
      error?: string;
      fallback?: boolean;
      primaryError?: string;
    }> => ({ sent: true, method: 'gmail' }),
  ),
  checkSendAllowedMock: vi.fn(
    async (): Promise<{ allowed: boolean; reason?: string; detail?: string }> => ({ allowed: true }),
  ),
  recordOutboundMessageSafeMock: vi.fn(async () => ({ threadId: 't1', messageId: 'm1', deduped: false })),
  advanceDealFromEventMock: vi.fn(async () => ({ ok: true, dealId: 'deal_1', created: true, moved: false })),
}));

vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: checkRateLimitMock }));
vi.mock('@/lib/push', () => ({ sendPushToSpace: sendPushMock }));
vi.mock('@/lib/notifications', () => ({ createAppNotification: createAppNotificationMock }));
vi.mock('@/lib/agent/quick-draft', () => ({ composeQuickDraft: composeMock }));
vi.mock('@/lib/delivery', () => ({
  sendDraft: sendDraftMock,
  describeDelivery: (r: { method?: string; fallback?: boolean }) =>
    r.method === 'gmail'
      ? 'from your Gmail'
      : r.method === 'outlook'
        ? 'from your Outlook'
        : r.method === 'sms'
          ? 'by text'
          : r.fallback
            ? "from Chippi's sender (your inbox failed — reconnect to send as yourself)"
            : "from Chippi's sender (connect Gmail or Outlook to send as yourself)",
}));
vi.mock('@/lib/messaging/compliance', () => ({ checkSendAllowed: checkSendAllowedMock }));
vi.mock('@/lib/inbox', () => ({ recordOutboundMessageSafe: recordOutboundMessageSafeMock }));
vi.mock('@/lib/deals/advance-from-event', () => ({ advanceDealFromEvent: advanceDealFromEventMock }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

type Terminal = { data?: unknown; error?: unknown; reject?: unknown };
const queues: Record<string, Terminal[]> = {};
const inserts: Array<{ table: string; values: Record<string, unknown> }> = [];
const updates: Array<{ table: string; values: Record<string, unknown> }> = [];

function queueFor(table: string): Terminal[] {
  if (!queues[table]) queues[table] = [];
  return queues[table];
}

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const q = queueFor(table);
    const chain: Record<string, unknown> = {};
    const next = (): Promise<Terminal> => {
      const t = q.shift() ?? { data: null, error: null };
      if (t.reject) return Promise.reject(t.reject);
      return Promise.resolve(t);
    };
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.limit = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.insert = vi.fn((values: Record<string, unknown>) => {
      inserts.push({ table, values });
      return chain;
    });
    chain.update = vi.fn((values: Record<string, unknown>) => {
      updates.push({ table, values });
      return chain;
    });
    chain.maybeSingle = vi.fn(() => next());
    chain.single = vi.fn(() => next());
    chain.then = (resolve: (v: Terminal) => unknown, reject?: (e: unknown) => unknown) =>
      next().then(resolve, reject);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

import { fireFirstTouch, FIRST_TOUCH_REASONING } from '@/lib/leads/first-touch';

const FUTURE = new Date(Date.now() + 30 * 86_400_000).toISOString();

function queueSpace(overrides: Record<string, unknown> = {}) {
  queueFor('Space').push({
    data: {
      id: 'space_1',
      slug: 'acme',
      name: 'Acme Realty',
      ownerId: 'user_1',
      stripeSubscriptionStatus: 'active',
      stripePeriodEnd: FUTURE,
      ...overrides,
    },
    error: null,
  });
}

function queueContact(overrides: Record<string, unknown> = {}) {
  queueFor('Contact').push({
    data: {
      id: 'c_1',
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '+15551234567',
      ...overrides,
    },
    error: null,
  });
}

function queueNoExistingDraft() {
  queueFor('AgentDraft').push({ data: null, error: null });
}

function queueInsertOk() {
  queueFor('AgentDraft').push({ data: { id: 'draft_1' }, error: null });
}

/** Setting on (or missing row) + owner clerkId + draft status update. */
function queueAutoSendLookups(setting: { autoFirstTouchSend?: boolean } | null = { autoFirstTouchSend: true }) {
  queueFor('SpaceSetting').push({ data: setting, error: null });
  queueFor('User').push({ data: { clerkId: 'clerk_owner' }, error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(queues)) delete queues[k];
  inserts.length = 0;
  updates.length = 0;
  checkRateLimitMock.mockResolvedValue({ allowed: true });
  composeMock.mockResolvedValue({
    subject: 'Quick hello',
    body: 'Thanks for your note about renting. What timing works for a call?',
    subjectLabel: 'Jane Doe',
  });
  sendDraftMock.mockResolvedValue({ sent: true, method: 'gmail' });
  checkSendAllowedMock.mockResolvedValue({ allowed: true });
  advanceDealFromEventMock.mockClear();
});

describe('fireFirstTouch', () => {
  it('inbound happy path: creates a draft, sends it, and notifies sent', async () => {
    queueSpace();
    queueContact();
    queueNoExistingDraft();
    queueInsertOk();
    queueAutoSendLookups();

    const outcome = await fireFirstTouch({ spaceId: 'space_1', contactId: 'c_1', origin: 'inbound' });

    expect(outcome).toEqual({
      created: true,
      draftId: 'draft_1',
      sent: true,
      deliveryMethod: 'gmail',
      fallback: undefined,
    });

    const draftInsert = inserts.find((i) => i.table === 'AgentDraft');
    expect(draftInsert).toBeDefined();
    expect(draftInsert!.values.spaceId).toBe('space_1');
    expect(draftInsert!.values.contactId).toBe('c_1');
    expect(draftInsert!.values.status).toBe('pending');
    expect(draftInsert!.values.channel).toBe('email');
    expect(draftInsert!.values.subject).toBe('Quick hello');
    expect(draftInsert!.values.content).toContain('Thanks for your note');
    expect(draftInsert!.values.reasoning).toBe(FIRST_TOUCH_REASONING);
    expect(draftInsert!.values.idempotencyKey).toBe('first-touch:space_1:c_1');
    expect(draftInsert!.values.triggerSource).toEqual({
      kind: 'first_touch',
      contactId: 'c_1',
      origin: 'inbound',
    });

    expect(checkSendAllowedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: 'space_1',
        channel: 'email',
        address: 'jane@example.com',
        audience: 'consumer',
        category: 'transactional',
        contactId: 'c_1',
      }),
    );

    expect(sendDraftMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'email',
        subject: 'Quick hello',
        content: expect.stringContaining('Thanks for your note'),
      }),
      expect.objectContaining({ name: 'Jane Doe', email: 'jane@example.com' }),
      'Acme Realty',
      { spaceId: 'space_1', userId: 'clerk_owner' },
    );

    const draftUpdate = updates.find((u) => u.table === 'AgentDraft');
    expect(draftUpdate?.values.status).toBe('sent');

    expect(recordOutboundMessageSafeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: 'space_1',
        contactId: 'c_1',
        channel: 'email',
        agentDraftId: 'draft_1',
        metadata: expect.objectContaining({ source: 'first_touch', method: 'gmail' }),
      }),
      expect.objectContaining({ route: 'first-touch', draftId: 'draft_1' }),
    );

    expect(createAppNotificationMock).toHaveBeenCalledWith({
      spaceId: 'space_1',
      type: 'first_touch',
      title: 'New lead: Jane Doe — first touch sent',
      body: 'Intro email sent from your Gmail.',
      href: '/s/acme/chippi/inbox',
      priority: 'high',
    });
    expect(advanceDealFromEventMock).toHaveBeenCalledWith({
      spaceId: 'space_1',
      contactId: 'c_1',
      event: 'first_touch_sent',
      title: 'Jane Doe',
    });
  });

  it('treats omitted origin as manual (marketing consent gate)', async () => {
    queueSpace();
    queueContact();
    queueNoExistingDraft();
    queueInsertOk();
    queueAutoSendLookups();

    await fireFirstTouch({ spaceId: 'space_1', contactId: 'c_1' });

    expect(checkSendAllowedMock).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'marketing', audience: 'consumer' }),
    );
  });

  it('manual origin uses the marketing category', async () => {
    queueSpace();
    queueContact();
    queueNoExistingDraft();
    queueInsertOk();
    queueAutoSendLookups();

    await fireFirstTouch({ spaceId: 'space_1', contactId: 'c_1', origin: 'manual' });

    expect(checkSendAllowedMock).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'marketing' }),
    );
  });

  it('autoFirstTouchSend off: leaves pending and says ready (no send)', async () => {
    queueSpace();
    queueContact();
    queueNoExistingDraft();
    queueInsertOk();
    queueFor('SpaceSetting').push({ data: { autoFirstTouchSend: false }, error: null });

    const outcome = await fireFirstTouch({ spaceId: 'space_1', contactId: 'c_1', origin: 'inbound' });

    expect(outcome).toEqual({
      created: true,
      draftId: 'draft_1',
      sent: false,
      holdReason: 'setting_off',
    });
    expect(sendDraftMock).not.toHaveBeenCalled();
    expect(recordOutboundMessageSafeMock).not.toHaveBeenCalled();
    expect(advanceDealFromEventMock).not.toHaveBeenCalled();
    expect(createAppNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'New lead: Jane Doe — first touch ready',
        body: 'Review and send the intro email I drafted.',
      }),
    );
  });

  it('compliance block: leaves pending and names the reason', async () => {
    queueSpace();
    queueContact();
    queueNoExistingDraft();
    queueInsertOk();
    queueFor('SpaceSetting').push({ data: { autoFirstTouchSend: true }, error: null });
    checkSendAllowedMock.mockResolvedValue({
      allowed: false,
      reason: 'quiet_hours',
      detail: 'Outside the 8:00-21:00 window in America/New_York.',
    });

    const outcome = await fireFirstTouch({ spaceId: 'space_1', contactId: 'c_1', origin: 'inbound' });

    expect(outcome).toEqual({
      created: true,
      draftId: 'draft_1',
      sent: false,
      holdReason: 'compliance',
    });
    expect(sendDraftMock).not.toHaveBeenCalled();
    expect(advanceDealFromEventMock).not.toHaveBeenCalled();
    expect(updates.filter((u) => u.table === 'AgentDraft')).toHaveLength(0);
    expect(createAppNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'New lead: Jane Doe — first touch held',
        body: expect.stringContaining('Outside the 8:00-21:00 window'),
      }),
    );
  });

  it('send failure: leaves pending and does not claim sent', async () => {
    queueSpace();
    queueContact();
    queueNoExistingDraft();
    queueInsertOk();
    queueAutoSendLookups();
    sendDraftMock.mockResolvedValue({ sent: false, method: 'email', error: 'not_configured' });

    const outcome = await fireFirstTouch({ spaceId: 'space_1', contactId: 'c_1', origin: 'inbound' });

    expect(outcome).toEqual({
      created: true,
      draftId: 'draft_1',
      sent: false,
      holdReason: 'send_failed',
    });
    expect(recordOutboundMessageSafeMock).not.toHaveBeenCalled();
    expect(advanceDealFromEventMock).not.toHaveBeenCalled();
    expect(updates.filter((u) => u.table === 'AgentDraft')).toHaveLength(0);
    expect(createAppNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'New lead: Jane Doe — first touch not sent',
        body: expect.stringContaining('not_configured'),
      }),
    );
  });

  it('labels a Resend fallback send honestly', async () => {
    queueSpace();
    queueContact();
    queueNoExistingDraft();
    queueInsertOk();
    queueAutoSendLookups();
    sendDraftMock.mockResolvedValue({
      sent: true,
      method: 'email',
      fallback: true,
      primaryError: 'inbox_send_failed',
    });

    const outcome = await fireFirstTouch({ spaceId: 'space_1', contactId: 'c_1', origin: 'inbound' });

    expect(outcome.sent).toBe(true);
    expect(outcome.fallback).toBe(true);
    expect(createAppNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("Chippi's sender"),
      }),
    );
  });

  it('chooses sms when the contact has a phone but no email', async () => {
    queueSpace();
    queueContact({ email: null });
    queueNoExistingDraft();
    queueInsertOk();
    queueAutoSendLookups();
    composeMock.mockResolvedValue({
      subject: null,
      body: 'Hi Jane, thanks for reaching out about renting.',
      subjectLabel: 'Jane Doe',
    });
    sendDraftMock.mockResolvedValue({ sent: true, method: 'sms' });

    const outcome = await fireFirstTouch({ spaceId: 'space_1', contactId: 'c_1', origin: 'inbound' });

    expect(outcome.created).toBe(true);
    expect(outcome.sent).toBe(true);
    expect(composeMock).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'sms', kind: 'person', id: 'c_1', spaceId: 'space_1' }),
    );
    expect(inserts.find((i) => i.table === 'AgentDraft')!.values.channel).toBe('sms');
    expect(inserts.find((i) => i.table === 'AgentDraft')!.values.subject).toBeNull();
    expect(checkSendAllowedMock).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'sms', address: '+15551234567', category: 'transactional' }),
    );
  });

  it('skips (no draft, no push) when the contact has no email and no phone', async () => {
    queueSpace();
    queueContact({ email: null, phone: '' });

    const outcome = await fireFirstTouch({ spaceId: 'space_1', contactId: 'c_1', origin: 'inbound' });

    expect(outcome).toEqual({ created: false, reason: 'no_channel' });
    expect(inserts).toHaveLength(0);
    expect(sendPushMock).not.toHaveBeenCalled();
    expect(createAppNotificationMock).not.toHaveBeenCalled();
    expect(composeMock).not.toHaveBeenCalled();
    expect(sendDraftMock).not.toHaveBeenCalled();
  });

  it('dedupes: an existing first-touch draft for the contact blocks a second one', async () => {
    queueSpace();
    queueContact();
    queueFor('AgentDraft').push({ data: { id: 'existing_draft' }, error: null });

    const outcome = await fireFirstTouch({ spaceId: 'space_1', contactId: 'c_1', origin: 'inbound' });

    expect(outcome).toEqual({ created: false, reason: 'duplicate' });
    expect(inserts).toHaveLength(0);
    expect(sendDraftMock).not.toHaveBeenCalled();
    expect(checkRateLimitMock).not.toHaveBeenCalled();
  });

  it('treats a unique-violation on insert as a duplicate (race backstop), without sending', async () => {
    queueSpace();
    queueContact();
    queueNoExistingDraft();
    queueFor('AgentDraft').push({ data: null, error: { code: '23505', message: 'duplicate key' } });

    const outcome = await fireFirstTouch({ spaceId: 'space_1', contactId: 'c_1', origin: 'inbound' });

    expect(outcome).toEqual({ created: false, reason: 'duplicate' });
    expect(sendDraftMock).not.toHaveBeenCalled();
    expect(sendPushMock).not.toHaveBeenCalled();
  });

  it('enforces the per-space daily cap', async () => {
    queueSpace();
    queueContact();
    queueNoExistingDraft();
    checkRateLimitMock.mockResolvedValue({ allowed: false });

    const outcome = await fireFirstTouch({ spaceId: 'space_1', contactId: 'c_1', origin: 'inbound' });

    expect(outcome).toEqual({ created: false, reason: 'daily_cap' });
    expect(checkRateLimitMock).toHaveBeenCalledWith('first-touch:space_1', 20, 86_400);
    expect(inserts).toHaveLength(0);
    expect(sendDraftMock).not.toHaveBeenCalled();
  });

  it('skips when the space is premium-blocked (lapsed paid subscription)', async () => {
    queueSpace({ stripeSubscriptionStatus: 'past_due' });

    const outcome = await fireFirstTouch({ spaceId: 'space_1', contactId: 'c_1', origin: 'inbound' });

    expect(outcome).toEqual({ created: false, reason: 'premium_blocked' });
    expect(inserts).toHaveLength(0);
    expect(sendDraftMock).not.toHaveBeenCalled();
  });

  it('runs for free/never-subscribed spaces (only lapsed-paid states are blocked)', async () => {
    queueSpace({ stripeSubscriptionStatus: 'inactive', stripePeriodEnd: null });
    queueContact();
    queueNoExistingDraft();
    queueInsertOk();
    queueAutoSendLookups();

    const outcome = await fireFirstTouch({ spaceId: 'space_1', contactId: 'c_1', origin: 'inbound' });
    expect(outcome.created).toBe(true);
    expect(outcome.sent).toBe(true);
  });

  it('falls back to a neutral claim-free draft when compose fails, and still sends', async () => {
    queueSpace();
    queueContact();
    queueNoExistingDraft();
    queueInsertOk();
    queueAutoSendLookups();
    composeMock.mockRejectedValue(new Error('provider down'));

    const outcome = await fireFirstTouch({ spaceId: 'space_1', contactId: 'c_1', origin: 'inbound' });

    expect(outcome.created).toBe(true);
    expect(outcome.sent).toBe(true);
    expect(inserts.find((i) => i.table === 'AgentDraft')!.values.content).toBe(
      'Thanks for reaching out. What would be most helpful as you get started?',
    );
    expect(sendDraftMock).toHaveBeenCalledOnce();
  });

  it('never rejects: an insert failure resolves to created:false and no send', async () => {
    queueSpace();
    queueContact();
    queueNoExistingDraft();
    queueFor('AgentDraft').push({ data: null, error: { code: '500', message: 'db down' } });

    const outcome = await fireFirstTouch({ spaceId: 'space_1', contactId: 'c_1', origin: 'inbound' });

    expect(outcome).toEqual({ created: false, reason: 'insert_failed' });
    expect(sendDraftMock).not.toHaveBeenCalled();
    expect(sendPushMock).not.toHaveBeenCalled();
  });

  it('still succeeds when the in-app record write fails (draft + send already landed)', async () => {
    queueSpace();
    queueContact();
    queueNoExistingDraft();
    queueInsertOk();
    queueAutoSendLookups();
    createAppNotificationMock.mockResolvedValueOnce(false);

    const outcome = await fireFirstTouch({ spaceId: 'space_1', contactId: 'c_1', origin: 'inbound' });

    expect(outcome).toEqual({
      created: true,
      draftId: 'draft_1',
      sent: true,
      deliveryMethod: 'gmail',
      fallback: undefined,
    });
    expect(sendDraftMock).toHaveBeenCalledOnce();
  });

  it('never rejects: a thrown DB error resolves to created:false', async () => {
    queueFor('Space').push({ reject: new Error('connection reset') });

    await expect(
      fireFirstTouch({ spaceId: 'space_1', contactId: 'c_1', origin: 'inbound' }),
    ).resolves.toEqual({ created: false, reason: 'error' });
  });

  it('skips a contact that does not belong to the space (tenant scoping)', async () => {
    queueSpace();
    queueFor('Contact').push({ data: null, error: null });

    const outcome = await fireFirstTouch({
      spaceId: 'space_1',
      contactId: 'c_other_tenant',
      origin: 'inbound',
    });

    expect(outcome).toEqual({ created: false, reason: 'contact_not_found' });
    expect(inserts).toHaveLength(0);
    expect(sendDraftMock).not.toHaveBeenCalled();
  });
});
