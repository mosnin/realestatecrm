/**
 * GET /api/cron/review-nudge
 *
 * Daily tick (16:30 UTC). The nudge half of the Post-Close Reputation Engine:
 * finds review campaigns whose link went un-clicked, drafts ONE polite
 * follow-up, and stamps nudgedAt so a campaign is never nudged twice.
 *
 * A campaign is due when status='sent', its link hasn't been clicked
 * (clickedAt IS NULL), it hasn't already been nudged (nudgedAt IS NULL), and it
 * was sent more than 3 days ago. Bounded to 50 per tick (overflow rides the
 * next tick — the scan orders oldest-sent first, so nothing starves).
 *
 * Like every other AgentDraft path, this NEVER sends: it drops a PENDING draft
 * into the inbox/approve → send pipeline. Only the realtor approving it fires
 * an outbound channel.
 *
 * Auth: Bearer ${CRON_SECRET}, fail-closed (unset secret → 500).
 * Disable: set CRON_REVIEW_NUDGE_DISABLED=1.
 * Spend guard: lapsed-paid spaces are skipped per isPremiumAccessBlocked (same
 * gate as /api/cron/routines and /api/cron/next-moves).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { monitorCron } from '@/lib/cron-monitor';
import { isPremiumAccessBlocked } from '@/lib/api-auth';
import { composeQuickDraft } from '@/lib/agent/quick-draft';
import { createAppNotification } from '@/lib/notifications';
import { unscoped } from '@/lib/supabase-guard';
import {
  REVIEW_NUDGE_REASONING,
  REVIEW_ASK_TRIGGER_KIND,
  assembleReviewMessage,
  reviewTrackingLink,
  neutralNudgeOpener,
} from '@/lib/reputation/review-engine';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Un-clicked for at least this long before we chase it.
const NUDGE_AFTER_DAYS = 3;
// Cap drafts per tick — overflow rides the next tick (oldest-sent first).
const MAX_PER_TICK = 50;
// Parallel compose+insert operations in flight (each nudge is one LLM call).
const MAX_CONCURRENCY = 4;

interface DueCampaign {
  id: string;
  spaceId: string;
  dealId: string | null;
  contactId: string | null;
  channel: string | null;
}

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/review-nudge] CRON_SECRET is not set — rejecting request');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  if (req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (process.env.CRON_REVIEW_NUDGE_DISABLED) {
    console.log('[cron/review-nudge] CRON_REVIEW_NUDGE_DISABLED is set — skipping tick');
    return NextResponse.json({ status: 'disabled' });
  }

  const startedAt = Date.now();
  const cutoffIso = new Date(Date.now() - NUDGE_AFTER_DAYS * 86_400_000).toISOString();

  // ── 1. Due campaigns: sent, un-clicked, un-nudged, stale ────────────────
  const { data: dueRows, error: dueErr } = await unscoped(supabase
    .from('ReviewCampaign'), 'cron: cross-tenant discovery then per-row work')
    .select('id, spaceId, dealId, contactId, channel')
    .eq('status', 'sent')
    .is('clickedAt', null)
    .is('nudgedAt', null)
    .lte('sentAt', cutoffIso)
    .order('sentAt', { ascending: true })
    .limit(MAX_PER_TICK);
  if (dueErr) {
    console.error('[cron/review-nudge] Failed to load due campaigns', dueErr);
    return NextResponse.json({ error: 'DB query failed' }, { status: 500 });
  }

  const due = (dueRows ?? []) as DueCampaign[];
  if (due.length === 0) {
    return NextResponse.json({ due: 0, nudged: 0, skipped: 0, durationMs: Date.now() - startedAt });
  }

  // ── 2. Keep only campaigns in spaces that aren't billing-blocked ────────
  const spaceIds = [...new Set(due.map((c) => c.spaceId))];
  const { data: spaceRows, error: spaceErr } = await supabase
    .from('Space')
    .select('id, slug, stripeSubscriptionStatus, stripePeriodEnd')
    .in('id', spaceIds);
  if (spaceErr) {
    console.error('[cron/review-nudge] Failed to load spaces', spaceErr);
    return NextResponse.json({ error: 'DB query failed' }, { status: 500 });
  }
  const slugBySpace = new Map<string, string>();
  const activeSpaces = new Set<string>();
  for (const s of spaceRows ?? []) {
    const row = s as { id: string; slug: string | null; stripeSubscriptionStatus: string | null; stripePeriodEnd: string | null };
    if (row.slug) slugBySpace.set(row.id, row.slug);
    if (!isPremiumAccessBlocked(row.stripeSubscriptionStatus, row.stripePeriodEnd)) {
      activeSpaces.add(row.id);
    }
  }

  const runnable = due.filter((c) => activeSpaces.has(c.spaceId));
  const skippedCampaigns = due.filter((c) => !activeSpaces.has(c.spaceId));

  // Stamp billing-skipped campaigns as nudged too — otherwise their stale
  // sentAt keeps them at the front of the order(sentAt).limit(N) window
  // forever, starving nudge-able campaigns behind them (the starvation shape
  // cron/next-moves fixed by stamping skipped rows). The nudge is a
  // time-sensitive, best-effort touch; a lapsed space forfeits it.
  if (skippedCampaigns.length > 0) {
    const nowIso = new Date().toISOString();
    const { error: stampErr } = await unscoped(supabase
      .from('ReviewCampaign'), 'cron: cross-tenant discovery then per-row work')
      .update({ nudgedAt: nowIso, updatedAt: nowIso })
      .in('id', skippedCampaigns.map((c) => c.id));
    if (stampErr) {
      console.error('[cron/review-nudge] skip-stamp failed', stampErr);
    }
  }

  // ── 3. Draft one nudge per campaign, bounded concurrency ────────────────
  let nudged = 0;
  let errored = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < runnable.length) {
      const campaign = runnable[cursor++];
      try {
        const ok = await draftNudge(campaign, slugBySpace.get(campaign.spaceId) ?? null);
        if (ok) nudged++;
        else errored++;
      } catch (err) {
        console.error('[cron/review-nudge] draft threw', { id: campaign.id }, err);
        errored++;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENCY, runnable.length) }, () => worker()),
  );

  const summary = {
    due: due.length,
    nudged,
    errored,
    skipped: skippedCampaigns.length,
    durationMs: Date.now() - startedAt,
  };
  console.log('[cron/review-nudge] Tick complete', summary);
  return NextResponse.json(summary);
}

/**
 * Compose + insert ONE pending nudge draft for a campaign, then stamp nudgedAt
 * so the campaign leaves the scan window and is never nudged again. Returns
 * true when the draft landed. Stamps nudgedAt even when the contact/channel is
 * gone (nothing to draft) so a dead campaign can't loop the scan forever.
 */
