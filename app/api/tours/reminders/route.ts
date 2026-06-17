import { NextRequest, NextResponse } from 'next/server';
import { runTourReminders } from '@/lib/tour-reminders';
import { logger } from '@/lib/logger';

/**
 * POST — manual / legacy tour-reminder trigger, protected by CRON_SECRET.
 *
 * Sends due reminders (24h "tomorrow" + 1h "today" nudges to guests via
 * email + SMS) rather than just listing them. The actual work + idempotency
 * lives in `runTourReminders` (lib/tour-reminders), shared with the
 * `/api/cron/tour-reminders` Vercel cron that drives it every 15 minutes.
 */
export async function POST(req: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    logger.error('[tours/reminders] CRON_SECRET env var is not set — rejecting request');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  // Only accept secret via headers (never query params — those appear in logs)
  const secret = req.headers.get('x-cron-secret') || req.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { processed, reminders } = await runTourReminders();
  return NextResponse.json({
    processed,
    // Keep the prior response shape (a `reminders` array); entries now also
    // carry the delivery result.
    reminders,
    timestamp: new Date().toISOString(),
  });
}
