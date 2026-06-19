/**
 * Write helpers for the threaded inbox (tables "InboxThread" / "InboxMessage",
 * see supabase/migrations/20260724000000_inbox.sql).
 *
 * This is the SINGLE SOURCE OF TRUTH for recording messages on a contact's
 * thread — later phases call exactly these helpers from the inbound-capture
 * path, the outbound/approved-draft send path, and the inbox UI. Phase 1 ships
 * the helpers only; nothing calls them yet.
 *
 * Threading model: one thread per (spaceId, contactId). The channel lives on
 * each message, so a single thread interleaves email / sms / portal / note.
 *
 * Semantics (server-internal — these run only behind the service-role client in
 * @/lib/supabase, which BYPASSES RLS):
 *   - These are NOT best-effort: a hard DB error throws, because dropping a
 *     captured/sent message silently would lose the transcript. (Callers in
 *     later phases decide their own try/catch posture.)
 *   - EXCEPT the dedupe race, which is handled internally: webhooks are
 *     at-least-once, so the same externalId can arrive twice (possibly
 *     concurrently). Dedupe is anchored on the partial unique index
 *     (spaceId, channel, externalId): we pre-check, and if a concurrent insert
 *     beats us we catch the unique violation and re-select the winner. Either
 *     path returns the existing row with deduped:true and writes nothing new.
 */

import { supabase } from '@/lib/supabase';
import type { InboxChannel, InboxDirection } from '@/lib/types';

/** Postgres unique_violation — raised when the partial unique index on
 *  (spaceId, channel, externalId) rejects a concurrent duplicate insert. */
const PG_UNIQUE_VIOLATION = '23505';

