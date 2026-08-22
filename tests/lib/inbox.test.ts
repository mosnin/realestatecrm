/**
 * Unit tests for lib/inbox.ts — the threaded-inbox write helpers
 * (recordInboundMessage / recordOutboundMessage / markThreadRead).
 *
 * Contract under test:
 *   - recordInbound upserts the contact's thread, inserts an inbound message,
 *     and bumps the rollup (lastDirection='inbound', unreadCount += 1).
 *   - A second recordInbound with the same externalId DEDUPES: no new message,
 *     no second rollup bump; returns the existing message with deduped:true.
 *   - recordOutbound appends a message, flips lastDirection to 'outbound', and
 *     does NOT touch unreadCount.
 *   - The thread upsert is anchored on (spaceId, contactId) — one thread per
 *     contact per space (onConflict assertion).
 *   - markThreadRead stamps unread inbound messages and zeroes unreadCount.
 *
 * Supabase mocking mirrors the per-table chainable pattern in
 * tests/api/contacts-merge.test.ts: every builder method is chainable and a
 * per-table queue of terminal results is drained by the resolving methods
 * (.single / .maybeSingle / await). Each table also records the ops invoked on
 * it (op name + first arg) so assertions can inspect what was written.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

type Terminal = { data?: unknown; error?: unknown };
type Op = { op: string; arg: unknown; arg2?: unknown };

// Per-table queue of terminal results, drained FIFO by single/maybeSingle/await.
const queues: Record<string, Terminal[]> = {};
// Per-table log of operations performed (for assertions).
const ops: Record<string, Op[]> = {};

function queueFor(table: string): Terminal[] {
  if (!queues[table]) queues[table] = [];
  return queues[table];
}
function opsFor(table: string): Op[] {
  if (!ops[table]) ops[table] = [];
  return ops[table];
}
/** Queue the next terminal result for `table` (FIFO). */
function enqueue(table: string, t: Terminal): void {
  queueFor(table).push(t);
}

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const log = opsFor(table);
    const resolve = (): Terminal =>
      queueFor(table).shift() ?? { data: null, error: null };

    const chain: Record<string, unknown> = {};
    const passthrough =
      (name: string) =>
      (arg?: unknown, arg2?: unknown) => {
        log.push({ op: name, arg, arg2 });
        return chain;
      };

    chain.insert = passthrough('insert');
    chain.upsert = passthrough('upsert');
    chain.update = passthrough('update');
    chain.select = passthrough('select');
    chain.eq = passthrough('eq');
    chain.is = passthrough('is');
    chain.in = passthrough('in');
    chain.order = passthrough('order');
    chain.limit = passthrough('limit');
    chain.single = vi.fn(() => Promise.resolve(resolve()));
    chain.maybeSingle = vi.fn(() => Promise.resolve(resolve()));
    // Bare `await builder` (update().eq() with no .single()) resolves here.
    chain.then = (onF: (v: Terminal) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(resolve()).then(onF, onR);
    return chain;
  }
  return {
    supabase: { from: vi.fn((table: string) => makeChain(table)) },
  };
});

import {
  recordInboundMessage,
  recordOutboundMessage,
  recordOutboundMessageSafe,
  markThreadRead,
} from '@/lib/inbox';

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(queues)) delete queues[k];
  for (const k of Object.keys(ops)) delete ops[k];
});

/** All ops recorded on a table, in order. */
function tableOps(table: string): Op[] {
  return ops[table] ?? [];
}
/** First op with the given name on a table. */
function firstOp(table: string, name: string): Op | undefined {
  return tableOps(table).find((o) => o.op === name);
}
/** Count ops with the given name on a table. */
function countOp(table: string, name: string): number {
  return tableOps(table).filter((o) => o.op === name).length;
}

