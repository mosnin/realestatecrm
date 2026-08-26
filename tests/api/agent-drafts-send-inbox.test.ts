/**
 * Route-level test for the Phase-2 inbox wire-in on `PATCH /api/agent/drafts/[id]`.
 *
 * Phase 2 ADDS, after a successful send (deliveryResult.sent === true), two
 * side-effect writes that this route previously lacked:
 *   1. recordOutboundMessage on the contact's inbox thread (tied to the draft
 *      via agentDraftId), carrying the body actually SENT (the realtor's edit
 *      when edited, else the original).
 *   2. a ContactActivity row (the previously-missing timeline write), shaped
 *      like the agent/send path (type 'email' for email, 'note' otherwise).
 *
 * Both writes are BEST-EFFORT: a send that already succeeded must still return
 * success even if the inbox record throws, and a draft with no contact must
 * skip the record without erroring.
 *
 * We run the REAL lib/inbox helpers (recordOutboundMessageSafe →
 * recordOutboundMessage) over the supabase mock, so the thread/message writes
 * are observable as InboxThread/InboxMessage ops and a queued error terminal
 * exercises the best-effort swallow for real. Mocks otherwise mirror
 * tests/api/agent-drafts-batch-approve.test.ts.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/api-auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/space', () => ({ getSpaceForUser: vi.fn() }));
vi.mock('@/lib/audit', () => ({ audit: vi.fn(async () => undefined) }));
vi.mock('@/lib/delivery', () => ({ sendDraft: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Supabase mock — table-aware queue (insert/update/upsert recorded) ────────
type Terminal = { data?: unknown; error?: unknown };
const queues: Record<string, Terminal[]> = {};
const inserts: Array<{ table: string; values: unknown }> = [];
const updateCalls: Array<{ table: string; values: unknown }> = [];

function queueFor(table: string) {
  if (!queues[table]) queues[table] = [];
  return queues[table];
}

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const q = queueFor(table);
    const terminal = q.shift() ?? { data: null, error: null };
    let isUpdate = false;
    let isInsert = false;
    let writeValues: unknown = undefined;

    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.upsert = vi.fn(() => chain);
    chain.update = vi.fn((values: unknown) => {
      isUpdate = true;
      writeValues = values;
      return chain;
    });
    chain.insert = vi.fn((values: unknown) => {
      isInsert = true;
      writeValues = values;
      inserts.push({ table, values });
      return chain;
    });
    chain.maybeSingle = vi.fn(() => Promise.resolve(terminal));
    chain.single = vi.fn(() => Promise.resolve(terminal));
    chain.then = (resolve: (v: Terminal) => unknown, reject?: (e: unknown) => unknown) => {
      if (isUpdate) updateCalls.push({ table, values: writeValues });
      // An insert awaited directly (ContactActivity) with an error terminal must
      // reject so the route's try/catch fires.
      if (isInsert && terminal.error) {
        return reject ? reject(terminal) : Promise.reject(terminal);
      }
      return Promise.resolve(terminal).then(resolve, reject);
    };
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

// Import AFTER mocks.
import { PATCH } from '@/app/api/agent/drafts/[id]/route';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { sendDraft } from '@/lib/delivery';

const mockRequireAuth = vi.mocked(requireAuth);
const mockGetSpaceForUser = vi.mocked(getSpaceForUser);
const mockSendDraft = vi.mocked(sendDraft);

const SPACE = { id: 'space_1', slug: 's', name: 'Test Realty', ownerId: 'owner_1' };

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/agent/drafts/d1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

/** Queue the InboxThread upsert + InboxMessage insert + InboxThread rollup for
 *  one successful recordOutboundMessage call. */
function queueInboxWriteSuccess() {
  queueFor('InboxThread').push({ data: { id: 'thread_1', unreadCount: 0 }, error: null }); // upsert
  queueFor('InboxMessage').push({ data: { id: 'out_1' }, error: null }); // insert
  queueFor('InboxThread').push({ data: null, error: null }); // rollup update
}

/** The InboxMessage insert values from the record write, if any. */
function inboxMessage(): Record<string, unknown> | undefined {
  return inserts.find((i) => i.table === 'InboxMessage')?.values as Record<string, unknown> | undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(queues)) delete queues[k];
  inserts.length = 0;
  updateCalls.length = 0;
  mockRequireAuth.mockResolvedValue({ userId: 'user_1' });
  mockGetSpaceForUser.mockResolvedValue(SPACE as never);
});

