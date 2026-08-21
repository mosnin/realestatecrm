/**
 * Behavioral tests for lib/reputation/review-engine.ts — the Post-Close
 * Reputation Engine's review-ask half. Executes fireReviewAsk with mocked
 * collaborators and asserts on outcomes and side effects (ReviewCampaign +
 * AgentDraft insert payloads, campaign 'sent' flip, push/in-app record), never
 * on source text. Mirrors tests/lib/first-touch.test.ts.
 *
 * Contract under test:
 *   - Happy path inserts a ReviewCampaign (starts 'drafted') AND a PENDING
 *     AgentDraft carrying the tracked review link, flips the campaign to
 *     'sent', pushes + writes the durable in-app record.
 *   - Per-deal dedupe (existing campaign → nothing happens).
 *   - Skips a space with no reviewUrl configured (the feature's opt-in).
 *   - Premium-blocked spaces are skipped.
 *   - Channel: email wins; sms when only a phone; skip when neither.
 *   - Compose failure degrades to the neutral opener (draft still created).
 *   - It NEVER rejects — DB errors resolve to { created: false }.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendPushMock, composeMock, createAppNotificationMock } = vi.hoisted(() => ({
  sendPushMock: vi.fn(async () => 1),
  composeMock: vi.fn(
    async (): Promise<{ subject: string | null; body: string; subjectLabel: string } | null> => ({
      subject: 'Congrats on the close',
      body: 'It was a real pleasure getting you into the house on Elm St.',
      subjectLabel: '123 Elm St',
    }),
  ),
  createAppNotificationMock: vi.fn(async () => true),
}));

vi.mock('@/lib/push', () => ({ sendPushToSpace: sendPushMock }));
vi.mock('@/lib/notifications', () => ({ createAppNotification: createAppNotificationMock }));
vi.mock('@/lib/agent/quick-draft', () => ({ composeQuickDraft: composeMock }));
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
    for (const m of ['select', 'eq', 'in', 'is', 'not', 'gte', 'lte', 'limit', 'order']) {
      chain[m] = vi.fn(() => chain);
    }
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

import { fireReviewAsk, REVIEW_ASK_REASONING } from '@/lib/reputation/review-engine';

const FUTURE = new Date(Date.now() + 30 * 86_400_000).toISOString();

function queueSpace(overrides: Record<string, unknown> = {}) {
  queueFor('Space').push({
    data: {
      id: 'space_1',
      slug: 'acme',
      stripeSubscriptionStatus: 'active',
      stripePeriodEnd: FUTURE,
      ...overrides,
    },
    error: null,
  });
}
function queueReviewUrl(url: string | null = 'https://g.page/r/acme/review') {
  queueFor('SpaceSetting').push({ data: { reviewUrl: url }, error: null });
}
function queueNoExistingCampaign() {
  queueFor('ReviewCampaign').push({ data: null, error: null }); // dedupe miss
}
function queueContact(overrides: Record<string, unknown> = {}) {
  queueFor('Contact').push({
    data: { id: 'c_1', name: 'Jane Doe', email: 'jane@example.com', phone: '+15551234567', ...overrides },
    error: null,
  });
}
function queueCampaignInsert(id = 'camp_1') {
  queueFor('ReviewCampaign').push({ data: { id }, error: null }); // insert → id
}
function queueDraftInsert(id = 'draft_1') {
  queueFor('AgentDraft').push({ data: { id }, error: null });
}
function queueCampaignSentUpdate() {
  queueFor('ReviewCampaign').push({ data: null, error: null }); // 'sent' flip
}

/** Queue the full happy-path terminal sequence. */
function queueHappyPath() {
  queueSpace();
  queueReviewUrl();
  queueNoExistingCampaign();
  queueContact();
  queueCampaignInsert();
  queueDraftInsert();
  queueCampaignSentUpdate();
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(queues)) delete queues[k];
  inserts.length = 0;
  updates.length = 0;
  composeMock.mockResolvedValue({
    subject: 'Congrats on the close',
    body: 'It was a real pleasure getting you into the house on Elm St.',
    subjectLabel: '123 Elm St',
  });
});

