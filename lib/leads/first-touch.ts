/**
 * Instant First Touch — speed-to-lead.
 *
 * When a genuinely NEW lead lands (public intake form, brokerage intake,
 * home-value capture, manual single create — NEVER bulk CSV import), Chippi
 * composes a grounded intro and, by default, SENDS it.
 *
 * Send contract:
 *   - Inbound apply / home-value (`origin: 'inbound'`): category
 *     `transactional` — the consumer asked to be contacted by submitting.
 *     Suppression and quiet hours still apply.
 *   - Manual CRM create (`origin: 'manual'`, also the safe default if a
 *     caller forgets origin): category `marketing` — needs express written
 *     consent. No consent → draft stays pending.
 *   - SpaceSetting.autoFirstTouchSend === false: compose + notify only
 *     (the old draft-first behavior). Missing setting row = ON.
 *   - Delivery prefers the realtor's connected Gmail/Outlook via sendDraft
 *     ({ spaceId, userId: owner clerkId }). Resend is the labeled fallback.
 *   - A held or failed send leaves the draft pending so the realtor can
 *     still tap Send. Notifications tell the truth (sent / held / failed).
 *
 * Contract for callers (intake/creation routes):
 *   - `void fireFirstTouch({ spaceId, contactId, origin })` — fire-and-forget.
 *     NEVER throws (sync or async) and registers its own shared-promise
 *     `after()` keep-alive (the lib/gcal-helpers.ts idiom).
 *   - Tests (and curious callers) may await the returned promise.
 *
 * Guards, in order:
 *   1. Space exists; skip when premium AI is paused.
 *   2. Contact exists IN THIS SPACE (tenant scoping — the .eq() pair is the
 *      security boundary; service role bypasses RLS).
 *   3. Channel: email when the contact has an email, else sms when it has a
 *      phone, else skip.
 *   4. Per-contact dedupe: at most one first-touch draft per contact, ever.
 *   5. Per-space daily cap (~20/day).
 *   6. After insert: setting + compliance + sendDraft (see above).
 *
 * Compose reuses lib/agent/quick-draft.ts. A provider miss degrades to a
 * neutral, claim-free fallback — that fallback can still send.
 */

import { after } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import { isPremiumAccessBlocked } from '@/lib/api-auth';
import { sendPushToSpace } from '@/lib/push';
import { createAppNotification } from '@/lib/notifications';
import { composeQuickDraft } from '@/lib/agent/quick-draft';
import { leadSourceLabel } from '@/lib/lead-source';
import { checkSendAllowed, type MessageCategory } from '@/lib/messaging/compliance';
import { describeDelivery, sendDraft, type DeliveryResult } from '@/lib/delivery';
import { recordOutboundMessageSafe } from '@/lib/inbox';
import { advanceDealFromEvent } from '@/lib/deals/advance-from-event';
import type { InboxChannel } from '@/lib/types';

/** Reasoning line shown under the draft in the inbox/focus card. */
export const FIRST_TOUCH_REASONING = 'Instant first touch for new lead';

/** Value of AgentDraft.triggerSource->>kind for first-touch drafts. */
export const FIRST_TOUCH_TRIGGER_KIND = 'first_touch';

/** Per-space daily cap on first-touch drafts. */
export const FIRST_TOUCH_DAILY_CAP = 20;
const DAY_SECONDS = 24 * 60 * 60;

export type FirstTouchOrigin = 'inbound' | 'manual';

export interface FireFirstTouchInput {
  spaceId: string;
  contactId: string;
  /**
   * Where the lead landed. `inbound` = they asked to be contacted (apply /
   * home-value). `manual` = realtor typed them in. Omitted → `manual` (the
   * stricter consent gate) so a forgotten origin cannot silently blast.
   */
  origin?: FirstTouchOrigin;
}

export type FirstTouchHoldReason = 'setting_off' | 'compliance' | 'send_failed';

