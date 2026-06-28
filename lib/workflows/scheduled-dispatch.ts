/**
 * Scheduled-message DISPATCHER — the deferred half of the workflow send story.
 *
 * A workflow `schedule_message` action records a "ScheduledMessage" row with a
 * future `sendAt` (lib/workflows/actions.ts). This module is the consumer: the
 * scheduled-message cron (app/api/cron/scheduled-messages) calls
 * `dispatchDueScheduledMessages`, which loads every due row (status 'pending',
 * sendAt <= now) and processes each per its `autonomy`.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * SAFETY — the product rule is "Chippi never sends without a tap" UNLESS the
 * realtor set the workflow to autonomy='auto'. This module is the enforcement
 * point:
 *
 *   'draft'  → DRAFT only. runAutonomousInstruction drafts (AgentDraft rows);
 *              status → 'drafted'. NEVER sends.
 *   'notify' → DRAFT + notify the realtor a draft is ready (notifyDraftReady);
 *              status → 'drafted'. NEVER sends.
 *   'auto'   → ACTUALLY SEND, but only behind FOUR rails, all required:
 *                0. CLAIM — claimForSend atomically flips the row 'pending'→
 *                   'sending', GUARDED on the current status, IMMEDIATELY before
 *                   the irreversible client send. Exactly one tick can win the
 *                   flip; a loser (zero rows claimed) returns 'skipped' and never
 *                   sends. This closes the duplicate-send hole: if the function is
 *                   killed in the window between the send succeeding and the
 *                   terminal-status write, the row is already 'sending' (not
 *                   'pending'), so the due scan excludes it and the next tick will
 *                   NOT re-send. A row stuck in 'sending' (claimed, then crashed
 *                   pre-send) simply never sends — the SAFE failure: a missed
 *                   send, never a DUPLICATE real message to a client. (A future
 *                   stale-'sending' reclaim cron is a follow-up.)
 *                1. RATE LIMIT — AFTER a successful claim, count the ACTUAL
 *                   ScheduledMessage rows this space already SENT in the last
 *                   hour. At/over AUTO_SEND_MAX → RELEASE the claim ('sending'→
 *                   'pending') and DEFER, retried next tick. Counting real sends
 *                   (not Redis tokens) means a lost claim or a deferred row never
 *                   spends from the budget — only a row that actually went out does.
 *                2. AUDIT — every send writes a ContactActivity row + an inbox
 *                   transcript entry (recordOutboundMessageSafe), and stamps the
 *                   ScheduledMessage.detail with deliveredTo + a sentAt anchor.
 *                3. NOTIFY — notifyAutoSend tells the realtor, after the fact,
 *                   that Chippi sent without a tap.
 *              status → 'sent' (transitioning 'sending'→'sent').
 *
 * The 'auto' send path is wired to the SAME transports the audited
 * /api/agent/send route uses — sendSMS (lib/sms) and sendEmailFromCRM
 * (lib/email) — resolving the recipient Contact by id within the space, exactly
 * as that route does. No new/guessed transport: this is the existing, tested
 * autonomous-send path, run in-process here.
 *
 * Each row is processed in isolation: one failing row can't abort the batch (its
 * status becomes 'failed' with the error in detail). Nothing here throws to its
 * caller.
 * ──────────────────────────────────────────────────────────────────────────
 */

import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { runAutonomousInstruction } from '@/lib/agent/run-instruction';
import { sendSMS } from '@/lib/sms';
import { sendEmailFromCRM } from '@/lib/email';
import { recordOutboundMessageSafe } from '@/lib/inbox';
import { notifyDraftReady, notifyAutoSend } from '@/lib/notify';
import type { InboxChannel } from '@/lib/types';
import type { WorkflowAutonomy } from './schema';

/** Don't let one tick process an unbounded number of rows — the overflow is
 *  picked up on the next tick. */
const MAX_PER_TICK = 200;

/**
 * Per-space cap on AUTONOMOUS sends from this dispatcher: 20 per hour. Generous
 * enough for a realtor's legitimate drip cadence, tight enough that a runaway
 * workflow becomes "the next sends defer" rather than "the contact list gets
 * spammed". Shared SMS+email bucket — the cap is about the realtor's contacts,
 * not the transport. Bucketed by spaceId so one tenant can't starve another.
 */
const AUTO_SEND_MAX = 20;
const AUTO_SEND_WINDOW_MS = 60 * 60 * 1000;

