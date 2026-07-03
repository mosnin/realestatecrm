/**
 * GET /api/cron/seat-reconcile
 *
 * Nightly per-seat billing reconciliation (Fix #1, drift healer).
 *
 * The membership-change paths (join / invite-accept / offboard / member-remove /
 * admin-remove) each fire-and-forget syncBrokerageSeatBilling after the write so
 * the Stripe per-unit add-on quantity tracks the active member count in real
 * time. But that sync is best-effort: a Stripe blip, a crashed request, or a
 * membership row added/removed by a path that forgot to sync would leave the
 * subscription quantity DRIFTED from reality — silently over- or under-billing
 * seats until someone notices on the invoice.
 *
 * This sweep closes that gap. For every Brokerage with a live subscription
 * (stripeSubscriptionStatus active|trialing AND a stripeSubscriptionId) it
 * re-runs the SAME idempotent sync the membership paths use. The sync recomputes
 * the correct billable add-on count from the live BrokerageMembership count and
 * converges Stripe to it — a no-op when already correct, a corrective Stripe
 * write (logged as drift) when not. Re-running is safe and self-healing.
 *
 * Auth: Bearer ${CRON_SECRET} (matches the other crons). Returns 401 on a
 * missing/wrong header and 500 if CRON_SECRET is unset (never run unauthed).
 *
 * Safety: per-brokerage try/catch so one failure can't abort the run; the sync
 * itself never throws and never multiplies the flat base bundle (it only ever
 * touches the separate per-unit add-on line), so the worst case for any single
 * brokerage is "left unchanged this pass, retried tomorrow" — never a double
 * bill or a wrongly dropped seat.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { monitorCron } from '@/lib/cron-monitor';
import { syncBrokerageSeatBilling } from '@/lib/billing/brokerage-seat-billing';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface ReconcileSummary {
  ok: boolean;
  scanned: number;
  corrected: number;
  noop: number;
  skipped: number;
  failed: number;
}

async function handler(req: NextRequest): Promise<NextResponse> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/seat-reconcile] CRON_SECRET not set — rejecting');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Fetch every brokerage with a live subscription ──────────────────────────
  // Only active/trialing subs with a real subscription id can carry a per-seat
  // line; everything else (canceled, past_due, no sub) is skipped by the sync
  // anyway, so we narrow the query up front to keep the sweep cheap.
  const { data: brokerages, error } = await supabase
    .from('Brokerage')
    .select('id, plan, stripeSubscriptionId, stripeSubscriptionStatus')
    .in('stripeSubscriptionStatus', ['active', 'trialing'])
    .not('stripeSubscriptionId', 'is', null);

  if (error) {
    logger.error('[cron/seat-reconcile] brokerage fetch failed', { err: error.message });
    return NextResponse.json({ ok: false, error: 'Seat reconciliation failed' }, { status: 500 });
  }

  const summary: ReconcileSummary = {
    ok: true,
    scanned: brokerages?.length ?? 0,
    corrected: 0,
    noop: 0,
    skipped: 0,
    failed: 0,
  };

  for (const brokerage of brokerages ?? []) {
    try {
      // Re-run the same idempotent sync the membership paths use. It recomputes
      // the billable add-on seats from the live member count and converges
      // Stripe — 'updated' means it had to CORRECT real drift.
      const result = await syncBrokerageSeatBilling(brokerage.id);

      if (result.status === 'updated') {
        summary.corrected++;
        // Drift corrected — log loudly so we can audit how often events are
        // being missed and which brokerages were mis-billed before this heal.
        logger.warn('[cron/seat-reconcile] corrected seat drift', {
          brokerageId: brokerage.id,
          plan: brokerage.plan,
          subscriptionId: brokerage.stripeSubscriptionId,
          addonQuantity: result.addonQuantity,
        });
      } else if (result.status === 'noop') {
        summary.noop++;
      } else {
        summary.skipped++;
      }
    } catch (err) {
      // Defensive: syncBrokerageSeatBilling already swallows its own errors and
      // returns a 'skipped' result, but never let an unexpected throw abort the
      // whole sweep for the remaining brokerages.
      summary.failed++;
      logger.error('[cron/seat-reconcile] brokerage reconcile failed', { brokerageId: brokerage.id }, err);
    }
  }

  logger.info('[cron/seat-reconcile] reconcile complete', { ...summary });

  return NextResponse.json(summary);
}

export const GET = monitorCron('seat-reconcile', { crontab: '30 4 * * *' }, handler);
