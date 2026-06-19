/**
 * Route-level test for the Phase-3 inbox dual-write on `POST /api/agent/inbound`
 * (the internal inbound-reply webhook).
 *
 * Phase 3 ADDS a recordInboundMessage write ALONGSIDE the route's existing
 * ContactActivity write + inbound-trigger fire — the activity feeds the contact
 * timeline, the inbox record feeds the threaded transcript. Both prior behaviors
 * are left intact (asserted here too). The inbox write is best-effort: a
 * thread-write failure must not turn a 200 into an error and must not skip the
 * inbound-trigger fire.
 *
 * We run the REAL lib/inbox helper (recordInboundMessage) on top of the supabase
 * mock, so the thread/message writes the route triggers are observable as
 * InboxThread/InboxMessage ops — and a queued error terminal makes the record
 * throw internally, exercising the best-effort swallow for real.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// The route reads process.env.AGENT_INTERNAL_SECRET at MODULE LOAD. ES imports
// are hoisted above plain statements, so set the secret in a hoisted block that
// runs before the route module is evaluated, or every request 503s.
vi.hoisted(() => {
  process.env.AGENT_INTERNAL_SECRET = 'test-secret';
});

vi.mock('@/lib/agent/fire-trigger', () => ({
  fireAgentTrigger: vi.fn(async () => ({ fired: true })),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Supabase mock — table-aware queue (inserts + upserts recorded) ───────────
type Terminal = { data?: unknown; error?: unknown };
const queues: Record<string, Terminal[]> = {};
const inserts: Array<{ table: string; values: unknown }> = [];
const upserts: Array<{ table: string; values: unknown }> = [];

function queueFor(table: string) {
  if (!queues[table]) queues[table] = [];
  return queues[table];
}

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const q = queueFor(table);
    const terminal = q.shift() ?? { data: null, error: null };

    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.ilike = vi.fn(() => chain);
    chain.upsert = vi.fn((values: unknown) => {
      upserts.push({ table, values });
      return chain;
    });
    chain.update = vi.fn(() => chain);
    chain.insert = vi.fn((values: unknown) => {
      inserts.push({ table, values });
      return chain;
    });
    chain.maybeSingle = vi.fn(() => Promise.resolve(terminal));
    chain.single = vi.fn(() => Promise.resolve(terminal));
    // Real supabase-js resolves (never rejects) to { data, error }. The route
    // and lib/inbox both branch on the returned `error` field; lib/inbox throws
    // it internally, the route checks it inline.
    chain.then = (resolve: (v: Terminal) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(terminal).then(resolve, reject);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

// Import AFTER mocks. The secret is set in the vi.hoisted() block above so the
// route module sees it at load time.
import { POST } from '@/app/api/agent/inbound/route';
import { fireAgentTrigger } from '@/lib/agent/fire-trigger';

const mockFireTrigger = vi.mocked(fireAgentTrigger);

function makeReq(body: unknown, auth = 'Bearer test-secret'): NextRequest {
  return new NextRequest('http://localhost/api/agent/inbound', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: auth },
    body: JSON.stringify(body),
  });
}

/** Queue the Contact validate lookup the route does before any write. */
function queueContact(contact: { id: string; name: string; leadScore?: number }) {
  queueFor('Contact').push({ data: contact, error: null });
}

/** Queue the InboxThread upsert + InboxMessage insert + InboxThread rollup
 *  terminals for one successful recordInboundMessage call. */
function queueInboxWriteSuccess() {
  queueFor('InboxThread').push({ data: { id: 'thread_1', unreadCount: 0 }, error: null }); // upsert
  queueFor('InboxMessage').push({ data: { id: 'in_1' }, error: null }); // insert
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
  upserts.length = 0;
  mockFireTrigger.mockResolvedValue({ fired: true } as never);
});