export interface RecordInboundArgs {
  spaceId: string;
  contactId: string;
  channel: InboxChannel;
  body: string;
  subject?: string | null;
  /** Provider message id. When present, makes the write idempotent. */
  externalId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface RecordOutboundArgs {
  spaceId: string;
  contactId: string;
  channel: InboxChannel;
  body: string;
  subject?: string | null;
  /** Provider message id. When present, makes the write idempotent. */
  externalId?: string | null;
  /** The approved AgentDraft this send came from, when applicable. */
  agentDraftId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface RecordMessageResult {
  threadId: string;
  messageId: string;
  /** True when an existing message with the same externalId was found and this
   *  call was a no-op (no new row, no thread rollup change). */
  deduped: boolean;
}

/** A persisted message id + whether it already existed (dedupe hit). */
interface ExistingMessage {
  id: string;
  threadId: string;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === PG_UNIQUE_VIOLATION
  );
}

/**
 * Look up an already-recorded message by its idempotency key
 * (spaceId, channel, externalId). Returns null when none exists. Used both as
 * the pre-insert dedupe check and as the post-conflict re-select on a race.
 */
async function findByExternalId(
  spaceId: string,
  channel: InboxChannel,
  externalId: string,
): Promise<ExistingMessage | null> {
  const { data, error } = await supabase
    .from('InboxMessage')
    .select('id, threadId')
    .eq('spaceId', spaceId)
    .eq('channel', channel)
    .eq('externalId', externalId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as { id: string; threadId: string };
  return { id: row.id, threadId: row.threadId };
}

/**
 * Upsert the contact's thread and return its current id + unreadCount.
 * Anchored on the (spaceId, contactId) unique constraint, so a second caller
 * for the same contact reuses the one thread instead of creating a second.
 *
 * The upsert touches only `updatedAt` (and inserts the defaults on first
 * create); the direction / lastMessageAt / unreadCount rollup is applied by the
 * caller in a follow-up update once the message row exists, so the rollup always
 * reflects a message that was actually written.
 */
async function upsertThread(
  spaceId: string,
  contactId: string,
): Promise<{ id: string; unreadCount: number }> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('InboxThread')
    .upsert(
      { spaceId, contactId, updatedAt: now },
      { onConflict: 'spaceId,contactId' },
    )
    .select('id, unreadCount')
    .single();
  if (error) throw error;
  const row = data as { id: string; unreadCount: number };
  return { id: row.id, unreadCount: row.unreadCount ?? 0 };
}

/**
 * Record an INBOUND message on the contact's thread.
 *
 * Upserts the thread, inserts the inbound message, then bumps the thread rollup
 * (lastMessageAt=now, lastDirection='inbound', unreadCount += 1).
 *
 * Idempotent when `externalId` is provided: if a message already exists for
 * (spaceId, channel, externalId) — checked up front, and again on a concurrent
 * unique-violation — this is a no-op that returns the existing row with
 * deduped:true (the thread rollup is NOT bumped a second time).
 */
export async function recordInboundMessage(
  args: RecordInboundArgs,
): Promise<RecordMessageResult> {
  const { spaceId, contactId, channel, body } = args;
  const externalId = args.externalId ?? null;

  // Dedupe pre-check: a duplicate delivery is a no-op.
  if (externalId) {
    const existing = await findByExternalId(spaceId, channel, externalId);
    if (existing) {
      return { threadId: existing.threadId, messageId: existing.id, deduped: true };
    }
  }

  const thread = await upsertThread(spaceId, contactId);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('InboxMessage')
    .insert({
      spaceId,
      threadId: thread.id,
      contactId,
      direction: 'inbound' satisfies InboxDirection,
      channel,
      subject: args.subject ?? null,
      body,
      externalId,
      metadata: args.metadata ?? null,
    })
    .select('id')
    .single();

  if (error) {
    // Lost the race: a concurrent delivery with the same externalId inserted
    // first. Re-select the winner and report it as a dedupe — never a dup row,
    // and crucially we skip the rollup bump below.
    if (externalId && isUniqueViolation(error)) {
      const existing = await findByExternalId(spaceId, channel, externalId);
      if (existing) {
        return { threadId: existing.threadId, messageId: existing.id, deduped: true };
      }
    }
    throw error;
  }

  const messageId = (data as { id: string }).id;

  // Bump the rollup now that the inbound message is durably written.
  const { error: bumpError } = await supabase
    .from('InboxThread')
    .update({
      lastMessageAt: now,
      lastDirection: 'inbound' satisfies InboxDirection,
      unreadCount: thread.unreadCount + 1,
      updatedAt: now,
    })
    .eq('id', thread.id);
  if (bumpError) throw bumpError;

  return { threadId: thread.id, messageId, deduped: false };
}

/**
 * Record an OUTBOUND message on the contact's thread.
 *
 * Upserts the thread, inserts the outbound message, then updates the thread
 * rollup (lastMessageAt=now, lastDirection='outbound'). Does NOT touch
 * unreadCount — unread tracks inbound only.
 *
 * Idempotent when `externalId` is provided, identical to the inbound path.
 */
export async function recordOutboundMessage(
  args: RecordOutboundArgs,
): Promise<RecordMessageResult> {
  const { spaceId, contactId, channel, body } = args;
  const externalId = args.externalId ?? null;

  if (externalId) {
    const existing = await findByExternalId(spaceId, channel, externalId);
    if (existing) {
      return { threadId: existing.threadId, messageId: existing.id, deduped: true };
    }
  }

  const thread = await upsertThread(spaceId, contactId);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('InboxMessage')
    .insert({
      spaceId,
      threadId: thread.id,
      contactId,
      direction: 'outbound' satisfies InboxDirection,
      channel,
      subject: args.subject ?? null,
      body,
      externalId,
      agentDraftId: args.agentDraftId ?? null,
      metadata: args.metadata ?? null,
    })
    .select('id')
    .single();

  if (error) {
    if (externalId && isUniqueViolation(error)) {
      const existing = await findByExternalId(spaceId, channel, externalId);
      if (existing) {
        return { threadId: existing.threadId, messageId: existing.id, deduped: true };
      }
    }
    throw error;
  }

  const messageId = (data as { id: string }).id;

  // Flip the rollup to outbound. unreadCount is intentionally left untouched.
  const { error: bumpError } = await supabase
    .from('InboxThread')
    .update({
      lastMessageAt: now,
      lastDirection: 'outbound' satisfies InboxDirection,
      updatedAt: now,
    })
    .eq('id', thread.id);
  if (bumpError) throw bumpError;

  return { threadId: thread.id, messageId, deduped: false };
}

/**
 * Mark a thread read: stamp readAt on its unread inbound messages and zero the
 * thread's unreadCount. Scoped by spaceId as a defensive guard so a stray
 * threadId from another space can't be touched. (Wired in Phase 4 — included
 * now so the storage layer is complete.)
 */
export async function markThreadRead(
  threadId: string,
  spaceId: string,
): Promise<void> {
  const now = new Date().toISOString();

  // Stamp only the still-unread inbound messages (readAt IS NULL) so we don't
  // rewrite already-read history.
  const { error: msgError } = await supabase
    .from('InboxMessage')
    .update({ readAt: now })
    .eq('threadId', threadId)
    .eq('spaceId', spaceId)
    .eq('direction', 'inbound')
    .is('readAt', null);
  if (msgError) throw msgError;

  const { error: threadError } = await supabase
    .from('InboxThread')
    .update({ unreadCount: 0, updatedAt: now })
    .eq('id', threadId)
    .eq('spaceId', spaceId);
  if (threadError) throw threadError;
}
