/**
 * Behavioral tests for lib/leads/first-touch.ts — the Instant First Touch
 * engine. Executes fireFirstTouch with mocked collaborators and asserts on
 * outcomes and side effects (draft insert payloads, push payloads), never on
 * source text.
 *
 * Contract under test:
 *   - Happy path creates a PENDING AgentDraft (reasoning, idempotencyKey,
 *     spaceId scoping, priority), pushes "first touch ready" with a URL
 *     to the inbox surface, AND writes the durable in-app record
 *     (createAppNotification) so the bell keeps the outcome after the push.
 *   - Channel choice: email wins when present; sms when only a phone; skip
 *     when neither.
 *   - Per-contact dedupe (existing first-touch draft → nothing happens).
 *   - Per-space daily cap via checkRateLimit.
 *   - Premium-blocked spaces are skipped.
 *   - Compose failure degrades to the neutral fallback (draft still created).
 *   - It NEVER rejects — DB errors resolve to { created: false }.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Collaborator mocks ───────────────────────────────────────────────────────

const { checkRateLimitMock, sendPushMock, composeMock, createAppNotificationMock } = vi.hoisted(() => ({
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
}));

vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: checkRateLimitMock }));
vi.mock('@/lib/push', () => ({ sendPushToSpace: sendPushMock }));
vi.mock('@/lib/notifications', () => ({ createAppNotification: createAppNotificationMock }));
vi.mock('@/lib/agent/quick-draft', () => ({ composeQuickDraft: composeMock }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// ── Supabase: per-table terminal queue + insert capture ─────────────────────
type Terminal = { data?: unknown; error?: unknown; reject?: unknown };
const queues: Record<string, Terminal[]> = {};
const inserts: Array<{ table: string; values: Record<string, unknown> }> = [];

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
    chain.maybeSingle = vi.fn(() => next());
    chain.single = vi.fn(() => next());
    chain.then = (resolve: (v: Terminal) => unknown, reject?: (e: unknown) => unknown) =>
      next().then(resolve, reject);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

import { fireFirstTouch, FIRST_TOUCH_REASONING } from '@/lib/leads/first-touch';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const FUTURE = new Date(Date.now() + 30 * 86_400_000).toISOString();

function queueSpace(overrides: Record<string, unknown> = {}) {
  queueFor('Space').push({
    data: {
      id: 'space_1',
      slug: 'acme',
      name: 'Acme Realty',
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
  queueFor('AgentDraft').push({ data: null, error: null }); // dedupe check
}

function queueInsertOk() {
  queueFor('AgentDraft').push({ data: { id: 'draft_1' }, error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(queues)) delete queues[k];
  inserts.length = 0;
  checkRateLimitMock.mockResolvedValue({ allowed: true });
  composeMock.mockResolvedValue({
    subject: 'Quick hello',
    body: 'Thanks for your note about renting. What timing works for a call?',
    subjectLabel: 'Jane Doe',
  });
});

describe('fireFirstTouch', () => {
  it('creates a pending email draft and pushes with the inbox URL', async () => {
    queueSpace();
    queueContact();
    queueNoExistingDraft();
    queueInsertOk();

    const outcome = await fireFirstTouch({ spaceId: 'space_1', contactId: 'c_1' });

    expect(outcome).toEqual({ created: true, draftId: 'draft_1' });

    expect(inserts).toHaveLength(1);
    const row = inserts[0].values;
    expect(inserts[0].table).toBe('AgentDraft');
    expect(row.spaceId).toBe('space_1'); // tenant scoping on the write
    expect(row.contactId).toBe('c_1');
    expect(row.status).toBe('pending');
    expect(row.channel).toBe('email');
    expect(row.subject).toBe('Quick hello');
    expect(row.content).toContain('Thanks for your note');
    expect(row.reasoning).toBe(FIRST_TOUCH_REASONING);
    expect(row.idempotencyKey).toBe('first-touch:space_1:c_1');

    expect(sendPushMock).toHaveBeenCalledOnce();
    const [pushSpaceId, payload] = sendPushMock.mock.calls[0] as unknown as [
      string,
      { title: string; body: string; url: string },
    ];
    expect(pushSpaceId).toBe('space_1');
    expect(payload.title).toBe('New lead: Jane Doe — first touch ready');
    expect(payload.url).toBe('/s/acme/chippi/inbox');

    // Durable in-app record: same honest title, deep link to the inbox where
    // the draft is reviewed, scoped to the tenant.
    expect(createAppNotificationMock).toHaveBeenCalledOnce();
    expect(createAppNotificationMock).toHaveBeenCalledWith({
      spaceId: 'space_1',
      type: 'first_touch',
      title: 'New lead: Jane Doe — first touch ready',
      body: 'Review and send the intro email I drafted.',
      href: '/s/acme/chippi/inbox',
      priority: 'high',
    });
  });

  it('chooses sms when the contact has a phone but no email', async () => {
    queueSpace();
    queueContact({ email: null });
    queueNoExistingDraft();
    queueInsertOk();
    composeMock.mockResolvedValue({
      subject: null,
      body: 'Hi Jane, thanks for reaching out about renting.',
      subjectLabel: 'Jane Doe',
    });

    const outcome = await fireFirstTouch({ spaceId: 'space_1', contactId: 'c_1' });

    expect(outcome.created).toBe(true);
    expect(composeMock).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'sms', kind: 'person', id: 'c_1', spaceId: 'space_1' }),
    );
    const row = inserts[0].values;
    expect(row.channel).toBe('sms');
    expect(row.subject).toBeNull(); // sms drafts carry no subject
  });

  it('skips (no draft, no push) when the contact has no email and no phone', async () => {
    queueSpace();
    queueContact({ email: null, phone: '' });

    const outcome = await fireFirstTouch({ spaceId: 'space_1', contactId: 'c_1' });

    expect(outcome).toEqual({ created: false, reason: 'no_channel' });
    expect(inserts).toHaveLength(0);
    expect(sendPushMock).not.toHaveBeenCalled();
    expect(createAppNotificationMock).not.toHaveBeenCalled();
    expect(composeMock).not.toHaveBeenCalled();
  });

  it('dedupes: an existing first-touch draft for the contact blocks a second one', async () => {
    queueSpace();
    queueContact();
    queueFor('AgentDraft').push({ data: { id: 'existing_draft' }, error: null }); // dedupe hit

    const outcome = await fireFirstTouch({ spaceId: 'space_1', contactId: 'c_1' });

    expect(outcome).toEqual({ created: false, reason: 'duplicate' });
    expect(inserts).toHaveLength(0);
    expect(sendPushMock).not.toHaveBeenCalled();
    expect(createAppNotificationMock).not.toHaveBeenCalled();
    // The daily-cap budget is not consumed by duplicates.
    expect(checkRateLimitMock).not.toHaveBeenCalled();
  });

  it('treats a unique-violation on insert as a duplicate (race backstop), without pushing', async () => {
    queueSpace();
    queueContact();
    queueNoExistingDraft();
    queueFor('AgentDraft').push({ data: null, error: { code: '23505', message: 'duplicate key' } });

    const outcome = await fireFirstTouch({ spaceId: 'space_1', contactId: 'c_1' });

    expect(outcome).toEqual({ created: false, reason: 'duplicate' });
    expect(sendPushMock).not.toHaveBeenCalled();
    expect(createAppNotificationMock).not.toHaveBeenCalled();
  });

  it('enforces the per-space daily cap', async () => {
    queueSpace();
    queueContact();
    queueNoExistingDraft();
    checkRateLimitMock.mockResolvedValue({ allowed: false });

    const outcome = await fireFirstTouch({ spaceId: 'space_1', contactId: 'c_1' });

    expect(outcome).toEqual({ created: false, reason: 'daily_cap' });
    expect(checkRateLimitMock).toHaveBeenCalledWith('first-touch:space_1', 20, 86_400);
    expect(inserts).toHaveLength(0);
    expect(sendPushMock).not.toHaveBeenCalled();
    expect(composeMock).not.toHaveBeenCalled();
  });

  it('skips when the space is premium-blocked (lapsed paid subscription)', async () => {
    queueSpace({ stripeSubscriptionStatus: 'past_due' });

    const outcome = await fireFirstTouch({ spaceId: 'space_1', contactId: 'c_1' });

    expect(outcome).toEqual({ created: false, reason: 'premium_blocked' });
    expect(inserts).toHaveLength(0);
    expect(sendPushMock).not.toHaveBeenCalled();
  });

  it('runs for free/never-subscribed spaces (only lapsed-paid states are blocked)', async () => {
    queueSpace({ stripeSubscriptionStatus: 'inactive', stripePeriodEnd: null });
    queueContact();
    queueNoExistingDraft();
    queueInsertOk();

    const outcome = await fireFirstTouch({ spaceId: 'space_1', contactId: 'c_1' });
    expect(outcome.created).toBe(true);
  });

  it('falls back to a neutral claim-free draft when compose fails, and still notifies', async () => {
    queueSpace();
    queueContact();
    queueNoExistingDraft();
    queueInsertOk();
    composeMock.mockRejectedValue(new Error('provider down'));

    const outcome = await fireFirstTouch({ spaceId: 'space_1', contactId: 'c_1' });

    expect(outcome.created).toBe(true);
    const row = inserts[0].values;
    expect(row.status).toBe('pending');
    // Neutral fallback: thanks + question, no invented facts.
    expect(row.content).toBe(
      'Thanks for reaching out. What would be most helpful as you get started?',
    );
    expect(sendPushMock).toHaveBeenCalledOnce();
  });

  it('never rejects: an insert failure resolves to created:false and no push', async () => {
    queueSpace();
    queueContact();
    queueNoExistingDraft();
    queueFor('AgentDraft').push({ data: null, error: { code: '500', message: 'db down' } });

    const outcome = await fireFirstTouch({ spaceId: 'space_1', contactId: 'c_1' });

    expect(outcome).toEqual({ created: false, reason: 'insert_failed' });
    expect(sendPushMock).not.toHaveBeenCalled();
    expect(createAppNotificationMock).not.toHaveBeenCalled();
  });

  it('still succeeds when the in-app record write fails (draft + push already landed)', async () => {
    queueSpace();
    queueContact();
    queueNoExistingDraft();
    queueInsertOk();
    createAppNotificationMock.mockResolvedValueOnce(false);

    const outcome = await fireFirstTouch({ spaceId: 'space_1', contactId: 'c_1' });

    expect(outcome).toEqual({ created: true, draftId: 'draft_1' });
    expect(sendPushMock).toHaveBeenCalledOnce();
  });

  it('never rejects: a thrown DB error resolves to created:false', async () => {
    queueFor('Space').push({ reject: new Error('connection reset') });

    await expect(
      fireFirstTouch({ spaceId: 'space_1', contactId: 'c_1' }),
    ).resolves.toEqual({ created: false, reason: 'error' });
  });

  it('skips a contact that does not belong to the space (tenant scoping)', async () => {
    queueSpace();
    queueFor('Contact').push({ data: null, error: null }); // scoped lookup miss

    const outcome = await fireFirstTouch({ spaceId: 'space_1', contactId: 'c_other_tenant' });

    expect(outcome).toEqual({ created: false, reason: 'contact_not_found' });
    expect(inserts).toHaveLength(0);
    expect(sendPushMock).not.toHaveBeenCalled();
  });
});
