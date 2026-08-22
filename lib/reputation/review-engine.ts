/**
 * Post-Close Reputation Engine — the review-ask half.
 *
 * When a deal is marked won, `fireReviewAsk` composes a warm, grounded review
 * request in the realtor's voice (reusing lib/agent/quick-draft), attaches a
 * tracked review link, and drops a normal PENDING AgentDraft into the same
 * inbox/focus-card review → approve → send pipeline first-touch uses. Nothing
 * is ever auto-sent; the realtor approves the outbound. A ReviewCampaign row
 * tracks the ask's lifecycle so the nudge cron can chase an un-clicked link and
 * the Brief can report "X requested, Y clicked".
 *
 * Contract for callers (the deal-won transition):
 *   - `void fireReviewAsk({ spaceId, dealId, contactId })` — fire-and-forget.
 *     NEVER throws (sync or async) and registers its own shared-promise
 *     `after()` keep-alive (the lib/gcal-helpers.ts idiom), so the deal-won
 *     request path adds zero latency and Vercel doesn't suspend the function
 *     before the compose finishes. Tests await the returned promise.
 *
 * Guards, in order:
 *   1. Space exists; skip when premium AI is paused (isPremiumAccessBlocked —
 *      the same gate every cron/sweep applies).
 *   2. The space has a reviewUrl configured (SpaceSetting.reviewUrl). No
 *      destination for reviews → no ask. This is the feature's opt-in.
 *   3. Per-deal dedupe: at most one campaign per deal, ever. Select-check
 *      first, unique (spaceId, dealId) index as the race backstop.
 *   4. Contact exists IN THIS SPACE (tenant scoping — the .eq() pair is the
 *      boundary; service role bypasses RLS). Channel: email when it has an
 *      email, else sms when it has a phone, else skip.
 *
 * Compose reuses composeQuickDraft (grounded, slop-revised, claim-guarded) for
 * a voice-matched opener referencing the deal; a provider miss degrades to a
 * neutral, claim-free ask. Either way the tracked review link is appended
 * deterministically (the LLM never sees or invents it).
 */

import { after } from 'next/server';
import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
import { logger } from '@/lib/logger';
import { isPremiumAccessBlocked } from '@/lib/api-auth';
import { sendPushToSpace } from '@/lib/push';
import { createAppNotification } from '@/lib/notifications';
import { composeQuickDraft } from '@/lib/agent/quick-draft';

/** Reasoning line shown under the draft in the inbox/focus card. */
export const REVIEW_ASK_REASONING = 'Post-close review request';

/** AgentDraft.triggerSource->>kind for review-ask drafts. */
export const REVIEW_ASK_TRIGGER_KIND = 'review_request';

export interface FireReviewAskInput {
  spaceId: string;
  dealId: string;
  contactId: string;
}

export interface ReviewAskOutcome {
  created: boolean;
  campaignId?: string;
  draftId?: string;
  /** Why nothing was created. Absent when created. */
  reason?:
    | 'space_not_found'
    | 'premium_blocked'
    | 'no_review_url'
    | 'duplicate'
    | 'contact_not_found'
    | 'no_channel'
    | 'insert_failed'
    | 'error';
}

interface SpaceRow {
  id: string;
  slug: string;
  stripeSubscriptionStatus: string | null;
  stripePeriodEnd: string | null;
}

interface ContactRow {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
}

/** First word of a name, for the greeting. */
function firstName(name: string | null): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}

function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.usechippi.com').replace(/\/$/, '');
}

/** The public, unguessable click-tracking link for a campaign. */
export function reviewTrackingLink(campaignId: string): string {
  return `${appBaseUrl()}/api/reviews/${campaignId}`;
}

/**
 * Neutral, claim-free review ask when the compose call is unavailable or its
 * output was rejected. Thanks the client and asks for a review — it invents no
 * facts about the transaction (the deal label is a stored field, not a claim).
 * The realtor reviews it before anything sends.
 */
export function neutralReviewOpener(contactName: string | null): string {
  const first = firstName(contactName);
  return `Hi${first ? ` ${first}` : ''}, it was a real pleasure working with you.`;
}