export interface FirstTouchOutcome {
  created: boolean;
  draftId?: string;
  /** True only when the intro actually left the building. */
  sent?: boolean;
  deliveryMethod?: DeliveryResult['method'];
  fallback?: boolean;
  holdReason?: FirstTouchHoldReason;
  /** Why nothing was created. Absent when created. */
  reason?:
    | 'space_not_found'
    | 'premium_blocked'
    | 'contact_not_found'
    | 'no_channel'
    | 'duplicate'
    | 'daily_cap'
    | 'insert_failed'
    | 'error';
}

/** First word of a name, for the SMS fallback greeting. */
function firstName(name: string | null): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}

/**
 * Neutral, claim-free fallback when the compose call is unavailable or its
 * output was rejected by the claim guards. Makes no statement about the
 * lead, listings, or prior contact — it only thanks them and asks a
 * question.
 */
export function neutralFirstTouchFallback(
  channel: 'email' | 'sms',
  leadName: string | null,
): { subject: string | null; body: string } {
  if (channel === 'email') {
    return {
      subject: 'Welcome',
      body: 'Thanks for reaching out. What would be most helpful as you get started?',
    };
  }
  const first = firstName(leadName);
  return {
    subject: null,
    body: `Hi${first ? ` ${first}` : ''}, thanks for reaching out. What would be most helpful as you get started?`,
  };
}

/**
 * One-line "what this lead wants", derived from intake answers when
 * available. Purely structured fields — nothing invented. Null when the
 * lead gave us nothing usable (the card simply omits the line).
 */
