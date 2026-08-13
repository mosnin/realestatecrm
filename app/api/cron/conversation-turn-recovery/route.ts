import { NextRequest, NextResponse } from 'next/server';

import { monitorCron } from '@/lib/cron-monitor';
import { logger } from '@/lib/logger';
import { supabase } from '@/lib/supabase';
import { recoverExpiredConversationTurns } from '@/lib/chat/turn-control';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.error('[cron.conversation-turn-recovery] CRON_SECRET is not configured');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (process.env.CRON_CONVERSATION_TURN_RECOVERY_DISABLED === '1') {
    return NextResponse.json({ ok: true, skipped: 'kill-switch on' });
  }

  try {
    const startedAt = performance.now();
    const recovered = await recoverExpiredConversationTurns(supabase, 100);
    const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
    const summary = recovered.reduce(
      (value, row) => {
        value.scanned++;
        if (row.previousStatus === 'running') value.running++;
        else value.paused++;
        return value;
      },
      { scanned: 0, running: 0, paused: 0 },
    );
    logger.info('[cron.conversation-turn-recovery] reconcile complete', {
      ...summary,
      durationMs,
    });
    return NextResponse.json({ ok: true, ...summary, durationMs });
  } catch (error) {
    logger.error('[cron.conversation-turn-recovery] reconcile failed', {}, error);
    return NextResponse.json({ error: 'Conversation turn recovery failed' }, { status: 500 });
  }
}

export const GET = monitorCron(
  'conversation-turn-recovery',
  { crontab: '*/5 * * * *', checkinMarginMinutes: 2, maxRuntimeMinutes: 1 },
  handler,
);
