/** Reconcile unresolved runs only against completed trajectories with the same
 * workspace and run ID. Missing completion is surfaced for attention; this
 * process never replays an action after an ambiguous acknowledgement. */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { monitorCron } from '@/lib/cron-monitor';

export const runtime = 'nodejs';

// A run needs SOME time to start and leave a trace before "no artifact yet" is
// meaningful. Below this we leave the row alone (the run is likely still going —
// Modal runs can take minutes).
const CONFIRM_AFTER_MS = 15 * 60 * 1000; // 15 minutes

// If a run STILL has no artifact this long after dispatch, treat it as a failed
// dispatch (the run never produced anything) and flag it for visibility.
const FAIL_AFTER_MS = 45 * 60 * 1000; // 45 minutes

// Don't reconcile ancient rows forever — once a row is well past FAIL_AFTER_MS
// it's already been resolved on a prior tick (or will be this tick). Bound the
// scan window so the query stays cheap as the ledger grows.
const LOOKBACK_MS = 24 * 60 * 60 * 1000; // 24 hours

// Cap rows processed per tick so a backlog can't blow the serverless budget;
// leftovers are picked up next tick.
const MAX_ROWS_PER_TICK = 500;

export const maxDuration = 120;

interface LedgerRow {
  runId: string;
  spaceId: string;
  dispatchedAt: string;
}

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.error('[cron.agent-run-reconcile] CRON_SECRET env var is not set — rejecting request');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (process.env.CRON_RUN_RECONCILE_DISABLED === '1') {
    return NextResponse.json({ ok: true, skipped: 'kill-switch on' });
  }

  const now = Date.now();
  const confirmCutoffIso = new Date(now - CONFIRM_AFTER_MS).toISOString();
  const lookbackIso = new Date(now - LOOKBACK_MS).toISOString();

  // Unconfirmed rows old enough to evaluate, within the lookback window.
  const { data: rows, error } = await supabase
    .from('AgentRunLedger')
    .select('runId, spaceId, dispatchedAt')
    .in('status', ['dispatched', 'in_flight'])
    .lt('dispatchedAt', confirmCutoffIso)
    .gte('dispatchedAt', lookbackIso)
    .order('dispatchedAt', { ascending: true })
    .limit(MAX_ROWS_PER_TICK);

  if (error) {
    logger.error('[cron.agent-run-reconcile] failed to load ledger rows', { err: error.message });
    return NextResponse.json({ error: 'DB query failed' }, { status: 500 });
  }

  const ledgerRows = (rows ?? []) as LedgerRow[];
  let confirmed = 0;
  let failed = 0;
  let pending = 0; // still unconfirmed but not yet past the fail threshold

  for (const row of ledgerRows) {
    const hasArtifact = await runArtifactExists(row.spaceId, row.runId);
    if (hasArtifact) {
      const nowIso = new Date().toISOString();
      const { error: updErr } = await supabase
        .from('AgentRunLedger')
        .update({ status: 'confirmed', confirmedAt: nowIso, updatedAt: nowIso })
        .eq('runId', row.runId)
        .in('status', ['dispatched', 'in_flight']);
      if (updErr) {
        logger.warn('[cron.agent-run-reconcile] confirm update failed', { runId: row.runId, err: updErr.message });
      } else {
        confirmed++;
      }
      continue;
    }

    // No artifact. Only flag as failed once we're past the longer threshold —
    // before that the run may simply still be in flight.
    const dispatchedMs = new Date(row.dispatchedAt).getTime();
    if (now - dispatchedMs >= FAIL_AFTER_MS) {
      const nowIso = new Date().toISOString();
      const { error: updErr } = await supabase
        .from('AgentRunLedger')
        .update({ status: 'failed', failureReason: 'no_artifact', updatedAt: nowIso })
        .eq('runId', row.runId)
        .in('status', ['dispatched', 'in_flight']);
      if (updErr) {
        logger.warn('[cron.agent-run-reconcile] fail update failed', { runId: row.runId, err: updErr.message });
      } else {
        failed++;
      }
    } else {
      pending++;
    }
  }

  const summary = {
    ok: true,
    scanned: ledgerRows.length,
    confirmed,
    failed,
    pending,
  };
  logger.info('[cron.agent-run-reconcile] reconcile complete', summary);
  return NextResponse.json(summary);
}

async function runArtifactExists(spaceId: string, runId: string): Promise<boolean> {
  const trajectory = await supabase
    .from('AgentTrajectory')
    .select('id')
    .eq('spaceId', spaceId)
    .eq('runId', runId)
    .eq('status', 'completed')
    .limit(1);
  return !trajectory.error && (trajectory.data?.length ?? 0) > 0;
}

export const GET = monitorCron('agent-run-reconcile', { crontab: '*/15 * * * *' }, handler);
