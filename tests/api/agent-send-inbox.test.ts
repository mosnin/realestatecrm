/**
 * Route-level test for the Phase-2 inbox wire-in on `POST /api/agent/send`
 * (the autonomous / Modal-only send path).
 *
 * Phase 2 ADDS a recordOutboundMessage write ALONGSIDE the route's existing
 * ContactActivity write — the activity feeds the contact timeline, the inbox
 * record feeds the threaded transcript. The existing ContactActivity write is
 * left intact (asserted here too). Both are best-effort: a thread-write failure
 * must not turn a 200 send into an error.
 *
 * We run the REAL lib/inbox helpers (recordOutboundMessageSafe →
 * recordOutboundMessage) on top of the supabase mock, so the thread/message
 * writes the route triggers are observable as InboxThread/InboxMessage ops —
 * and a queued error terminal makes the record throw internally, exercising the
 * best-effort swallow for real (mocking only the export wouldn't, because the
 * safe wrapper calls its sibling by lexical reference).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// The route reads process.env.AGENT_INTERNAL_SECRET at MODULE LOAD. ES imports
// are hoisted above plain statements, so set the secret in a hoisted block that
// runs before the route module is evaluated, or every request 503s.
vi.hoisted(() => {
  process.env.AGENT_INTERNAL_SECRET = 'test-secret';
});

vi.mock('@/lib/email', () => ({ sendEmailFromCRM: vi.fn(async () => undefined) }));
vi.mock('@/lib/sms', () => ({ sendSMS: vi.fn(async () => true) }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Supabase mock — table-aware queue (inserts + upserts recorded) ───────────
type Terminal = { data?: unknown; error?: unknown };
const queues: Record<string, Terminal[]> = {};
const inserts: Array<{ table: string; values: unknown }> = [];

function queueFor(table: string) {
  if (!queues[table]) queues[table] = [];
  return queues[table];
}

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const q = queueFor(table);
    const terminal = q.shift() ?? { data: null, error: null };
    let isInsert = false;

    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.upsert = vi.fn(() => chain);
    chain.insert = vi.fn((values: unknown) => {
      isInsert = true;
      inserts.push({ table, values });
      return chain;
    });
    chain.maybeSingle = vi.fn(() => Promise.resolve(terminal));
    chain.single = vi.fn(() => Promise.resolve(terminal));
    chain.then = (resolve: (v: Terminal) => unknown, reject?: (e: unknown) => unknown) => {
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

// Import AFTER mocks. The secret is set in the vi.hoisted() block above so the
// route module sees it at load time.
import { POST } from '@/app/api/agent/send/route';
import { sendEmailFromCRM } from '@/lib/email';
import { sendSMS } from '@/lib/sms';

const mockSendEmail = vi.mocked(sendEmailFromCRM);
const mockSendSMS = vi.mocked(sendSMS);

function makeReq(body: unknown, auth = 'Bearer test-secret'): NextRequest {
  return new NextRequest('http://localhost/api/agent/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: auth },
    body: JSON.stringify(body),
  });
}

/** Queue the Contact lookup + SpaceSetting lookup the route does before sending. */
function queueContactAndSetting(contact: { id: string; name: string; email: string | null; phone: string | null }) {
  queueFor('Contact').push({ data: contact, error: null });
  queueFor('SpaceSetting').push({ data: { businessName: 'Test Realty' }, error: null });
}

/** Queue the InboxThread upsert + InboxMessage insert + InboxThread rollup
 *  terminals for one successful recordOutboundMessage call. */
function queueInboxWriteSuccess() {
  queueFor('InboxThread').push({ data: { id: 'thread_1', unreadCount: 0 }, error: null }); // upsert
  queueFor('InboxMessage').push({ data: { id: 'out_1' }, error: null }); // insert
  queueFor('InboxThread').push({ data: null, error: null }); // rollup update
}

