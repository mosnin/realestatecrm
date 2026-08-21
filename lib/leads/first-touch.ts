/**
 * Instant First Touch — speed-to-lead.
 *
 * When a genuinely NEW lead lands (public intake form, brokerage intake,
 * manual single create — NEVER bulk CSV import), Chippi composes a grounded
 * intro draft within seconds and pushes "first touch ready" to the realtor.
 * The draft is a normal pending AgentDraft: it rides the existing
 * inbox/focus-card review → approve → sendDraft pipeline. Nothing is ever
 * auto-sent.
 *
 * Contract for callers (intake/creation routes):
 *   - `void fireFirstTouch({ spaceId, contactId })` — fire-and-forget. The
 *     function NEVER throws (sync or async) and registers its own shared-
 *     promise `after()` keep-alive (the lib/gcal-helpers.ts idiom), so the
 *     caller adds zero latency to the intake response and Vercel doesn't
 *     suspend the function before the compose finishes.
 *   - Tests (and curious callers) may await the returned promise for the
 *     structured outcome.
 *
 * Guards, in order:
 *   1. Space exists; skip when premium AI is paused (isPremiumAccessBlocked —
 *      same gate the cron/routines sweep applies).
 *   2. Contact exists IN THIS SPACE (tenant scoping — the .eq() pair is the
 *      security boundary; service role bypasses RLS).
 *   3. Channel: email when the contact has an email, else sms when it has a
 *      phone, else skip — no reachable channel means no first touch.
 *   4. Per-contact dedupe: at most one first-touch draft per contact, ever.
 *      Select-check first, unique idempotencyKey as the race backstop.
 *   5. Per-space daily cap (~20/day) via the shared fixed-window limiter, so
 *      a lead-gen flood can't turn into an LLM spend flood.
 *
 * Compose reuses lib/agent/quick-draft.ts wholesale — same grounded prompt,
 * reviseAwaySlop self-critique, and CLAIM_GUARDS rejection. A provider miss
 * degrades to a neutral, claim-free fallback (mirrors the quick-draft
 * route's philosophy): the realtor still reviews it before anything sends,
 * and it makes zero factual claims about the lead.
 */

import { after } from 'next/server';
import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
import { logger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import { isPremiumAccessBlocked } from '@/lib/api-auth';
import { sendPushToSpace } from '@/lib/push';
import { createAppNotification } from '@/lib/notifications';
import { composeQuickDraft } from '@/lib/agent/quick-draft';
import { leadSourceLabel } from '@/lib/lead-source';

/** Reasoning line shown under the draft in the inbox/focus card. */
export const FIRST_TOUCH_REASONING = 'Instant first touch for new lead';

/** Value of AgentDraft.triggerSource->>kind for first-touch drafts. */
export const FIRST_TOUCH_TRIGGER_KIND = 'first_touch';

/** Per-space daily cap on first-touch drafts. */
export const FIRST_TOUCH_DAILY_CAP = 20;
const DAY_SECONDS = 24 * 60 * 60;

export interface FireFirstTouchInput {
  spaceId: string;
  contactId: string;
}

export interface FirstTouchOutcome {
  created: boolean;
  draftId?: string;
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
 * question. The realtor reviews it before anything is sent.
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
  stripeSubscriptionStatus: string | null;
  stripePeriodEnd: string | null;
}

interface ContactRow {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
}

async function performFirstTouch(input: FireFirstTouchInput): Promise<FirstTouchOutcome> {
  const { spaceId, contactId } = input;

  // ── Space + premium gate ──────────────────────────────────────────────
  const { data: spaceRow } = await supabase
    .from('Space')
    .select('id, slug, name, stripeSubscriptionStatus, stripePeriodEnd')
    .eq('id', spaceId)
    .maybeSingle();
  if (!spaceRow) return { created: false, reason: 'space_not_found' };
  const space = spaceRow as SpaceRow;

  if (isPremiumAccessBlocked(space.stripeSubscriptionStatus, space.stripePeriodEnd)) {
    logger.info('[first-touch] skipped — premium access blocked', { spaceId });
    return { created: false, reason: 'premium_blocked' };
  }

  // ── Contact, scoped to the tenant ─────────────────────────────────────
  const { data: contactRow } = await tenantTable(supabase, 'Contact', { spaceId })
    .select('id, name, email, phone')
    .eq('id', contactId)
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
  const { data: existing } = await tenantTable(supabase, 'AgentDraft', { spaceId })
    .select('id')
    .eq('contactId', contactId)
    .eq('idempotencyKey', idempotencyKey)
    .limit(1)
    .maybeSingle();
  if (existing) {
    return { created: false, reason: 'duplicate' };
  }

  // ── Per-space daily cap. Checked AFTER dedupe so retried duplicates
  //    don't consume the budget. ~20/day keeps a lead-gen flood from
  //    becoming an LLM spend flood; overflow leads still get the normal
  //    new-lead notification, just no instant draft. ──────────────────────
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
  //    fallback. composeQuickDraft returns null on any provider problem;
  //    a thrown error is treated identically. ────────────────────────────
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

  // ── Persist the pending draft. The unique idempotencyKey is the race
  //    backstop behind the select-based dedupe above. ────────────────────
  const { data: inserted, error: insertError } = await tenantTable(supabase, 'AgentDraft', { spaceId })
    .insert({
      spaceId,
      contactId,
      channel,
      subject: channel === 'email' ? draft.subject ?? 'Welcome' : null,
      content: draft.body,
      reasoning: FIRST_TOUCH_REASONING,
      // Sort above sweep-generated drafts in the pending queue — the whole
      // point is that the realtor sees this while the lead is still warm.
      priority: 1,
      status: 'pending',
      idempotencyKey,
      triggerSource: { kind: FIRST_TOUCH_TRIGGER_KIND, contactId },
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    if ((insertError as { code?: string } | null)?.code === '23505') {
      // Concurrent submission won the race; their draft stands.
      return { created: false, reason: 'duplicate' };
    }
    logger.error('[first-touch] draft insert failed', { spaceId, contactId, err: insertError?.message });
    return { created: false, reason: 'insert_failed' };
  }
  const draftId = (inserted as { id: string }).id;

  // ── Notify the realtor. Only after the draft actually exists — the
  //    notification says "first touch ready", so it must be true. The durable
  //    in-app record (dashboard bell) lands alongside the ephemeral push;
  //    both are best-effort and never throw. ─────────────────────────────
  const leadName = (contact.name ?? '').trim() || 'New lead';
  const notifyTitle = `New lead: ${leadName} — first touch ready`;
  const notifyBody =
    channel === 'email' ? 'Review and send the intro email I drafted.' : 'Review and send the intro text I drafted.';
  const notifyUrl = `/s/${space.slug}/chippi/inbox`;
  await Promise.allSettled([
    createAppNotification({
      spaceId,
      type: 'first_touch',
      title: notifyTitle,
      body: notifyBody,
      href: notifyUrl,
      priority: 'high',
    }),
    sendPushToSpace(spaceId, { title: notifyTitle, body: notifyBody, url: notifyUrl }),
  ]);

  logger.info('[first-touch] draft created', { spaceId, contactId, draftId, channel });
  return { created: true, draftId };
}

/**
 * Fire-and-forget entry point. Never throws and never rejects; registers a
 * shared-promise `after()` keep-alive so the work survives the intake
 * response returning (lib/gcal-helpers.ts / lib/push.ts idiom). Callers in
 * request paths invoke it as `void fireFirstTouch(...)`; tests await it.
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
