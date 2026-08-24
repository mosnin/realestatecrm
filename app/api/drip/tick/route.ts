/**
 * GET /api/drip/tick
 *
 * Cron tick (every 30 min — Cloudflare Worker `cron-drip-tick`). Discovers
 * every space with a live drip enrollment and advances each space's due
 * steps (lib/drip/engine.ts's advanceAllDueSpaces): stop-on-reply first, else
 * schedule the due step as a "ScheduledMessage" for the EXISTING
 * scheduled-message dispatcher to pick up on its own cron. This route is the
 * trigger + auth wrapper only — no send happens here.
 *
 * Auth: Bearer ${CRON_SECRET}, same convention as every app/api/cron/* route.
 * Disable: set CRON_DRIP_DISABLED=1 to short-circuit without doing work.
 */

import { NextRequest, NextResponse } from 'next/server';
import { advanceAllDueSpaces } from '@/lib/drip/engine';
import { monitorCron } from '@/lib/cron-monitor';

export const runtime = 'nodejs';
export const maxDuration = 120;

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[drip/tick] CRON_SECRET is not set — rejecting request');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  if (req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (process.env.CRON_DRIP_DISABLED) {
    console.log('[drip/tick] CRON_DRIP_DISABLED is set — skipping tick');
    return NextResponse.json({ status: 'disabled' });
  }

  const startedAt = Date.now();
  const summaries = await advanceAllDueSpaces();
  const result = {
    spacesProcessed: summaries.length,
    due: summaries.reduce((n, s) => n + s.due, 0),
    scheduled: summaries.reduce((n, s) => n + s.scheduled, 0),
    stoppedReplied: summaries.reduce((n, s) => n + s.stoppedReplied, 0),
    completed: summaries.reduce((n, s) => n + s.completed, 0),
    failed: summaries.reduce((n, s) => n + s.failed, 0),
    durationMs: Date.now() - startedAt,
  };
  console.log('[drip/tick] Tick complete', result);
  return NextResponse.json(result);
}

export const GET = monitorCron('drip-tick', { crontab: '*/30 * * * *' }, handler);