/** The InboxMessage insert values from the most recent record write. */
function lastInboxMessage(): Record<string, unknown> | undefined {
  const m = inserts.filter((i) => i.table === 'InboxMessage').pop();
  return m?.values as Record<string, unknown> | undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(queues)) delete queues[k];
  inserts.length = 0;
  mockSendEmail.mockResolvedValue(undefined);
  mockSendSMS.mockResolvedValue(true);
});

describe('POST /api/agent/send — Phase 2 inbox wire-in', () => {
  it('writes BOTH a ContactActivity and an outbound InboxMessage on a successful email send', async () => {
    queueContactAndSetting({ id: 'c1', name: 'Alice', email: 'a@x.test', phone: null });
    queueFor('ContactActivity').push({ data: null, error: null });
    queueInboxWriteSuccess();

    const res = await POST(
      makeReq({ contactId: 'c1', spaceId: 'space_1', channel: 'email', content: 'hello there', subject: 'A note', runId: 'run_42' }),
    );
    expect(res.status).toBe(200);

    // Existing ContactActivity write preserved.
    const activity = inserts.find((i) => i.table === 'ContactActivity');
    expect(activity).toBeDefined();
    expect((activity!.values as { type: string }).type).toBe('email');

    // New inbox record: same field mapping, agentRunId in metadata, no draft id.
    const msg = lastInboxMessage();
    expect(msg).toMatchObject({
      spaceId: 'space_1',
      contactId: 'c1',
      direction: 'outbound',
      channel: 'email',
      body: 'hello there',
      subject: 'A note',
      agentDraftId: null,
    });
    expect(msg!.metadata).toMatchObject({ source: 'background_agent', agentRunId: 'run_42' });
  });

  it('records an SMS send with channel sms and no subject', async () => {
    queueContactAndSetting({ id: 'c1', name: 'Bob', email: null, phone: '+15551234' });
    queueFor('ContactActivity').push({ data: null, error: null });
    queueInboxWriteSuccess();

    const res = await POST(
      makeReq({ contactId: 'c1', spaceId: 'space_1', channel: 'sms', content: 'sms body', runId: 'run_7' }),
    );
    expect(res.status).toBe(200);

    expect(lastInboxMessage()).toMatchObject({
      channel: 'sms',
      body: 'sms body',
      subject: null,
    });
  });

  it('omits agentRunId from metadata when no runId is supplied', async () => {
    queueContactAndSetting({ id: 'c1', name: 'Alice', email: 'a@x.test', phone: null });
    queueFor('ContactActivity').push({ data: null, error: null });
    queueInboxWriteSuccess();

    const res = await POST(
      makeReq({ contactId: 'c1', spaceId: 'space_1', channel: 'email', content: 'hi', subject: 'S' }),
    );
    expect(res.status).toBe(200);
    const meta = lastInboxMessage()!.metadata as Record<string, unknown>;
    expect(meta.source).toBe('background_agent');
    expect('agentRunId' in meta).toBe(false);
  });

  it('still returns 200 success when the inbox record throws (best-effort)', async () => {
    queueContactAndSetting({ id: 'c1', name: 'Alice', email: 'a@x.test', phone: null });
    queueFor('ContactActivity').push({ data: null, error: null });
    // Thread upsert errors → recordOutboundMessage throws → safe wrapper swallows.
    queueFor('InboxThread').push({ data: null, error: { message: 'thread write blew up' } });

    const res = await POST(
      makeReq({ contactId: 'c1', spaceId: 'space_1', channel: 'email', content: 'hello', subject: 'S', runId: 'run_1' }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(true);
    // The send still happened.
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it('does not record when the send itself failed (e.g. SMS delivery failure)', async () => {
    queueContactAndSetting({ id: 'c1', name: 'Bob', email: null, phone: '+15551234' });
    mockSendSMS.mockResolvedValue(false);

    const res = await POST(
      makeReq({ contactId: 'c1', spaceId: 'space_1', channel: 'sms', content: 'sms body' }),
    );
    expect(res.status).toBe(502);
    // The route returns before reaching either write.
    expect(inserts.find((i) => i.table === 'InboxMessage')).toBeUndefined();
    expect(inserts.find((i) => i.table === 'ContactActivity')).toBeUndefined();
  });
});