describe('PATCH /api/agent/drafts/[id] — Phase 2 inbox + activity wire-in', () => {
  it('records an outbound InboxMessage (tied to the draft + contact) and a ContactActivity on a successful email send', async () => {
    queueFor('AgentDraft').push(
      { data: { id: 'd1', status: 'pending', contactId: 'c1', dealId: null, channel: 'email', subject: 'Tour times', content: 'original body', outcome: null }, error: null },
      { data: { id: 'd1', status: 'approved' }, error: null },
      { data: { id: 'd1', status: 'sent' }, error: null },
    );
    queueFor('Contact').push({ data: { name: 'Alice', email: 'a@x.test', phone: null }, error: null });
    queueInboxWriteSuccess();
    queueFor('ContactActivity').push({ data: null, error: null });
    mockSendDraft.mockResolvedValue({ sent: true, method: 'email' });

    const res = await PATCH(makeReq({ status: 'approved' }), params('d1'));
    expect(res.status).toBe(200);

    // Outbound message recorded with the draft's contact + agentDraftId.
    const msg = inboxMessage();
    expect(msg).toMatchObject({
      spaceId: 'space_1',
      contactId: 'c1',
      direction: 'outbound',
      channel: 'email',
      subject: 'Tour times',
      agentDraftId: 'd1',
      body: 'original body',
    });
    expect(msg!.metadata).toMatchObject({ source: 'approved_draft', method: 'email' });

    // ContactActivity written: type 'email', timeline content, source metadata.
    const activity = inserts.find((i) => i.table === 'ContactActivity');
    expect(activity).toBeDefined();
    const v = activity!.values as { type: string; contactId: string; content: string; metadata: Record<string, unknown> };
    expect(v.type).toBe('email');
    expect(v.contactId).toBe('c1');
    expect(v.content).toContain('Tour times');
    expect(v.metadata).toMatchObject({ channel: 'email', source: 'approved_draft', draftId: 'd1' });
  });

  it('records the EDITED body that was actually sent, not the original', async () => {
    queueFor('AgentDraft').push(
      { data: { id: 'd1', status: 'pending', contactId: 'c1', dealId: null, channel: 'email', subject: 'Hi', content: 'original body', outcome: null }, error: null },
      { data: { id: 'd1', status: 'approved' }, error: null },
      { data: { id: 'd1', status: 'sent' }, error: null },
    );
    queueFor('Contact').push({ data: { name: 'Alice', email: 'a@x.test', phone: null }, error: null });
    queueInboxWriteSuccess();
    queueFor('ContactActivity').push({ data: null, error: null });
    mockSendDraft.mockResolvedValue({ sent: true, method: 'email' });

    const res = await PATCH(
      makeReq({ status: 'approved', content: 'the realtor rewrote this entirely' }),
      params('d1'),
    );
    expect(res.status).toBe(200);

    // The body recorded on the thread must be the edited/sent text.
    expect(inboxMessage()!.body).toBe('the realtor rewrote this entirely');
    // And sendDraft was given the same edited text (sanity: we recorded what was sent).
    const sentArg = mockSendDraft.mock.calls[0][0] as { content: string };
    expect(sentArg.content).toBe('the realtor rewrote this entirely');
  });

  it('maps an SMS send to channel sms + ContactActivity type note (no sms activity type)', async () => {
    queueFor('AgentDraft').push(
      { data: { id: 'd1', status: 'pending', contactId: 'c1', dealId: null, channel: 'sms', subject: null, content: 'short sms', outcome: null }, error: null },
      { data: { id: 'd1', status: 'approved' }, error: null },
      { data: { id: 'd1', status: 'sent' }, error: null },
    );
    queueFor('Contact').push({ data: { name: 'Bob', email: null, phone: '+15551234' }, error: null });
    queueInboxWriteSuccess();
    queueFor('ContactActivity').push({ data: null, error: null });
    mockSendDraft.mockResolvedValue({ sent: true, method: 'sms' });

    const res = await PATCH(makeReq({ status: 'approved' }), params('d1'));
    expect(res.status).toBe(200);

    expect(inboxMessage()).toMatchObject({ channel: 'sms', subject: null });
    const activity = inserts.find((i) => i.table === 'ContactActivity')!.values as { type: string; metadata: Record<string, unknown> };
    expect(activity.type).toBe('note');
    expect(activity.metadata).toMatchObject({ channel: 'sms', via: 'sms' });
  });

  it('records nothing when delivery did NOT send (status approved, not sent)', async () => {
    queueFor('AgentDraft').push(
      { data: { id: 'd1', status: 'pending', contactId: 'c1', dealId: null, channel: 'email', subject: 'Hi', content: 'body', outcome: null }, error: null },
      { data: { id: 'd1', status: 'approved' }, error: null },
    );
    queueFor('Contact').push({ data: { name: 'Alice', email: 'a@x.test', phone: null }, error: null });
    mockSendDraft.mockResolvedValue({ sent: false, method: 'email', error: 'not_configured' });

    const res = await PATCH(makeReq({ status: 'approved' }), params('d1'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { deliveryResult: { sent: boolean } };
    expect(json.deliveryResult.sent).toBe(false);

    // No transcript + no activity for a send that never left the building.
    expect(inboxMessage()).toBeUndefined();
    expect(inserts.find((i) => i.table === 'ContactActivity')).toBeUndefined();
  });

  it('skips the record (no throw) when the draft has no contact', async () => {
    // Draft tied to a deal but no contact — a thread needs a contact, so skip.
    queueFor('AgentDraft').push(
      { data: { id: 'd1', status: 'pending', contactId: null, dealId: 'deal_1', channel: 'email', subject: 'Hi', content: 'body', outcome: null }, error: null },
      { data: { id: 'd1', status: 'approved' }, error: null },
      { data: { id: 'd1', status: 'sent' }, error: null },
    );
    // No Contact row is fetched when contactId is null; sendDraft still runs.
    mockSendDraft.mockResolvedValue({ sent: true, method: 'email' });

    const res = await PATCH(makeReq({ status: 'approved' }), params('d1'));
    expect(res.status).toBe(200);

    // No thread/message write reached for a contactless draft (safe wrapper
    // short-circuits on null contactId), and no contact-scoped activity either.
    expect(inboxMessage()).toBeUndefined();
    expect(inserts.find((i) => i.table === 'ContactActivity')).toBeUndefined();
  });

  it('still returns success when the inbox record throws (best-effort)', async () => {
    queueFor('AgentDraft').push(
      { data: { id: 'd1', status: 'pending', contactId: 'c1', dealId: null, channel: 'email', subject: 'Hi', content: 'body', outcome: null }, error: null },
      { data: { id: 'd1', status: 'approved' }, error: null },
      { data: { id: 'd1', status: 'sent' }, error: null },
    );
    queueFor('Contact').push({ data: { name: 'Alice', email: 'a@x.test', phone: null }, error: null });
    // Thread upsert errors → recordOutboundMessage throws → safe wrapper swallows.
    queueFor('InboxThread').push({ data: null, error: { message: 'thread write blew up' } });
    queueFor('ContactActivity').push({ data: null, error: null });
    mockSendDraft.mockResolvedValue({ sent: true, method: 'email' });

    const res = await PATCH(makeReq({ status: 'approved' }), params('d1'));
    // The send already happened; a transcript failure must not fail the request.
    expect(res.status).toBe(200);
    const json = (await res.json()) as { deliveryResult: { sent: boolean } };
    expect(json.deliveryResult.sent).toBe(true);
  });

  it('still returns success when the ContactActivity insert throws (best-effort)', async () => {
    queueFor('AgentDraft').push(
      { data: { id: 'd1', status: 'pending', contactId: 'c1', dealId: null, channel: 'email', subject: 'Hi', content: 'body', outcome: null }, error: null },
      { data: { id: 'd1', status: 'approved' }, error: null },
      { data: { id: 'd1', status: 'sent' }, error: null },
    );
    queueFor('Contact').push({ data: { name: 'Alice', email: 'a@x.test', phone: null }, error: null });
    queueInboxWriteSuccess();
    // ContactActivity insert returns an error terminal → route try/catch fires.
    queueFor('ContactActivity').push({ data: null, error: { message: 'activity boom' } });
    mockSendDraft.mockResolvedValue({ sent: true, method: 'email' });

    const res = await PATCH(makeReq({ status: 'approved' }), params('d1'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { deliveryResult: { sent: boolean } };
    expect(json.deliveryResult.sent).toBe(true);
  });

  it('does not send when a concurrent approve already claimed the draft', async () => {
    queueFor('AgentDraft').push(
      { data: { id: 'd1', status: 'pending', contactId: 'c1', dealId: null, channel: 'email', subject: 'Hi', content: 'body', outcome: null }, error: null },
      { data: null, error: null },
    );
    queueFor('Contact').push({ data: { name: 'Alice', email: 'a@x.test', phone: null }, error: null });

    const res = await PATCH(makeReq({ status: 'approved' }), params('d1'));
    expect(res.status).toBe(409);
    expect(mockSendDraft).not.toHaveBeenCalled();
    expect(inboxMessage()).toBeUndefined();
    expect(inserts.find((i) => i.table === 'ContactActivity')).toBeUndefined();
  });

  it('does not record anything on a dismissed draft', async () => {
    queueFor('AgentDraft').push(
      { data: { id: 'd1', status: 'pending', contactId: 'c1', dealId: null, channel: 'email', subject: 'Hi', content: 'body', outcome: null }, error: null },
      { data: { id: 'd1', status: 'dismissed' }, error: null },
    );

    const res = await PATCH(makeReq({ status: 'dismissed' }), params('d1'));
    expect(res.status).toBe(200);
    expect(mockSendDraft).not.toHaveBeenCalled();
    expect(inboxMessage()).toBeUndefined();
    expect(inserts.find((i) => i.table === 'ContactActivity')).toBeUndefined();
  });
});