export function firstTouchWant(contact: {
  leadType?: string | null;
  budget?: number | null;
  preferences?: string | null;
}): string | null {
  const parts: string[] = [];
  if (contact.leadType === 'buyer') parts.push('Looking to buy');
  else if (contact.leadType === 'rental') parts.push('Looking to rent');
  else if (contact.leadType === 'seller') parts.push('Looking to sell');

  if (typeof contact.budget === 'number' && contact.budget > 0) {
    const formatted = `$${Math.round(contact.budget).toLocaleString('en-US')}`;
    parts.push(contact.leadType === 'rental' ? `~${formatted}/mo` : `~${formatted}`);
  }

  const prefs = (contact.preferences ?? '').trim().replace(/\s+/g, ' ');
  if (prefs) parts.push(`interested in ${prefs.length > 60 ? prefs.slice(0, 59) + '…' : prefs}`);

  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Human label for the card's source line. Falls back to the free-form sourceLabel. */
export function firstTouchSourceLabel(contact: {
  source?: string | null;
  sourceLabel?: string | null;
}): string {
  const structured = leadSourceLabel(contact.source);
  if (structured !== 'Unknown') return structured;
  return (contact.sourceLabel ?? '').trim() || 'Unknown source';
}

interface SpaceRow {
  id: string;
  slug: string;
  name: string;
  ownerId: string | null;
  stripeSubscriptionStatus: string | null;
  stripePeriodEnd: string | null;
}

interface ContactRow {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
}

async function notifyRealtor(args: {
  spaceId: string;
  slug: string;
  title: string;
  body: string;
}): Promise<void> {
  const href = `/s/${args.slug}/chippi/inbox`;
  await Promise.allSettled([
    createAppNotification({
      spaceId: args.spaceId,
      type: 'first_touch',
      title: args.title,
      body: args.body,
      href,
      priority: 'high',
    }),
    sendPushToSpace(args.spaceId, { title: args.title, body: args.body, url: href }),
  ]);
}

async function recordSentActivity(args: {
  spaceId: string;
  contactId: string;
  draftId: string;
  channel: 'email' | 'sms';
  subject: string | null;
  content: string;
}): Promise<void> {
  try {
    await supabase.from('ContactActivity').insert({
      id: crypto.randomUUID(),
      spaceId: args.spaceId,
      contactId: args.contactId,
      type: args.channel === 'email' ? 'email' : 'note',
      content:
        args.channel === 'email'
          ? `[Agent] Email sent: ${args.subject ?? ''}`
          : `[Agent] SMS sent: ${args.content.slice(0, 140)}${args.content.length > 140 ? '…' : ''}`,
      metadata: {
        channel: args.channel,
        source: 'first_touch',
        draftId: args.draftId,
        ...(args.channel === 'sms' ? { via: 'sms' } : {}),
      },
    });
  } catch (err) {
    logger.error('[first-touch] activity log failed (non-fatal)', { draftId: args.draftId }, err);
  }
}

async function trySendFirstTouch(args: {
  spaceId: string;
  contactId: string;
  draftId: string;
  space: SpaceRow;
  contact: ContactRow;
  channel: 'email' | 'sms';
  subject: string | null;
  content: string;
  origin: FirstTouchOrigin;
}): Promise<{
  sent: boolean;
  holdReason?: FirstTouchHoldReason;
  delivery?: DeliveryResult;
  holdDetail?: string;
}> {
  const { spaceId, contactId, draftId, space, contact, channel, subject, content, origin } = args;

  const { data: settingRow, error: settingError } = await supabase
    .from('SpaceSetting')
    .select('autoFirstTouchSend')
    .eq('spaceId', spaceId)
    .maybeSingle();
  if (settingError) {
    logger.warn('[first-touch] SpaceSetting lookup failed — holding send', {
      spaceId,
      contactId,
      err: settingError.message,
    });
    return { sent: false, holdReason: 'setting_off', holdDetail: 'Could not read the auto-send setting.' };
  }
  const autoSend = (settingRow as { autoFirstTouchSend?: boolean } | null)?.autoFirstTouchSend !== false;
  if (!autoSend) {
    return { sent: false, holdReason: 'setting_off' };
  }

  const address = channel === 'email' ? (contact.email ?? '').trim() : (contact.phone ?? '').trim();
  const category: MessageCategory = origin === 'inbound' ? 'transactional' : 'marketing';
  const decision = await checkSendAllowed({
    spaceId,
    channel,
    address,
    audience: 'consumer',
    category,
    contactId,
  });
  if (!decision.allowed) {
    return {
      sent: false,
      holdReason: 'compliance',
      holdDetail: decision.detail ?? decision.reason ?? 'Send blocked.',
    };
  }

  let clerkId: string | undefined;
  if (space.ownerId) {
    const { data: ownerRow } = await supabase
      .from('User')
      .select('clerkId')
      .eq('id', space.ownerId)
      .maybeSingle();
    clerkId = (ownerRow as { clerkId?: string } | null)?.clerkId ?? undefined;
  }

  const delivery = await sendDraft(
    { channel, subject, content },
    { name: (contact.name ?? '').trim() || 'there', email: contact.email, phone: contact.phone },
    space.name,
    { spaceId, userId: clerkId },
  );

  if (!delivery.sent) {
    return {
      sent: false,
      holdReason: 'send_failed',
      delivery,
      holdDetail: delivery.error ?? 'Delivery failed.',
    };
  }

  const { error: updateError } = await supabase
    .from('AgentDraft')
    .update({
      status: 'sent',
      updatedAt: new Date().toISOString(),
    })
    .eq('id', draftId)
    .eq('spaceId', spaceId);
  if (updateError) {
    // The message already left. Log and continue — CRM status can be healed.
    logger.error('[first-touch] draft status update failed after send', {
      spaceId,
      draftId,
      err: updateError.message,
    });
  }

  await recordOutboundMessageSafe(
    {
      spaceId,
      contactId,
      channel: channel as InboxChannel,
      body: content,
      subject,
      agentDraftId: draftId,
      metadata: {
        source: 'first_touch',
        method: delivery.method,
        ...(delivery.fallback ? { fallback: true } : {}),
      },
    },
    { route: 'first-touch', draftId, spaceId },
  );

  await recordSentActivity({
    spaceId,
    contactId,
    draftId,
    channel,
    subject,
    content,
  });

  return { sent: true, delivery };
}

async function performFirstTouch(input: FireFirstTouchInput): Promise<FirstTouchOutcome> {
  const { spaceId, contactId } = input;
  const origin: FirstTouchOrigin = input.origin ?? 'manual';

  // ── Space + premium gate ──────────────────────────────────────────────
  const { data: spaceRow } = await supabase
    .from('Space')
    .select('id, slug, name, ownerId, stripeSubscriptionStatus, stripePeriodEnd')
    .eq('id', spaceId)
    .maybeSingle();
  if (!spaceRow) return { created: false, reason: 'space_not_found' };
  const space = spaceRow as SpaceRow;

  if (isPremiumAccessBlocked(space.stripeSubscriptionStatus, space.stripePeriodEnd)) {
    logger.info('[first-touch] skipped — premium access blocked', { spaceId });
    return { created: false, reason: 'premium_blocked' };
  }

  // ── Contact, scoped to the tenant ─────────────────────────────────────
  const { data: contactRow } = await supabase
    .from('Contact')
    .select('id, name, email, phone')
    .eq('id', contactId)
    .eq('spaceId', spaceId)
    .maybeSingle();
  if (!contactRow) return { created: false, reason: 'contact_not_found' };
  const contact = contactRow as ContactRow;

  // ── Channel choice: email first, sms second, skip otherwise ──────────
  const email = (contact.email ?? '').trim();
  const phone = (contact.phone ?? '').trim();
  const channel: 'email' | 'sms' | null = email ? 'email' : phone ? 'sms' : null;
  if (!channel) {
    logger.info('[first-touch] skipped — no reachable channel', { spaceId, contactId });
    return { created: false, reason: 'no_channel' };
  }

  // ── Per-contact dedupe (one first touch per lead, ever) ───────────────
  const idempotencyKey = `first-touch:${spaceId}:${contactId}`;
  const { data: existing } = await supabase
    .from('AgentDraft')
    .select('id')
    .eq('spaceId', spaceId)
    .eq('contactId', contactId)
    .eq('idempotencyKey', idempotencyKey)
    .limit(1)
    .maybeSingle();
  if (existing) {
    return { created: false, reason: 'duplicate' };
  }

  // ── Per-space daily cap. Checked AFTER dedupe so retried duplicates
  //    don't consume the budget. ─────────────────────────────────────────
  const { allowed } = await checkRateLimit(
    `first-touch:${spaceId}`,
    FIRST_TOUCH_DAILY_CAP,
    DAY_SECONDS,
  );
  if (!allowed) {
    logger.info('[first-touch] skipped — daily cap reached', { spaceId });
    return { created: false, reason: 'daily_cap' };
  }

  // ── Compose (grounded; slop-revised; claim-guarded) with neutral
  //    fallback. ─────────────────────────────────────────────────────────
  let composed: { subject: string | null; body: string } | null = null;
  try {
    composed = await composeQuickDraft({
      kind: 'person',
      id: contactId,
      intent: 'welcome',
      channel,
      spaceId,
    });
  } catch (err) {
    logger.warn('[first-touch] compose threw — using neutral fallback', { spaceId, contactId }, err);
  }
  const draft = composed ?? neutralFirstTouchFallback(channel, contact.name);
  if (!composed) {
    logger.warn('[first-touch] serving neutral fallback draft', { spaceId, contactId });
  }

  const subject = channel === 'email' ? draft.subject ?? 'Welcome' : null;
  const content = draft.body;

  // ── Persist the pending draft. Unique idempotencyKey is the race
  //    backstop. Status stays pending until a send actually lands. ───────
  const { data: inserted, error: insertError } = await supabase
    .from('AgentDraft')
    .insert({
      spaceId,
      contactId,
      channel,
      subject,
      content,
      reasoning: FIRST_TOUCH_REASONING,
      priority: 1,
      status: 'pending',
      idempotencyKey,
      triggerSource: { kind: FIRST_TOUCH_TRIGGER_KIND, contactId, origin },
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    if ((insertError as { code?: string } | null)?.code === '23505') {
      return { created: false, reason: 'duplicate' };
    }
    logger.error('[first-touch] draft insert failed', { spaceId, contactId, err: insertError?.message });
    return { created: false, reason: 'insert_failed' };
  }
  const draftId = (inserted as { id: string }).id;

  const sendResult = await trySendFirstTouch({
    spaceId,
    contactId,
    draftId,
    space,
    contact,
    channel,
    subject,
    content,
    origin,
  });

  const leadName = (contact.name ?? '').trim() || 'New lead';
  const channelWord = channel === 'email' ? 'email' : 'text';

  if (sendResult.sent && sendResult.delivery) {
    try {
      await advanceDealFromEvent({
        spaceId,
        contactId,
        event: 'first_touch_sent',
        title: leadName,
      });
    } catch (err) {
      logger.warn('[first-touch] pipeline advance failed', { spaceId, contactId }, err);
    }
    await notifyRealtor({
      spaceId,
      slug: space.slug,
      title: `New lead: ${leadName} — first touch sent`,
      body: `Intro ${channelWord} sent ${describeDelivery(sendResult.delivery)}.`,
    });
    logger.info('[first-touch] sent', {
      spaceId,
      contactId,
      draftId,
      channel,
      method: sendResult.delivery.method,
      fallback: sendResult.delivery.fallback ?? false,
      origin,
    });
    return {
      created: true,
      draftId,
      sent: true,
      deliveryMethod: sendResult.delivery.method,
      fallback: sendResult.delivery.fallback,
    };
  }

  if (sendResult.holdReason === 'setting_off') {
    await notifyRealtor({
      spaceId,
      slug: space.slug,
      title: `New lead: ${leadName} — first touch ready`,
      body:
        channel === 'email'
          ? 'Review and send the intro email I drafted.'
          : 'Review and send the intro text I drafted.',
    });
    logger.info('[first-touch] draft held — auto-send off', { spaceId, contactId, draftId });
    return { created: true, draftId, sent: false, holdReason: 'setting_off' };
  }

  if (sendResult.holdReason === 'compliance') {
    await notifyRealtor({
      spaceId,
      slug: space.slug,
      title: `New lead: ${leadName} — first touch held`,
      body: `Not sent: ${sendResult.holdDetail ?? 'blocked by messaging rules'}. Review and send from the inbox.`,
    });
    logger.info('[first-touch] draft held — compliance', {
      spaceId,
      contactId,
      draftId,
      detail: sendResult.holdDetail,
    });
    return { created: true, draftId, sent: false, holdReason: 'compliance' };
  }

  await notifyRealtor({
    spaceId,
    slug: space.slug,
    title: `New lead: ${leadName} — first touch not sent`,
    body: `Delivery failed: ${sendResult.holdDetail ?? 'unknown error'}. Review and send from the inbox.`,
  });
  logger.warn('[first-touch] draft held — send failed', {
    spaceId,
    contactId,
    draftId,
    detail: sendResult.holdDetail,
  });
  return { created: true, draftId, sent: false, holdReason: 'send_failed' };
}

/**
 * Fire-and-forget entry point. Never throws and never rejects; registers a
 * shared-promise `after()` keep-alive so the work survives the intake
 * response returning. Callers in request paths invoke it as
 * `void fireFirstTouch(...)`; tests await it.
 */
export function fireFirstTouch(input: FireFirstTouchInput): Promise<FirstTouchOutcome> {
  const task = performFirstTouch(input).catch((err): FirstTouchOutcome => {
    logger.error(
      '[first-touch] failed (non-fatal)',
      { spaceId: input.spaceId, contactId: input.contactId },
      err,
    );
    return { created: false, reason: 'error' };
  });
  try {
    after(() => task);
  } catch {
    // Outside a request scope (unit tests, background workers) — the
    // promise still runs to completion in-process.
  }
  return task;
}