describe('fireReviewAsk', () => {
  it('creates a campaign + pending email draft with the tracked link, flips to sent, notifies', async () => {
    queueHappyPath();

    const outcome = await fireReviewAsk({ spaceId: 'space_1', dealId: 'deal_1', contactId: 'c_1' });

    expect(outcome).toEqual({ created: true, campaignId: 'camp_1', draftId: 'draft_1' });

    // Campaign row inserted, scoped, starts 'drafted'.
    const campaignInsert = inserts.find((i) => i.table === 'ReviewCampaign');
    expect(campaignInsert).toBeDefined();
    expect(campaignInsert!.values).toMatchObject({
      spaceId: 'space_1',
      dealId: 'deal_1',
      contactId: 'c_1',
      channel: 'email',
      reviewUrl: 'https://g.page/r/acme/review',
      status: 'drafted',
    });

    // Pending AgentDraft carries the review reasoning and the TRACKED link
    // (not the raw Google URL — the click must route through our redirect).
    const draftInsert = inserts.find((i) => i.table === 'AgentDraft');
    expect(draftInsert).toBeDefined();
    const row = draftInsert!.values;
    expect(row.spaceId).toBe('space_1');
    expect(row.status).toBe('pending');
    expect(row.channel).toBe('email');
    expect(row.reasoning).toBe(REVIEW_ASK_REASONING);
    expect(row.idempotencyKey).toBe('review-ask:space_1:deal_1');
    expect(String(row.content)).toContain('/api/reviews/camp_1');
    expect(String(row.content)).not.toContain('g.page');

    // Campaign flipped to 'sent' with a sentAt stamp.
    const sentUpdate = updates.find(
      (u) => u.table === 'ReviewCampaign' && u.values.status === 'sent',
    );
    expect(sentUpdate).toBeDefined();
    expect(typeof sentUpdate!.values.sentAt).toBe('string');

    expect(sendPushMock).toHaveBeenCalledOnce();
    const [pushSpaceId, payload] = sendPushMock.mock.calls[0] as unknown as [
      string,
      { url: string },
    ];
    expect(pushSpaceId).toBe('space_1');
    expect(payload.url).toBe('/s/acme/chippi/inbox');

    expect(createAppNotificationMock).toHaveBeenCalledOnce();
    expect(createAppNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: 'space_1', type: 'review_request', href: '/s/acme/chippi/inbox' }),
    );
  });

  it('chooses sms when the contact has a phone but no email', async () => {
    queueSpace();
    queueReviewUrl();
    queueNoExistingCampaign();
    queueContact({ email: null });
    queueCampaignInsert();
    queueDraftInsert();
    queueCampaignSentUpdate();
    composeMock.mockResolvedValue({ subject: null, body: 'Great working with you.', subjectLabel: 'deal' });

    const outcome = await fireReviewAsk({ spaceId: 'space_1', dealId: 'deal_1', contactId: 'c_1' });

    expect(outcome.created).toBe(true);
    const draftInsert = inserts.find((i) => i.table === 'AgentDraft')!;
    expect(draftInsert.values.channel).toBe('sms');
    expect(draftInsert.values.subject).toBeNull();
    expect(String(draftInsert.values.content)).toContain('/api/reviews/camp_1');
  });

  it('dedupes: an existing campaign for the deal blocks a second one', async () => {
    queueSpace();
    queueReviewUrl();
    queueFor('ReviewCampaign').push({ data: { id: 'existing' }, error: null }); // dedupe hit

    const outcome = await fireReviewAsk({ spaceId: 'space_1', dealId: 'deal_1', contactId: 'c_1' });

    expect(outcome).toEqual({ created: false, reason: 'duplicate' });
    expect(inserts).toHaveLength(0);
    expect(sendPushMock).not.toHaveBeenCalled();
  });

  it('skips a space with no reviewUrl configured', async () => {
    queueSpace();
    queueReviewUrl(null);

    const outcome = await fireReviewAsk({ spaceId: 'space_1', dealId: 'deal_1', contactId: 'c_1' });

    expect(outcome).toEqual({ created: false, reason: 'no_review_url' });
    expect(inserts).toHaveLength(0);
    expect(composeMock).not.toHaveBeenCalled();
  });

  it('skips when the space is premium-blocked (lapsed paid subscription)', async () => {
    queueSpace({ stripeSubscriptionStatus: 'past_due' });

    const outcome = await fireReviewAsk({ spaceId: 'space_1', dealId: 'deal_1', contactId: 'c_1' });

    expect(outcome).toEqual({ created: false, reason: 'premium_blocked' });
    expect(inserts).toHaveLength(0);
  });

  it('skips when the contact has no reachable channel', async () => {
    queueSpace();
    queueReviewUrl();
    queueNoExistingCampaign();
    queueContact({ email: null, phone: '' });

    const outcome = await fireReviewAsk({ spaceId: 'space_1', dealId: 'deal_1', contactId: 'c_1' });

    expect(outcome).toEqual({ created: false, reason: 'no_channel' });
    expect(inserts).toHaveLength(0);
  });

  it('falls back to a neutral opener when compose fails, and still creates the draft', async () => {
    queueSpace();
    queueReviewUrl();
    queueNoExistingCampaign();
    queueContact();
    queueCampaignInsert();
    queueDraftInsert();
    queueCampaignSentUpdate();
    composeMock.mockRejectedValue(new Error('provider down'));

    const outcome = await fireReviewAsk({ spaceId: 'space_1', dealId: 'deal_1', contactId: 'c_1' });

    expect(outcome.created).toBe(true);
    const draftInsert = inserts.find((i) => i.table === 'AgentDraft')!;
    // Neutral opener + the tracked link — no invented transaction claims.
    expect(String(draftInsert.values.content)).toContain('/api/reviews/camp_1');
    expect(String(draftInsert.values.content)).toContain('Jane');
  });

  it('never rejects: a thrown DB error resolves to created:false', async () => {
    queueFor('Space').push({ reject: new Error('connection reset') });

    await expect(
      fireReviewAsk({ spaceId: 'space_1', dealId: 'deal_1', contactId: 'c_1' }),
    ).resolves.toEqual({ created: false, reason: 'error' });
  });

  it('skips a contact that does not belong to the space (tenant scoping)', async () => {
    queueSpace();
    queueReviewUrl();
    queueNoExistingCampaign();
    queueFor('Contact').push({ data: null, error: null }); // scoped miss

    const outcome = await fireReviewAsk({ spaceId: 'space_1', dealId: 'deal_1', contactId: 'c_other' });

    expect(outcome).toEqual({ created: false, reason: 'contact_not_found' });
    expect(inserts).toHaveLength(0);
    expect(inserts.filter((i) => i.table === 'ReviewCampaign' || i.table === 'AgentDraft')).toHaveLength(0);
  });
});
