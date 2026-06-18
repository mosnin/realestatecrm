import { NextRequest, NextResponse } from 'next/server';
import { runTourReminders } from '@/lib/tour-reminders';
import { monitorCron } from '@/lib/cron-monitor';
import { logger } from '@/lib/logger';

/**
 * GET /api/cron/tour-reminders
 *
 * Every 15 minutes. Sends due tour reminders (24h "tomorrow" + 1h "today"
 * nudges) to guests via email + SMS. The actual work lives in
 * `runTourReminders` (app/api/tours/reminders) so the POST endpoint and this
 * cron share one sender.
 *
 * Idempotency lives in the sender, not here: each tour's reminder columns are
 * claimed conditionally before sending, so firing every 15 min across the
 * reminder window can't double-send. No day-lock needed (and would be wrong —
 * we WANT this to run many times per day, just not to re-send any one tour).
 */
async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.error('[cron/tour-reminders] CRON_SECRET env var is not set — rejecting request');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { processed } = await runTourReminders();
    return NextResponse.json({ sent: processed });
  } catch (err) {
    logger.error('[cron/tour-reminders] send failed', undefined, err);
    return NextResponse.json({ error: 'Reminder run failed' }, { status: 500 });
  }
}

export const GET = monitorCron('tour-reminders', { crontab: '*/15 * * * *' }, handler);
