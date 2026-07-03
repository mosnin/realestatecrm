/**
 * GET /api/cron/cleanup
 *
 * Triggered once per day at 03:00 UTC by Vercel Cron (see vercel.json).
 * Calls the Postgres cleanup_agent_data() function which batches-deletes
 * stale rows from ExecutionStep, AgentTask, AgentMemory, ArtifactVersion,
 * and Artifact — capped at 1 000 rows per table per call to avoid long
 * locks. Backlogs drain over successive daily runs.
 *
 * Auth: requires Authorization: Bearer <CRON_SECRET> header. Vercel Cron
 * injects this automatically when CRON_SECRET is set in project env vars.
 * When CRON_SECRET is UNSET we return 500 (a misconfiguration the monitorCron
 * wrapper surfaces to Sentry) rather than a silent 401 that would let the
 * autonomous layer die unnoticed. A present-but-wrong token still gets 401.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { monitorCron } from '@/lib/cron-monitor';

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

  return NextResponse.json({ ok: true, ...data });
}

export const GET = monitorCron('cleanup', { crontab: '0 3 * * *' }, handler);
