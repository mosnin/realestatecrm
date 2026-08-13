import { NextRequest, NextResponse } from 'next/server';

import { monitorCron } from '@/lib/cron-monitor';
import { logger } from '@/lib/logger';
import { reconcileWorkSessionActionExecutions } from '@/lib/work-sessions/actions';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.error('[cron.work-session-action-recovery] CRON_SECRET is not configured');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const startedAt = performance.now();
    const summary = await reconcileWorkSessionActionExecutions();
    const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
    logger.info('[cron.work-session-action-recovery] reconcile complete', {
      ...summary,
      durationMs,
    });
    return NextResponse.json({ ok: true, ...summary, durationMs });
  } catch (error) {
    logger.error('[cron.work-session-action-recovery] reconcile failed', {}, error);
    return NextResponse.json({ error: 'WorkSession action recovery failed' }, { status: 500 });
  }
}

export const GET = monitorCron(
  'work-session-action-recovery',
  { crontab: '*/5 * * * *', checkinMarginMinutes: 2, maxRuntimeMinutes: 1 },
  handler,
);