describe('recordInboundMessage', () => {
  it('upserts the thread, inserts an inbound message, bumps unreadCount', async () => {
    // 1) thread upsert → returns the thread row (unreadCount currently 2)
    enqueue('InboxThread', { data: { id: 'thread_1', unreadCount: 2 }, error: null });
    // 2) message insert → returns the new message id
    enqueue('InboxMessage', { data: { id: 'msg_1' }, error: null });
    // 3) thread rollup update → ok
    enqueue('InboxThread', { data: null, error: null });

    const res = await recordInboundMessage({
      spaceId: 'space_1',
      contactId: 'contact_1',
      channel: 'email',
      subject: 'Hi',
      body: 'Is the condo still available?',
    });

    expect(res).toEqual({ threadId: 'thread_1', messageId: 'msg_1', deduped: false });

    // Thread upsert anchored on (spaceId, contactId).
    const upsert = firstOp('InboxThread', 'upsert');
    expect(upsert?.arg).toMatchObject({ spaceId: 'space_1', contactId: 'contact_1' });
    expect(upsert?.arg2).toMatchObject({ onConflict: 'spaceId,contactId' });

    // Inbound message row.
    const insert = firstOp('InboxMessage', 'insert')!.arg as Record<string, unknown>;
    expect(insert).toMatchObject({
      spaceId: 'space_1',
      threadId: 'thread_1',
      contactId: 'contact_1',
      direction: 'inbound',
      channel: 'email',
      subject: 'Hi',
      body: 'Is the condo still available?',
      externalId: null,
    });

    // Rollup bump: lastDirection inbound, unreadCount incremented from 2 → 3.
    const update = tableOps('InboxThread').find((o) => o.op === 'update')!.arg as Record<string, unknown>;
    expect(update).toMatchObject({ lastDirection: 'inbound', unreadCount: 3 });
    expect(typeof update.lastMessageAt).toBe('string');
  });

  it('starts unreadCount at 1 for a brand-new thread (count 0 → 1)', async () => {
    enqueue('InboxThread', { data: { id: 'thread_new', unreadCount: 0 }, error: null });
    enqueue('InboxMessage', { data: { id: 'msg_new' }, error: null });
    enqueue('InboxThread', { data: null, error: null });

    await recordInboundMessage({
      spaceId: 'space_1',
      contactId: 'contact_2',
      channel: 'sms',
      body: 'hello',
    });

    const update = tableOps('InboxThread').find((o) => o.op === 'update')!.arg as Record<string, unknown>;
    expect(update.unreadCount).toBe(1);
  });

  it('dedupes on a repeat externalId: no new message, no second bump', async () => {
    // Pre-check finds an existing message → short-circuit.
    enqueue('InboxMessage', { data: { id: 'msg_existing', threadId: 'thread_1' }, error: null });

    const res = await recordInboundMessage({
      spaceId: 'space_1',
      contactId: 'contact_1',
      channel: 'email',
      body: 'dup delivery',
      externalId: 'gmail-abc-123',
    });

    expect(res).toEqual({ threadId: 'thread_1', messageId: 'msg_existing', deduped: true });
    // Dedupe path must NOT write anything.
    expect(countOp('InboxMessage', 'insert')).toBe(0);
    expect(countOp('InboxThread', 'upsert')).toBe(0);
    expect(countOp('InboxThread', 'update')).toBe(0);
    // The pre-check filtered on the full idempotency key.
    const eqs = tableOps('InboxMessage').filter((o) => o.op === 'eq').map((o) => o.arg);
    expect(eqs).toEqual(expect.arrayContaining(['spaceId', 'channel', 'externalId']));
  });

  it('handles the concurrent-insert race: unique violation → re-select winner', async () => {
    // Pre-check: no existing row (the racing insert has not landed yet).
    enqueue('InboxMessage', { data: null, error: null });
    // Thread upsert ok.
    enqueue('InboxThread', { data: { id: 'thread_1', unreadCount: 0 }, error: null });
    // Insert loses the race → Postgres unique_violation.
    enqueue('InboxMessage', { data: null, error: { code: '23505', message: 'duplicate key' } });
    // Re-select finds the winner.
    enqueue('InboxMessage', { data: { id: 'msg_winner', threadId: 'thread_1' }, error: null });

    const res = await recordInboundMessage({
      spaceId: 'space_1',
      contactId: 'contact_1',
      channel: 'email',
      body: 'racy',
      externalId: 'gmail-race-1',
    });

    expect(res).toEqual({ threadId: 'thread_1', messageId: 'msg_winner', deduped: true });
    // The losing insert was attempted exactly once; no rollup bump happened.
    expect(countOp('InboxMessage', 'insert')).toBe(1);
    expect(countOp('InboxThread', 'update')).toBe(0);
  });

  it('throws on a non-dedupe insert error', async () => {
    enqueue('InboxThread', { data: { id: 'thread_1', unreadCount: 0 }, error: null });
    enqueue('InboxMessage', { data: null, error: { code: '500', message: 'boom' } });

    await expect(
      recordInboundMessage({ spaceId: 'space_1', contactId: 'c', channel: 'note', body: 'x' }),
    ).rejects.toMatchObject({ message: 'boom' });
  });
});

