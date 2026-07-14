/**
 * GET /api/cron/broker-routines
 *
 * Hourly tick. Finds every enabled BrokerRoutine whose nextRunAt has passed and
 * fires the Modal autonomous run (broker mode) with the routine's instruction
 * attached.
 *
 * IMPORTANT: This endpoint never sends email or SMS. It triggers the Modal
 * agent path — the run produces AgentDraft rows with status 'pending'. Only a
 * broker approving a draft fires an outbound channel.
 *
 * Auth: Bearer ${CRON_SECRET}. Disable: set CRON_BROKER_ROUTINES_DISABLED=1.
 *
 * Advancing the schedule is not this route's job — stamping lastRunAt fires
 * the BrokerRoutine table trigger, which recomputes nextRunAt to the next slot.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fireBrokerRoutineRun } from '@/lib/broker-routines';
import { monitorCron } from '@/lib/cron-monitor';
import { isPremiumAccessBlocked } from '@/lib/api-auth';

export const runtime = 'nodejs';
// Match the space-routine cron's budget: broker dispatch shares fireRoutineRun's
// in-process fallback path, which blocks the route until the run finishes.
export const maxDuration = 300;

// Don't let one tick fire an unbounded number of webhooks — the overflow
// is picked up on the next hourly tick.
const MAX_PER_TICK = 250;
// Parallel Modal dispatches in flight at once.
const MAX_CONCURRENCY = 8;

interface DueRoutine {
  id: string;
  brokerageId: string;
  instruction: string;
}

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/broker-routines] CRON_SECRET is not set — rejecting request');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  if (req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (process.env.CRON_BROKER_ROUTINES_DISABLED) {
    console.log('[cron/broker-routines] CRON_BROKER_ROUTINES_DISABLED is set — skipping tick');
    return NextResponse.json({ status: 'disabled' });
  }

  const startedAt = Date.now();
  const nowIso = new Date().toISOString();

  // ── 1. Due routines ─────────────────────────────────────────────────────
  const { data: dueRows, error: dueErr } = await supabase
    .from('BrokerRoutine')
    .select('id, brokerageId, instruction')
    .eq('enabled', true)
    .lte('nextRunAt', nowIso)
    .order('nextRunAt', { ascending: true })
    .limit(MAX_PER_TICK);
  if (dueErr) {
    console.error('[cron/broker-routines] Failed to load due routines', dueErr);
    return NextResponse.json({ error: 'DB query failed' }, { status: 500 });
  }

  const due = (dueRows ?? []) as DueRoutine[];
  if (due.length === 0) {
    return NextResponse.json({ due: 0, fired: 0, skipped: 0, durationMs: Date.now() - startedAt });
  }

  // ── 2. Keep only routines for brokerages with a live subscription ────────
  const brokerageIds = [...new Set(due.map((r) => r.brokerageId))];
  const { data: brokerageRows, error: brokerageErr } = await supabase
    .from('Brokerage')
    .select('id, stripeSubscriptionStatus, stripePeriodEnd')
    .in('id', brokerageIds);
  if (brokerageErr) {
    console.error('[cron/broker-routines] Failed to load brokerages', brokerageErr);
    return NextResponse.json({ error: 'DB query failed' }, { status: 500 });
  }
  // Gate on isPremiumAccessBlocked, not hasCurrentSubscription — see
  // app/api/cron/routines: the fail-closed gate silently skipped every
  // brokerage whose stripePeriodEnd was never backfilled.
  const activeBrokerages = new Set(
    (brokerageRows ?? [])
      .filter(
        (b) =>
          !isPremiumAccessBlocked(
            b.stripeSubscriptionStatus as string,
            b.stripePeriodEnd as string | null,
          ),
      )
      .map((b) => b.id as string),
  );

  const runnable = due.filter((r) => activeBrokerages.has(r.brokerageId));
  const skippedRoutines = due.filter((r) => !activeBrokerages.has(r.brokerageId));
  const skippedInactive = skippedRoutines.length;

  // Stamp skipped routines so their stale nextRunAt can't starve the
  // dispatch window; log which ones were gated. Mirrors cron/routines.
  if (skippedRoutines.length > 0) {
    console.warn('[cron/broker-routines] skipped (subscription gate)', {
      routineIds: skippedRoutines.map((r) => r.id),
    });
    await Promise.all(
      skippedRoutines.map(async (r) => {
        const nowIso = new Date().toISOString();
        const { error: stampErr } = await supabase
          .from('BrokerRoutine')
          .update({ lastRunAt: nowIso, lastRunStatus: 'skipped' })
          .eq('id', r.id);
        if (stampErr) {
          // Pre-migration fallback — see cron/routines: stamping lastRunAt
          // alone still advances nextRunAt, which is the anti-starvation part.
          const { error: fallbackErr } = await supabase
            .from('BrokerRoutine')
            .update({ lastRunAt: nowIso })
            .eq('id', r.id);
          if (fallbackErr) {
            console.error('[cron/broker-routines] skip-stamp failed', { id: r.id }, fallbackErr);
          }
        }
      }),
    );
  }

  // ── 3. Fire with bounded concurrency ────────────────────────────────────
  let fired = 0;
  let errored = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < runnable.length) {
      const routine = runnable[cursor++];
      let status: 'ok' | 'error';
      try {
        status = await fireBrokerRoutineRun(routine.brokerageId, routine.instruction);
      } catch (err) {
        console.error('[cron/broker-routines] dispatch threw', { id: routine.id }, err);
        status = 'error';
      }
      if (status === 'ok') fired++;
      else errored++;

      // Stamping lastRunAt fires the trigger that advances nextRunAt — even
      // on 'error', so a permanently failing dispatch can't jam the queue.
      await supabase
        .from('BrokerRoutine')
        .update({ lastRunAt: new Date().toISOString(), lastRunStatus: status })
        .eq('id', routine.id);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENCY, runnable.length) }, () => worker()),
  );

  const summary = {
    due: due.length,
    fired,
    errored,
    skipped: skippedInactive,
    durationMs: Date.now() - startedAt,
  };
  console.log('[cron/broker-routines] Tick complete', summary);
  return NextResponse.json(summary);
}

export const GET = monitorCron('broker-routines', { crontab: '0 * * * *' }, handler);