/** The one review-ask sentence, appended after the (voice-matched) opener. */
const REVIEW_CTA = "If you have a moment, a quick review would mean a lot to me:";

/** Reasoning line for the single follow-up nudge (the nudge cron). */
export const REVIEW_NUDGE_REASONING = 'Post-close review nudge';

/**
 * Neutral, claim-free nudge opener — the single polite follow-up when a review
 * link went un-clicked. Makes no new claim; just a gentle reminder.
 */
export function neutralNudgeOpener(contactName: string | null): string {
  const first = firstName(contactName);
  return `Hi${first ? ` ${first}` : ''}, just following up in case my last note slipped by.`;
}

/**
 * Assemble the final draft body from a voice-matched opener (or the neutral
 * fallback) plus the deterministic review CTA and tracked link. The LLM never
 * produces the link — grounding forbids it inventing URLs — so we append it
 * here, the single place it lives.
 */
export function assembleReviewMessage(
  channel: 'email' | 'sms',
  opener: string,
  reviewLink: string,
): string {
  const clean = opener.trim();
  if (channel === 'email') {
    return `${clean}\n\n${REVIEW_CTA}\n${reviewLink}`;
  }
  return `${clean} ${REVIEW_CTA} ${reviewLink}`;
}

async function performReviewAsk(input: FireReviewAskInput): Promise<ReviewAskOutcome> {
  const { spaceId, dealId, contactId } = input;

  // ── Space + premium gate ──────────────────────────────────────────────
  const { data: spaceRow } = await supabase
    .from('Space')
    .select('id, slug, stripeSubscriptionStatus, stripePeriodEnd')
    .eq('id', spaceId)
    .maybeSingle();
  if (!spaceRow) return { created: false, reason: 'space_not_found' };
  const space = spaceRow as SpaceRow;

  if (isPremiumAccessBlocked(space.stripeSubscriptionStatus, space.stripePeriodEnd)) {
    logger.info('[review-ask] skipped — premium access blocked', { spaceId });
    return { created: false, reason: 'premium_blocked' };
  }

  // ── Review URL must be configured (the feature's opt-in) ──────────────
  const { data: settingRow } = await tenantTable(supabase, 'SpaceSetting', { spaceId })
    .select('reviewUrl')
    .maybeSingle();
  const reviewUrl = ((settingRow as { reviewUrl?: string | null } | null)?.reviewUrl ?? '').trim();
  if (!reviewUrl) {
    logger.info('[review-ask] skipped — no reviewUrl configured', { spaceId });
    return { created: false, reason: 'no_review_url' };
  }

  // ── Per-deal dedupe (one campaign per deal, ever) ─────────────────────
  const { data: existing } = await tenantTable(supabase, 'ReviewCampaign', { spaceId })
    .select('id')
    .eq('dealId', dealId)
    .limit(1)
    .maybeSingle();
  if (existing) {
    return { created: false, reason: 'duplicate' };
  }

  // ── Contact, scoped to the tenant ─────────────────────────────────────
  const { data: contactRow } = await tenantTable(supabase, 'Contact', { spaceId })
    .select('id, name, email, phone')
    .eq('id', contactId)
    .maybeSingle();
  if (!contactRow) return { created: false, reason: 'contact_not_found' };
  const contact = contactRow as ContactRow;

  const email = (contact.email ?? '').trim();
  const phone = (contact.phone ?? '').trim();
  const channel: 'email' | 'sms' | null = email ? 'email' : phone ? 'sms' : null;
  if (!channel) {
    logger.info('[review-ask] skipped — no reachable channel', { spaceId, dealId, contactId });
    return { created: false, reason: 'no_channel' };
  }

  // ── Create the campaign row FIRST so we have the id for the tracked link,
  //    which is embedded in the draft body. Status starts 'drafted'; it flips
  //    to 'sent' once the pending draft actually exists. ──────────────────
  const { data: campaignRow, error: campaignErr } = await tenantTable(supabase, 'ReviewCampaign', { spaceId })
    .insert({
      spaceId,
      dealId,
      contactId,
      channel,
      reviewUrl,
      status: 'drafted',
    })
    .select('id')
    .single();
  if (campaignErr || !campaignRow) {
    if ((campaignErr as { code?: string } | null)?.code === '23505') {
      // Concurrent deal-won won the race; their campaign stands.
      return { created: false, reason: 'duplicate' };
    }
    logger.error('[review-ask] campaign insert failed', { spaceId, dealId, err: campaignErr?.message });
    return { created: false, reason: 'insert_failed' };
  }
  const campaignId = (campaignRow as { id: string }).id;
  const reviewLink = reviewTrackingLink(campaignId);

  // ── Compose the voice-matched, grounded opener (fallback to neutral) ──
  let composed: { subject: string | null; body: string } | null = null;
  try {
    composed = await composeQuickDraft({
      kind: 'deal',
      id: dealId,
      intent: 'reach-out',
      channel,
      spaceId,
    });
  } catch (err) {
    logger.warn('[review-ask] compose threw — using neutral opener', { spaceId, dealId }, err);
  }
  const opener = composed?.body?.trim() || neutralReviewOpener(contact.name);
  const body = assembleReviewMessage(channel, opener, reviewLink);
  const subject =
    channel === 'email'
      ? composed?.subject?.trim() || 'A quick favor'
      : null;

  // ── Persist the PENDING draft. It rides the normal approve → send path;
  //    nothing goes out until the realtor approves it. ────────────────────
  const { data: inserted, error: insertError } = await tenantTable(supabase, 'AgentDraft', { spaceId })
    .insert({
      spaceId,
      contactId,
      channel,
      subject,
      content: body,
      reasoning: REVIEW_ASK_REASONING,
      priority: 1,
      status: 'pending',
      idempotencyKey: `review-ask:${spaceId}:${dealId}`,
      triggerSource: { kind: REVIEW_ASK_TRIGGER_KIND, dealId, campaignId },
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    logger.error('[review-ask] draft insert failed', { spaceId, dealId, err: insertError?.message });
    // Mark the campaign skipped so a stuck 'drafted' row can't wedge the
    // per-deal dedupe forever while never being sent.
    await tenantTable(supabase, 'ReviewCampaign', { spaceId })
      .update({ status: 'skipped', updatedAt: new Date().toISOString() })
      .eq('id', campaignId);
    return { created: false, reason: 'insert_failed', campaignId };
  }
  const draftId = (inserted as { id: string }).id;

  // ── Flip the campaign to 'sent' (the nudge cron keys on this + sentAt) ─
  await tenantTable(supabase, 'ReviewCampaign', { spaceId })
    .update({ status: 'sent', sentAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    .eq('id', campaignId);

  // ── Notify the realtor. Only after the draft actually exists. ─────────
  const clientName = (contact.name ?? '').trim() || 'your client';
  const notifyTitle = 'Review request ready';
  const notifyBody =
    channel === 'email'
      ? `Review and send the review request I drafted for ${clientName}.`
      : `Review and send the review text I drafted for ${clientName}.`;
  const notifyUrl = `/s/${space.slug}/chippi/inbox`;
  await Promise.allSettled([
    createAppNotification({
      spaceId,
      type: 'review_request',
      title: notifyTitle,
      body: notifyBody,
      href: notifyUrl,
      priority: 'medium',
    }),
    sendPushToSpace(spaceId, { title: notifyTitle, body: notifyBody, url: notifyUrl }),
  ]);

  logger.info('[review-ask] draft created', { spaceId, dealId, campaignId, draftId, channel });
  return { created: true, campaignId, draftId };
}

/**
 * Fire-and-forget entry point. Never throws and never rejects; registers a
 * shared-promise `after()` keep-alive so the work survives the deal-won
 * response returning (lib/gcal-helpers.ts idiom). Callers in request paths
 * invoke it as `void fireReviewAsk(...)`; tests await it.
 */
export function fireReviewAsk(input: FireReviewAskInput): Promise<ReviewAskOutcome> {
  const task = performReviewAsk(input).catch((err): ReviewAskOutcome => {
    logger.error(
      '[review-ask] failed (non-fatal)',
      { spaceId: input.spaceId, dealId: input.dealId },
      err,
    );
    return { created: false, reason: 'error' };
  });
  try {
    after(() => task);
  } catch {
    // Outside a request scope (unit tests, background workers) — the promise
    // still runs to completion in-process.
  }
  return task;
}