describe('recordOutboundMessage', () => {
  it('appends an outbound message, flips lastDirection, leaves unreadCount alone', async () => {
    enqueue('InboxThread', { data: { id: 'thread_1', unreadCount: 5 }, error: null });
    enqueue('InboxMessage', { data: { id: 'out_1' }, error: null });
    enqueue('InboxThread', { data: null, error: null });

    const res = await recordOutboundMessage({
      spaceId: 'space_1',
      contactId: 'contact_1',
      channel: 'email',
      body: 'Yes — here are three times that work.',
      agentDraftId: 'draft_9',
    });

    expect(res).toEqual({ threadId: 'thread_1', messageId: 'out_1', deduped: false });

    const insert = firstOp('InboxMessage', 'insert')!.arg as Record<string, unknown>;
    expect(insert).toMatchObject({
      direction: 'outbound',
      channel: 'email',
      agentDraftId: 'draft_9',
    });

    const update = tableOps('InboxThread').find((o) => o.op === 'update')!.arg as Record<string, unknown>;
    expect(update).toMatchObject({ lastDirection: 'outbound' });
    // unreadCount must NOT be in the outbound rollup update.
    expect('unreadCount' in update).toBe(false);
  });

  it('dedupes outbound on a repeat externalId', async () => {
    enqueue('InboxMessage', { data: { id: 'out_existing', threadId: 'thread_1' }, error: null });

    const res = await recordOutboundMessage({
      spaceId: 'space_1',
      contactId: 'contact_1',
      channel: 'sms',
      body: 'dup send',
      externalId: 'twilio-sid-1',
    });

    expect(res).toEqual({ threadId: 'thread_1', messageId: 'out_existing', deduped: true });
    expect(countOp('InboxMessage', 'insert')).toBe(0);
    expect(countOp('InboxThread', 'update')).toBe(0);
  });
});

describe('recordOutboundMessageSafe (best-effort wrapper)', () => {
  it('delegates to recordOutboundMessage and returns its result on the happy path', async () => {
    enqueue('InboxThread', { data: { id: 'thread_1', unreadCount: 0 }, error: null });
    enqueue('InboxMessage', { data: { id: 'out_1' }, error: null });
    enqueue('InboxThread', { data: null, error: null });

    const res = await recordOutboundMessageSafe({
      spaceId: 'space_1',
      contactId: 'contact_1',
      channel: 'email',
      body: 'hi',
      agentDraftId: 'draft_1',
    });

    expect(res).toEqual({ threadId: 'thread_1', messageId: 'out_1', deduped: false });
    const insert = firstOp('InboxMessage', 'insert')!.arg as Record<string, unknown>;
    expect(insert).toMatchObject({ direction: 'outbound', agentDraftId: 'draft_1' });
  });

  it('returns null and writes nothing when contactId is missing (a thread needs a contact)', async () => {
    const res = await recordOutboundMessageSafe({
      spaceId: 'space_1',
      contactId: null,
      channel: 'email',
      body: 'hi',
    });

    expect(res).toBeNull();
    // No DB work at all — not even a thread upsert.
    expect(countOp('InboxThread', 'upsert')).toBe(0);
    expect(countOp('InboxMessage', 'insert')).toBe(0);
  });

  it('swallows a record error and returns null instead of throwing (send must not fail)', async () => {
    // Thread upsert errors → recordOutboundMessage throws → wrapper swallows.
    enqueue('InboxThread', { data: null, error: { message: 'db down' } });

    const res = await recordOutboundMessageSafe({
      spaceId: 'space_1',
      contactId: 'contact_1',
      channel: 'sms',
      body: 'hi',
    });

    expect(res).toBeNull();
  });
});