describe('POST /api/agent/inbound — Phase 3 inbox dual-write', () => {
  it('writes a ContactActivity, an inbound InboxMessage, AND fires the inbound trigger', async () => {
    queueContact({ id: 'c1', name: 'Alice' });
    queueFor('ContactActivity').push({ data: null, error: null }); // activity insert
    queueInboxWriteSuccess();
    // Contact lastContactedAt update (awaited, no .single()).
    queueFor('Contact').push({ data: null, error: null });

    const res = await POST(
      makeReq({ contactId: 'c1', spaceId: 'space_1', channel: 'email', content: 'Yes, still interested', draftId: 'draft_9' }),
    );
    expect(res.status).toBe(200);

    // Existing ContactActivity write preserved (with the inbound tag + metadata).
    const activity = inserts.find((i) => i.table === 'ContactActivity');
    expect(activity).toBeDefined();
    expect((activity!.values as { type: string }).type).toBe('note');
    expect((activity!.values as { content: string }).content).toContain('[Inbound EMAIL]');

    // New inbox record: inbound direction, channel email, source tag in metadata.
    const msg = lastInboxMessage();
    expect(msg).toMatchObject({
      spaceId: 'space_1',
      contactId: 'c1',
      direction: 'inbound',
      channel: 'email',
      body: 'Yes, still interested',
    });
    expect(msg!.metadata).toMatchObject({ source: 'agent_inbound', draftId: 'draft_9' });

    // Existing inbound-trigger fire preserved.
    expect(mockFireTrigger).toHaveBeenCalledTimes(1);
    expect(mockFireTrigger).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: 'space_1', event: 'inbound_message', contactId: 'c1' }),
    );
  });

  it('records an SMS reply with channel sms', async () => {
    queueContact({ id: 'c1', name: 'Bob' });
    queueFor('ContactActivity').push({ data: null, error: null });
    queueInboxWriteSuccess();
    queueFor('Contact').push({ data: null, error: null });

    const res = await POST(
      makeReq({ contactId: 'c1', spaceId: 'space_1', channel: 'sms', content: 'sounds good' }),
    );
    expect(res.status).toBe(200);
    expect(lastInboxMessage()).toMatchObject({ channel: 'sms', direction: 'inbound', body: 'sounds good' });
  });

  it('still returns 200 AND fires the trigger when the inbox record throws (best-effort)', async () => {
    queueContact({ id: 'c1', name: 'Alice' });
    queueFor('ContactActivity').push({ data: null, error: null });
    // Thread upsert errors → recordInboundMessage throws → route swallows.
    queueFor('InboxThread').push({ data: null, error: { code: 'XX', message: 'thread write blew up' } });
    queueFor('Contact').push({ data: null, error: null });

    const res = await POST(
      makeReq({ contactId: 'c1', spaceId: 'space_1', channel: 'email', content: 'hello' }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { recorded: boolean };
    expect(json.recorded).toBe(true);
    // The inbound trigger STILL fired despite the inbox write failing.
    expect(mockFireTrigger).toHaveBeenCalledTimes(1);
  });

  it('does NOT write the inbox message when the ContactActivity write fails (returns 500)', async () => {
    queueContact({ id: 'c1', name: 'Alice' });
    // ContactActivity insert errors → route returns 500 before the inbox write.
    queueFor('ContactActivity').push({ data: null, error: { message: 'activity blew up' } });

    const res = await POST(
      makeReq({ contactId: 'c1', spaceId: 'space_1', channel: 'email', content: 'hello' }),
    );
    expect(res.status).toBe(500);
    expect(inserts.find((i) => i.table === 'InboxMessage')).toBeUndefined();
    expect(mockFireTrigger).not.toHaveBeenCalled();
  });

  it('returns 404 (no writes) when the contact is not in the stated space', async () => {
    queueFor('Contact').push({ data: null, error: null }); // contact lookup miss

    const res = await POST(
      makeReq({ contactId: 'nope', spaceId: 'space_1', channel: 'email', content: 'hello' }),
    );
    expect(res.status).toBe(404);
    expect(inserts.find((i) => i.table === 'InboxMessage')).toBeUndefined();
    expect(inserts.find((i) => i.table === 'ContactActivity')).toBeUndefined();
  });

  it('rejects an unauthorized request before any write', async () => {
    const res = await POST(
      makeReq({ contactId: 'c1', spaceId: 'space_1', channel: 'email', content: 'hi' }, 'Bearer wrong'),
    );
    expect(res.status).toBe(401);
    expect(inserts.length).toBe(0);
  });
});