async function draftNudge(campaign: DueCampaign, slug: string | null): Promise<boolean> {
  const { id: campaignId, spaceId, dealId, contactId } = campaign;
  const nowIso = new Date().toISOString();

  // Confirm the contact is still reachable, scoped to the tenant.
  let contactName: string | null = null;
  let channel: 'email' | 'sms' | null = null;
  if (contactId) {
    const { data: contactRow } = await supabase
      .from('Contact')
      .select('id, name, email, phone')
      .eq('id', contactId)
      .eq('spaceId', spaceId)
      .maybeSingle();
    const c = contactRow as { name: string | null; email: string | null; phone: string | null } | null;
    if (c) {
      contactName = c.name;
      const email = (c.email ?? '').trim();
      const phone = (c.phone ?? '').trim();
      channel = email ? 'email' : phone ? 'sms' : null;
    }
  }

  // No reachable contact — stamp so the campaign exits the scan and move on.
  if (!channel) {
    await supabase
      .from('ReviewCampaign')
      .update({ nudgedAt: nowIso, updatedAt: nowIso })
      .eq('id', campaignId)
      .eq('spaceId', spaceId);
    logger.info('[review-nudge] no reachable contact — stamped, no draft', { campaignId });
    return false;
  }

  // Voice-matched opener (best-effort) → neutral fallback. The tracked link is
  // appended deterministically, never invented by the model.
  let composed: { subject: string | null; body: string } | null = null;
  if (dealId) {
    try {
      composed = await composeQuickDraft({ kind: 'deal', id: dealId, intent: 'reach-out', channel, spaceId });
    } catch (err) {
      logger.warn('[review-nudge] compose threw — using neutral opener', { campaignId }, err);
    }
  }
  const opener = composed?.body?.trim() || neutralNudgeOpener(contactName);
  const body = assembleReviewMessage(channel, opener, reviewTrackingLink(campaignId));
  const subject = channel === 'email' ? composed?.subject?.trim() || 'Following up' : null;

  const { data: inserted, error: insertError } = await supabase
    .from('AgentDraft')
    .insert({
      spaceId,
      contactId,
      channel,
      subject,
      content: body,
      reasoning: REVIEW_NUDGE_REASONING,
      priority: 1,
      status: 'pending',
      idempotencyKey: `review-nudge:${spaceId}:${campaignId}`,
      triggerSource: { kind: REVIEW_ASK_TRIGGER_KIND, dealId, campaignId, nudge: true },
    })
    .select('id')
    .single();

  // Stamp nudgedAt regardless of a duplicate-key insert (idempotencyKey race):
  // the campaign has had its single nudge and must exit the scan either way.
  await supabase
    .from('ReviewCampaign')
    .update({ nudgedAt: nowIso, updatedAt: nowIso })
    .eq('id', campaignId)
    .eq('spaceId', spaceId);

  if (insertError || !inserted) {
    if ((insertError as { code?: string } | null)?.code === '23505') {
      // A nudge already exists for this campaign — stamped above, done.
      return true;
    }
    logger.error('[review-nudge] draft insert failed', { campaignId, err: insertError?.message });
    return false;
  }

  const clientName = (contactName ?? '').trim() || 'your client';
  const notifyTitle = 'Review nudge ready';
  const notifyBody = `${clientName} hasn't opened the review link yet — review and send the follow-up I drafted.`;
  await Promise.allSettled([
    createAppNotification({
      spaceId,
      type: 'review_request',
      title: notifyTitle,
      body: notifyBody,
      href: slug ? `/s/${slug}/chippi/inbox` : null,
      spacePath: slug ? null : '/chippi/inbox',
      priority: 'low',
    }),
  ]);

  logger.info('[review-nudge] draft created', { campaignId, channel });
  return true;
}

export const GET = monitorCron('review-nudge', { crontab: '30 16 * * *' }, handler);
