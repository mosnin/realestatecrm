import { NextRequest, NextResponse } from 'next/server';

import { monitorCron } from '@/lib/cron-monitor';
import { logger } from '@/lib/logger';
import { reconcileWorkspaceRunLaunches } from '@/lib/workspace-runs/recovery';
import { isWorkspaceRunRecoveryEnabled } from '@/lib/chippi/workspace-run-flag';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.error('[cron.workspace-run-recovery] CRON_SECRET is not configured');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (process.env.CRON_WORKSPACE_RUN_RECOVERY_DISABLED === '1') {
    return NextResponse.json({ ok: true, skipped: 'kill-switch on' });
  }
  if (!isWorkspaceRunRecoveryEnabled()) {
    return NextResponse.json({ ok: true, skipped: 'feature-off' });
  }

  try {
    const startedAt = performance.now();
    const summary = await reconcileWorkspaceRunLaunches();
    const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
    logger.info('[cron.workspace-run-recovery] reconcile complete', { ...summary, durationMs });
    return NextResponse.json({ ok: true, ...summary, durationMs });
  } catch (error) {
    logger.error('[cron.workspace-run-recovery] reconcile failed', {}, error);
    return NextResponse.json({ error: 'Workspace recovery failed' }, { status: 500 });
  }
}

export const GET = monitorCron(
  'workspace-run-recovery',
  { crontab: '*/5 * * * *', checkinMarginMinutes: 2, maxRuntimeMinutes: 2 },
  handler,
);
