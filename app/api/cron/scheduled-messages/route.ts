/**
 * GET /api/cron/scheduled-messages
 *
 * Tick (every 15 min). Loads every due "ScheduledMessage" (status 'pending',
 * sendAt <= now) and dispatches it per the scheduling workflow's autonomy:
 *   draft  — draft only (AgentDraft); never sends.
 *   notify — draft + notify the realtor a draft is ready; never sends.
 *   auto   — actually send, behind a rate limit + audit + realtor notification.
 *
 * SAFETY: "Chippi never sends without a tap" UNLESS autonomy='auto'. The
 * enforcement lives in lib/workflows/scheduled-dispatch — draft/notify can never
 * reach a transport. This route is the trigger + auth wrapper only.
 *
 * Auth: Bearer ${CRON_SECRET}. Disable: set CRON_SCHEDULED_MESSAGES_DISABLED=1.
 */

import { NextRequest, NextResponse } from 'next/server';
import { dispatchDueScheduledMessages } from '@/lib/workflows/scheduled-dispatch';
import { monitorCron } from '@/lib/cron-monitor';

export const runtime = 'nodejs';
// The 'draft'/'notify' paths drive the headless agent runtime (runAutonomousInstruction),
// which can take well over a minute. Give the function the same generous budget
// the routines/workflows crons use rather than risk a draft cut off mid-flight.
export const maxDuration = 300;

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/scheduled-messages] CRON_SECRET is not set — rejecting request');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  if (req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (process.env.CRON_SCHEDULED_MESSAGES_DISABLED) {
    console.log('[cron/scheduled-messages] CRON_SCHEDULED_MESSAGES_DISABLED is set — skipping tick');
    return NextResponse.json({ status: 'disabled' });
  }

  const startedAt = Date.now();
  const summary = await dispatchDueScheduledMessages();
  const result = { ...summary, durationMs: Date.now() - startedAt };
  console.log('[cron/scheduled-messages] Tick complete', result);
  return NextResponse.json(result);
}

export const GET = monitorCron('scheduled-messages', { crontab: '*/15 * * * *' }, handler);
