/**
 * GET /api/cron/next-moves
 *
 * Daily tick (10:00 UTC, see vercel.json). Recomputes the agent-suggested
 * "next move" chip for open deals whose nextMoveComputedAt is NULL or older
 * than ~20h — a daily cadence with slack so a slightly-late tick still
 * refreshes yesterday's batch instead of skipping a day.
 *
 * Read-only for the realtor: this writes only the three nextMove* columns on
 * Deal (via lib/deals/next-move.ts). It never sends email or SMS.
 *
 * Auth: Bearer ${CRON_SECRET}, fail-closed (unset secret → 500).
 * Disable: set CRON_NEXT_MOVES_DISABLED=1.
 *
 * Spend guards: ≤100 deals per tick (overflow is picked up next tick — the
 * due-query orders oldest-computed first, so nothing starves), 4 LLM calls in
 * flight at once, and lapsed-paid spaces are skipped per isPremiumAccessBlocked
 * (same gate as /api/cron/routines: free/inactive spaces run on included
 * credits; only lapsed paid states are blocked).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { computeNextMove } from '@/lib/deals/next-move';
import { monitorCron } from '@/lib/cron-monitor';
import { isPremiumAccessBlocked } from '@/lib/api-auth';
import { unscoped } from '@/lib/supabase-guard';


export const runtime = 'nodejs';
// 100 deals at concurrency 4 with a 15s per-call LLM budget stays comfortably
// inside 300s in practice (typical calls are 1-3s); mirrors /api/cron/routines.
export const maxDuration = 300;

// Don't let one tick recompute an unbounded number of deals — the overflow is
// picked up on the next daily tick (oldest-computed first).
const MAX_PER_TICK = 100;
// Parallel computeNextMove calls (each is one LLM completion) in flight.
const MAX_CONCURRENCY = 4;
// A move younger than this is fresh enough; 20h (not 24h) so a late tick
// still refreshes yesterday's batch.
const REFRESH_AFTER_HOURS = 20;

interface DueDeal {
  id: string;
  spaceId: string;
}

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/next-moves] CRON_SECRET is not set — rejecting request');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  if (req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (process.env.CRON_NEXT_MOVES_DISABLED) {
    console.log('[cron/next-moves] CRON_NEXT_MOVES_DISABLED is set — skipping tick');
    return NextResponse.json({ status: 'disabled' });
  }

  const startedAt = Date.now();
  const cutoffIso = new Date(Date.now() - REFRESH_AFTER_HOURS * 3_600_000).toISOString();

  // ── 1. Due deals: open, never computed or computed before the cutoff ────
  const { data: dueRows, error: dueErr } = await unscoped(supabase
    .from('Deal'), 'cron: cross-tenant discovery then per-row work')
    .select('id, spaceId')
    .eq('status', 'active')
    .or(`nextMoveComputedAt.is.null,nextMoveComputedAt.lt.${cutoffIso}`)
    .order('nextMoveComputedAt', { ascending: true, nullsFirst: true })
    .limit(MAX_PER_TICK);
  if (dueErr) {
    console.error('[cron/next-moves] Failed to load due deals', dueErr);
    return NextResponse.json({ error: 'DB query failed' }, { status: 500 });
  }

  const due = (dueRows ?? []) as DueDeal[];
  if (due.length === 0) {
    return NextResponse.json({ due: 0, computed: 0, skipped: 0, durationMs: Date.now() - startedAt });
  }

  // ── 2. Keep only deals in spaces that aren't billing-blocked ────────────
  const spaceIds = [...new Set(due.map((d) => d.spaceId))];
  const { data: spaceRows, error: spaceErr } = await supabase
    .from('Space')
    .select('id, stripeSubscriptionStatus, stripePeriodEnd')
    .in('id', spaceIds);
  if (spaceErr) {
    console.error('[cron/next-moves] Failed to load spaces', spaceErr);
    return NextResponse.json({ error: 'DB query failed' }, { status: 500 });
  }
  const activeSpaces = new Set(
    (spaceRows ?? [])
      .filter(
        (s) =>
          !isPremiumAccessBlocked(
            s.stripeSubscriptionStatus as string,
            s.stripePeriodEnd as string | null,
          ),
      )
      .map((s) => s.id as string),
  );

  const billingRunnable = due.filter((d) => activeSpaces.has(d.spaceId));
  const skippedDeals = due.filter((d) => !activeSpaces.has(d.spaceId));
  const skipped = skippedDeals.length;

  // ── Per-space fairness ──────────────────────────────────────────────────
  // The due query is globally ordered by nextMoveComputedAt, so a space with
  // hundreds of active deals can fill the whole MAX_PER_TICK window every tick
  // and permanently starve smaller spaces. Cap each space to a fair share of
  // the tick; the deals over the cap are simply NOT computed this tick — their
  // nextMoveComputedAt stays old, so they remain due and get picked up next
  // tick. We deliberately do NOT stamp them (unlike billing-gated deals): they
  // MUST stay due. Gated spaces were already removed above, so the share is
  // computed over the spaces we'd actually serve.
  const distinctSpaceCount = new Set(billingRunnable.map((d) => d.spaceId)).size;
  const fairShare =
    distinctSpaceCount > 0
      ? Math.max(5, Math.ceil(MAX_PER_TICK / distinctSpaceCount))
      : MAX_PER_TICK;
  const perSpaceTaken = new Map<string, number>();
  const runnable: DueDeal[] = [];
  let deferredForFairness = 0;
  for (const deal of billingRunnable) {
    const taken = perSpaceTaken.get(deal.spaceId) ?? 0;
    if (taken >= fairShare) {
      deferredForFairness++;
      continue;
    }
    perSpaceTaken.set(deal.spaceId, taken + 1);
    runnable.push(deal);
  }
  if (deferredForFairness > 0) {
    console.log('[cron/next-moves] deferred for per-space fairness', {
      fairShare,
      distinctSpaceCount,
      deferred: deferredForFairness,
    });
  }

  // Stamp skipped deals too — without this, a billing-blocked space's deals
  // keep nextMoveComputedAt NULL forever and permanently occupy the front of
  // the order(nextMoveComputedAt).limit(N) window, starving every OTHER
  // tenant's recomputes (the same starvation shape cron/routines fixed by
  // stamping skipped rows). Stamping only touches the timestamp; the chip
  // text is left as-is.
  if (skippedDeals.length > 0) {
    console.warn('[cron/next-moves] skipped (billing gate)', {
      dealIds: skippedDeals.map((d) => d.id),
    });
    const nowIso = new Date().toISOString();
    const { error: stampErr } = await unscoped(supabase
      .from('Deal'), 'cron: cross-tenant discovery then per-row work')
      .update({ nextMoveComputedAt: nowIso })
      .in('id', skippedDeals.map((d) => d.id));
    if (stampErr) {
      console.error('[cron/next-moves] skip-stamp failed', stampErr);
    }
  }

  // ── 3. Compute with bounded concurrency ─────────────────────────────────
  let computed = 0;
  let errored = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < runnable.length) {
      const deal = runnable[cursor++];
      try {
        const move = await computeNextMove(deal.spaceId, deal.id);
        if (move) computed++;
        else errored++;
      } catch (err) {
        console.error('[cron/next-moves] compute threw', { id: deal.id }, err);
        errored++;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENCY, runnable.length) }, () => worker()),
  );

  const summary = {
    due: due.length,
    computed,
    errored,
    skipped,
    deferred: deferredForFairness,
    durationMs: Date.now() - startedAt,
  };
  console.log('[cron/next-moves] Tick complete', summary);
  return NextResponse.json(summary);
}

export const GET = monitorCron('next-moves', { crontab: '0 10 * * *' }, handler);