describe('thread upsert is one-per-(space, contact)', () => {
  it('inbound then outbound for the same contact both upsert on the same conflict key', async () => {
    // inbound
    enqueue('InboxThread', { data: { id: 'thread_1', unreadCount: 0 }, error: null });
    enqueue('InboxMessage', { data: { id: 'm1' }, error: null });
    enqueue('InboxThread', { data: null, error: null });
    await recordInboundMessage({ spaceId: 'space_1', contactId: 'contact_1', channel: 'email', body: 'in' });

    // outbound (same contact)
    enqueue('InboxThread', { data: { id: 'thread_1', unreadCount: 1 }, error: null });
    enqueue('InboxMessage', { data: { id: 'm2' }, error: null });
    enqueue('InboxThread', { data: null, error: null });
    await recordOutboundMessage({ spaceId: 'space_1', contactId: 'contact_1', channel: 'email', body: 'out' });

    const upserts = tableOps('InboxThread').filter((o) => o.op === 'upsert');
    expect(upserts).toHaveLength(2);
    for (const u of upserts) {
      expect(u.arg).toMatchObject({ spaceId: 'space_1', contactId: 'contact_1' });
      expect(u.arg2).toMatchObject({ onConflict: 'spaceId,contactId' });
    }
  });
});

describe('markThreadRead', () => {
  it('stamps unread inbound messages and zeroes unreadCount', async () => {
    enqueue('InboxMessage', { data: null, error: null }); // message update
    enqueue('InboxThread', { data: null, error: null }); // thread update

    await markThreadRead('thread_1', 'space_1');

    // Message update: readAt stamped, scoped to inbound + unread + this thread/space.
    const msgUpdate = firstOp('InboxMessage', 'update')!.arg as Record<string, unknown>;
    expect(typeof msgUpdate.readAt).toBe('string');
    const msgEqs = tableOps('InboxMessage').filter((o) => o.op === 'eq');
    expect(msgEqs.map((o) => [o.arg, o.arg2])).toEqual(
      expect.arrayContaining([
        ['threadId', 'thread_1'],
        ['spaceId', 'space_1'],
        ['direction', 'inbound'],
      ]),
    );
    // Only-unread guard.
    const isOp = firstOp('InboxMessage', 'is');
    expect([isOp?.arg, isOp?.arg2]).toEqual(['readAt', null]);

    // Thread update: unreadCount zeroed, scoped by id + space.
    const threadUpdate = firstOp('InboxThread', 'update')!.arg as Record<string, unknown>;
    expect(threadUpdate).toMatchObject({ unreadCount: 0 });
    const threadEqs = tableOps('InboxThread').filter((o) => o.op === 'eq');
    expect(threadEqs.map((o) => [o.arg, o.arg2])).toEqual(
      expect.arrayContaining([
        ['id', 'thread_1'],
        ['spaceId', 'space_1'],
      ]),
    );
  });

  it('scopes a foreign threadId to the caller space (no cross-tenant write)', async () => {
    enqueue('InboxMessage', { data: null, error: null });
    enqueue('InboxThread', { data: null, error: null });

    await markThreadRead('thread_victim', 'space_caller');

    const msgEqs = tableOps('InboxMessage').filter((o) => o.op === 'eq');
    expect(msgEqs.map((o) => [o.arg, o.arg2])).toEqual(
      expect.arrayContaining([
        ['threadId', 'thread_victim'],
        ['spaceId', 'space_caller'],
      ]),
    );
    expect(msgEqs).not.toContainEqual(expect.objectContaining({ arg: 'spaceId', arg2: 'space_victim' }));

    const threadEqs = tableOps('InboxThread').filter((o) => o.op === 'eq');
    expect(threadEqs.map((o) => [o.arg, o.arg2])).toEqual(
      expect.arrayContaining([
        ['id', 'thread_victim'],
        ['spaceId', 'space_caller'],
      ]),
    );
  });

  it('throws when the message update errors', async () => {
    enqueue('InboxMessage', { data: null, error: { message: 'db down' } });
    await expect(markThreadRead('thread_1', 'space_1')).rejects.toMatchObject({ message: 'db down' });
  });
});
