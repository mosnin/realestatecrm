/**
 * GET /api/cron/cleanup
 *
 * Triggered once per day at 03:00 UTC by the Cloudflare Worker
 * (`docs/WORKER.md`). Calls the Postgres cleanup_agent_data() function which
 * batches-deletes stale rows from ExecutionStep, AgentTask, AgentMemory,
 * ArtifactVersion, and Artifact — capped at 1 000 rows per table per call
 * to avoid long locks. Backlogs drain over successive daily runs.
 *
 * After cleanup, scans last-24h ChatUsage vs each space's credit-grant
 * budget and Sentry-warns when spend exceeds 3× the daily pro-rate.
 *
 * Auth: requires Authorization: Bearer <CRON_SECRET> header. The Worker
 * sends this when CRON_SECRET is set in project env vars.
 * When CRON_SECRET is UNSET we return 500 (a misconfiguration the monitorCron
 * wrapper surfaces to Sentry) rather than a silent 401 that would let the
 * autonomous layer die unnoticed. A present-but-wrong token still gets 401.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { monitorCron } from '@/lib/cron-monitor';
import { alarmDailyCostBudgets } from '@/lib/billing/cost-budget-alarm';

async function handler(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.error('[cron.cleanup] CRON_SECRET env var is not set — rejecting request');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Run cleanup ───────────────────────────────────────────────────────────
  const { data, error } = await supabase.rpc('cleanup_agent_data');

  if (error) {
    logger.error('[cron.cleanup] cleanup_agent_data RPC failed', { err: error.message });
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
  }

  logger.info('[cron.cleanup] cleanup complete', { result: data });

  let costAlarm = { scanned: 0, over: 0 };
  try {
    costAlarm = await alarmDailyCostBudgets();
  } catch (err) {
    logger.error('[cron.cleanup] cost-vs-credits alarm failed', {}, err);
  }

  return NextResponse.json({ ok: true, ...data, costAlarm });
}

export const GET = monitorCron('cleanup', { crontab: '0 3 * * *' }, handler);
