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
 *   'auto'   → ACTUALLY SEND, but only behind THREE rails, all required:
 *                1. RATE LIMIT — checkRateLimit caps autonomous sends per space
 *                   per hour (AUTO_SEND_MAX/AUTO_SEND_WINDOW). Over the cap →
 *                   the row is DEFERRED (left 'pending'), retried next tick.
 *                2. AUDIT — every send writes a ContactActivity row + an inbox
 *                   transcript entry (recordOutboundMessageSafe), and stamps the
 *                   ScheduledMessage.detail with deliveredTo + a sentAt anchor.
 *                3. NOTIFY — notifyAutoSend tells the realtor, after the fact,
 *                   that Chippi sent without a tap.
 *              status → 'sent'.
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
import { checkRateLimit } from '@/lib/rate-limit';
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
const AUTO_SEND_WINDOW_SECONDS = 60 * 60;

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
 * AUTO path (autonomy 'auto'). Enforces the rate limit, resolves the recipient
 * contact within the space, SENDS via the existing transports, audits, and
 * notifies. Returns 'sent', 'deferred' (rate-limited — left pending for the next
 * tick), or 'failed'.
 */
async function processAuto(row: DueScheduledMessage): Promise<'sent' | 'deferred' | 'failed'> {
  // RAIL 1 — rate limit. Over the cap → DEFER: leave the row 'pending' (do NOT
  // touch status) so the next tick retries once the window rolls. A deferred
  // send is fine; an over-the-cap blast is not.
  const { allowed } = await checkRateLimit(
    `scheduled-auto-send:${row.spaceId}`,
    AUTO_SEND_MAX,
    AUTO_SEND_WINDOW_SECONDS,
  );
  if (!allowed) {
    logger.warn('[scheduled-dispatch] auto-send rate limit hit — deferring', {
      spaceId: row.spaceId,
      id: row.id,
    });
    return 'deferred';
  }

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
async function processRow(row: DueScheduledMessage): Promise<'drafted' | 'sent' | 'deferred' | 'failed'> {
  try {
    if (row.autonomy === 'auto') {
      return await processAuto(row);
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
  const summary: DispatchSummary = { due: 0, drafted: 0, sent: 0, deferred: 0, failed: 0 };

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
    const outcome = await processRow(row);
    summary[outcome] += 1;
  }

  return summary;
}