/** A due ScheduledMessage row, as the dispatcher needs it. */
export interface DueScheduledMessage {
  id: string;
  spaceId: string;
  channel: 'sms' | 'email';
  recipientContactId: string | null;
  instruction: string;
  autonomy: WorkflowAutonomy;
}

export interface DispatchSummary {
  due: number;
  drafted: number;
  sent: number;
  deferred: number;
  failed: number;
  /** Auto-send rows the tick declined to send because the 'pending'→'sending'
   *  claim flipped zero rows: another tick already owns the row, or a prior crash
   *  left it stuck in 'sending'. A 'skipped' row's status is NOT touched here —
   *  a missed send is the safe outcome; a duplicate send is not. */
  skipped: number;
}

/** Patch a row's status + detail. Best-effort: a bookkeeping failure must not
 *  abort the batch. */
async function setStatus(
  id: string,
  status: 'drafted' | 'sent' | 'failed',
  detail: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from('ScheduledMessage')
    .update({ status, detail, updatedAt: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    logger.warn('[scheduled-dispatch] status update failed', { id, status }, error);
  }
}

/**
 * RAIL 0 — CLAIM. Atomically take ownership of a row for an auto-send by flipping
 * it 'pending'→'sending', GUARDED on the row STILL being 'pending'. The guarded
 * UPDATE … WHERE status='pending' is the concurrency primitive: at most one tick
 * can match-and-flip a given row, so at most one tick proceeds to the irreversible
 * client send. Returns true iff exactly this caller won the claim (one row
 * flipped). A zero-row result means another tick already claimed it, or a prior
 * crash left it 'sending' — either way this caller must NOT send.
 *
 * On error we treat the row as NOT claimed (return false): skipping a send is the
 * safe failure; risking a double-send to a real client is not.
 */
async function claimForSend(id: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('ScheduledMessage')
    .update({ status: 'sending', updatedAt: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id');
  if (error) {
    logger.warn('[scheduled-dispatch] claim-for-send failed — treating as not claimed', { id }, error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/**
 * Release a claim we won but decided NOT to use (rate-limited): flip the row back
 * 'sending'→'pending' so the next tick re-evaluates it. Guarded on the current
 * status so we only revert a row we still own. Best-effort: a failed release
 * leaves the row 'sending' (it'll be picked up by the stale-'sending' reclaim
 * follow-up), which is the safe direction — never a send.
 */
async function releaseClaim(id: string): Promise<void> {
  const { error } = await supabase
    .from('ScheduledMessage')
    .update({ status: 'pending', updatedAt: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'sending');
  if (error) {
    logger.warn('[scheduled-dispatch] claim release failed', { id }, error);
  }
}

/**
 * Count the ACTUAL autonomous sends a space made in the trailing window — the
 * ScheduledMessage rows now marked 'sent' with a recent updatedAt. This is the
 * rate-limit denominator: only real sends count, so a lost claim or a deferred
 * row never inflates the budget, and no Redis token is spent speculatively.
 */
async function recentAutoSendCount(spaceId: string, now: Date): Promise<number> {
  const since = new Date(now.getTime() - AUTO_SEND_WINDOW_MS).toISOString();
  const { count, error } = await supabase
    .from('ScheduledMessage')
    .select('id', { count: 'exact', head: true })
    .eq('spaceId', spaceId)
    .eq('status', 'sent')
    .gte('updatedAt', since);
  if (error) {
    // Can't establish the count → fail closed (treat as at the cap) so we DEFER
    // rather than risk an over-the-cap blast.
    logger.warn('[scheduled-dispatch] recent-send count failed — deferring', { spaceId }, error);
    return AUTO_SEND_MAX;
  }
  return count ?? 0;
}

/**
 * DRAFT path (autonomy 'draft' and 'notify'). Hands the instruction to the
 * headless agent, which drafts (AgentDraft rows) and NEVER sends. For 'notify'
 * we also fire the realtor nudge. Returns the resulting status.
 */
async function processDraft(row: DueScheduledMessage): Promise<'drafted' | 'failed'> {
  const recipient = row.recipientContactId ? `contact ${row.recipientContactId}` : 'the relevant contact';
  const composed = `Draft a ${row.channel} to ${recipient}: ${row.instruction}`;
  const result = await runAutonomousInstruction({ spaceId: row.spaceId, instruction: composed });

  if (!result.ok) {
    await setStatus(row.id, 'failed', { stage: 'draft', error: result.error ?? 'draft run failed' });
    return 'failed';
  }

  const detail: Record<string, unknown> = {
    stage: 'draft',
    autonomy: row.autonomy,
    ran: result.ran,
    summary: result.summary,
  };

  if (row.autonomy === 'notify') {
    await notifyDraftReady({
      spaceId: row.spaceId,
      channel: row.channel,
      recipient: row.recipientContactId,
    });
    detail.notified = true;
  }

  await setStatus(row.id, 'drafted', detail);
  return 'drafted';
}

/**
 * AUTO path (autonomy 'auto'). Resolves the recipient contact within the space,
 * CLAIMS the row, then enforces the rate limit by counting ACTUAL recent sends —
 * over the cap RELEASES the claim and defers. Otherwise SENDS via the existing
 * transports, audits, and notifies. Returns 'sent', 'deferred' (rate-limited —
 * claim released back to pending for the next tick), 'skipped' (lost the claim —
 * see claimForSend), or 'failed'.
 */
async function processAuto(
  row: DueScheduledMessage,
  now: Date,
): Promise<'sent' | 'deferred' | 'skipped' | 'failed'> {
  // We must have a resolvable recipient to send. No recipient → fail closed
  // (never invent one).
  if (!row.recipientContactId) {
    await setStatus(row.id, 'failed', { stage: 'auto', error: 'no recipientContactId on scheduled row' });
    return 'failed';
  }

  // Validate the contact belongs to this space — the spaceId check is the tenant
  // isolation boundary, exactly as /api/agent/send does it.
  const { data: contact, error: contactErr } = await supabase
    .from('Contact')
    .select('id, name, email, phone')
    .eq('id', row.recipientContactId)
    .eq('spaceId', row.spaceId)
    .maybeSingle();

  if (contactErr) {
    await setStatus(row.id, 'failed', { stage: 'auto', error: `contact lookup failed: ${contactErr.message}` });
    return 'failed';
  }
  if (!contact) {
    await setStatus(row.id, 'failed', { stage: 'auto', error: 'contact not found in space' });
    return 'failed';
  }

  // The 'auto' send body. There is no human to compose it here, so the
  // instruction itself IS the message body — a workflow set to autonomy='auto'
  // opts into sending the instruction's text. (Drafting via the agent is the
  // 'draft'/'notify' posture; 'auto' is the deliberate no-tap path.)
  const body = row.instruction;
  let deliveredTo: string | null = null;

  // RAIL 0 — CLAIM, IMMEDIATELY before the irreversible send. Atomically flip
  // 'pending'→'sending' guarded on the prior status. If we lose (zero rows: another
  // tick owns it, or a prior crash left it 'sending'), bail WITHOUT sending and
  // WITHOUT touching status → 'skipped'. Because the row is now 'sending' (not
  // 'pending'), the due query excludes it from future ticks — so a crash between
  // the send and the terminal setStatus below can never re-send. A row stuck in
  // 'sending' (claimed, then crashed pre-send) will simply never send: acceptable —
  // a missed send is safe; a duplicate real client message is not.
  // FOLLOW-UP: a stale-'sending' reclaim cron should re-pend rows stuck in
  // 'sending' past a grace window (claimed then crashed pre-send).
  const claimed = await claimForSend(row.id);
  if (!claimed) {
    logger.warn('[scheduled-dispatch] auto-send claim lost — skipping (row already sending/claimed)', {
      spaceId: row.spaceId,
      id: row.id,
    });
    return 'skipped';
  }

  // RAIL 1 — rate limit, evaluated AFTER the claim against ACTUAL recent sends.
  // At/over the cap → RELEASE the claim ('sending'→'pending') and DEFER, so the
  // row retries next tick WITHOUT having consumed any budget. Counting real sent
  // rows (not Redis tokens) means lost/deferred rows never inflate the cap.
  const sentInWindow = await recentAutoSendCount(row.spaceId, now);
  if (sentInWindow >= AUTO_SEND_MAX) {
    logger.warn('[scheduled-dispatch] auto-send rate limit hit — releasing claim + deferring', {
      spaceId: row.spaceId,
      id: row.id,
      sentInWindow,
    });
    await releaseClaim(row.id);
    return 'deferred';
  }

  if (row.channel === 'email') {
    if (!contact.email) {
      await setStatus(row.id, 'failed', { stage: 'auto', error: `${contact.name} has no email on file` });
      return 'failed';
    }
    // Resolve the sender display name, same as /api/agent/send.
    const { data: spaceSetting } = await supabase
      .from('SpaceSetting')
      .select('businessName')
      .eq('spaceId', row.spaceId)
      .maybeSingle();
    const fromName = (spaceSetting?.businessName as string | undefined) ?? row.spaceId;
    try {
      await sendEmailFromCRM({
        toEmail: contact.email,
        fromName,
        subject: `Message from ${fromName}`,
        body,
      });
      deliveredTo = contact.email;
    } catch (err) {
      await setStatus(row.id, 'failed', {
        stage: 'auto',
        error: `email delivery failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      return 'failed';
    }
  } else {
    if (!contact.phone) {
      await setStatus(row.id, 'failed', { stage: 'auto', error: `${contact.name} has no phone on file` });
      return 'failed';
    }
    const ok = await sendSMS({ to: contact.phone, body });
    if (!ok) {
      await setStatus(row.id, 'failed', { stage: 'auto', error: 'SMS delivery failed — check Telnyx config' });
      return 'failed';
    }
    deliveredTo = contact.phone;
  }

  // RAIL 2 — AUDIT. The send went out; record it on the contact's timeline and
  // inbox transcript. Mirrors /api/agent/send. Best-effort: an audit-write
  // failure must not flip a real send into a 'failed' (which could re-send).
  const sentAt = new Date().toISOString();
  try {
    await supabase.from('ContactActivity').insert({
      id: crypto.randomUUID(),
      spaceId: row.spaceId,
      contactId: contact.id,
      type: row.channel === 'email' ? 'email' : 'note',
      content:
        row.channel === 'email'
          ? `[Workflow auto-send] Email sent: ${body.slice(0, 140)}${body.length > 140 ? '…' : ''}`
          : `[Workflow auto-send] SMS sent: ${body.slice(0, 140)}${body.length > 140 ? '…' : ''}`,
      metadata: {
        channel: row.channel,
        source: 'workflow_scheduled_auto',
        scheduledMessageId: row.id,
      },
    });
  } catch (err) {
    logger.error('[scheduled-dispatch] auto-send activity log failed (non-fatal)', { id: row.id }, err);
  }

  await recordOutboundMessageSafe(
    {
      spaceId: row.spaceId,
      contactId: contact.id,
      channel: row.channel as InboxChannel,
      body,
      subject: null,
      metadata: { source: 'workflow_scheduled_auto', scheduledMessageId: row.id },
    },
    { route: 'scheduled-dispatch', spaceId: row.spaceId, scheduledMessageId: row.id },
  );

  // RAIL 3 — NOTIFY. Tell the realtor, after the fact, that Chippi sent.
  await notifyAutoSend({ spaceId: row.spaceId, channel: row.channel, recipient: contact.name ?? contact.id });

  await setStatus(row.id, 'sent', { stage: 'auto', deliveredTo, sentAt });
  return 'sent';
}

/**
 * Process one due row. Wrapped so any throw becomes a 'failed' row — one bad row
 * never aborts the batch. Returns the outcome bucket for the summary.
 */
async function processRow(
  row: DueScheduledMessage,
  now: Date,
): Promise<'drafted' | 'sent' | 'deferred' | 'skipped' | 'failed'> {
  try {
    if (row.autonomy === 'auto') {
      return await processAuto(row, now);
    }
    // 'draft' and 'notify' both draft; only 'notify' also nudges.
    return await processDraft(row);
  } catch (err) {
    logger.error('[scheduled-dispatch] row processing threw', { id: row.id, spaceId: row.spaceId }, err);
    await setStatus(row.id, 'failed', { error: err instanceof Error ? err.message : String(err) });
    return 'failed';
  }
}

/**
 * Load every due ScheduledMessage (status 'pending', sendAt <= now) and process
 * each per its autonomy. Returns a summary of the batch. Never throws.
 */
export async function dispatchDueScheduledMessages(now: Date = new Date()): Promise<DispatchSummary> {
  const summary: DispatchSummary = { due: 0, drafted: 0, sent: 0, deferred: 0, failed: 0, skipped: 0 };

  const { data: rows, error } = await supabase
    .from('ScheduledMessage')
    .select('id, spaceId, channel, recipientContactId, instruction, autonomy')
    .eq('status', 'pending')
    .lte('sendAt', now.toISOString())
    .order('sendAt', { ascending: true })
    .limit(MAX_PER_TICK);
  if (error) {
    logger.error('[scheduled-dispatch] due query failed', undefined, error);
    return summary;
  }

  const due = (rows ?? []) as unknown as DueScheduledMessage[];
  summary.due = due.length;

  // Sequential: the volume per tick is small, the agent drafting path is heavy,
  // and a per-space rate limit is easier to reason about without concurrency.
  for (const row of due) {
    const outcome = await processRow(row, now);
    summary[outcome] += 1;
  }

  return summary;
}
