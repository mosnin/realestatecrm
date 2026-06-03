import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendTourReminder, type TourEmailData } from '@/lib/tour-emails';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Tour reminder cron endpoint.
 * Runs hourly (see vercel.json). Finds tours starting within the next 24h
 * and sends a reminder email to each guest via sendTourReminder.
 *
 * Best-effort per tour: one failed send never aborts the batch.
 *
 * Idempotency: each tour carries a `reminderSentAt` column (migration
 * 20260614000000). We only select tours where it IS NULL and stamp it after a
 * successful send, so a tour is reminded exactly once no matter how often the
 * cron fires (manual trigger, Vercel retry, redeploy).
 *
 * Auth: Vercel cron sends `Authorization: Bearer ${CRON_SECRET}`.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[tours/reminders] CRON_SECRET is not set — rejecting request');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  if (req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  // Any upcoming tour starting within the next 24h that hasn't been reminded
  // yet. reminderSentAt (stamped after a successful send below) is the hard
  // de-dupe, so the window can be the full 24h — late bookings still get a
  // reminder, and re-runs never double-send.
  const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const { data: tours } = await supabase
    .from('Tour')
    .select('id, guestName, guestEmail, guestPhone, propertyAddress, startsAt, endsAt, status, spaceId')
    .in('status', ['scheduled', 'confirmed'])
    .is('reminderSentAt', null)
    .gte('startsAt', now.toISOString())
    .lte('startsAt', windowEnd.toISOString())
    .order('startsAt', { ascending: true })
    .limit(100);

  if (!tours?.length) {
    return NextResponse.json({ sent: 0, failed: 0, timestamp: now.toISOString() });
  }

  const spaceIds = [...new Set(tours.map((t: any) => t.spaceId))];

  const { data: settings } = await supabase
    .from('SpaceSetting')
    .select('spaceId, businessName')
    .in('spaceId', spaceIds);
  const businessNameMap = new Map((settings ?? []).map((s: any) => [s.spaceId, s.businessName]));

  const { data: spaces } = await supabase
    .from('Space')
    .select('id, name, slug')
    .in('id', spaceIds);
  const spaceNameMap = new Map((spaces ?? []).map((s: any) => [s.id, s.name]));
  const spaceSlugMap = new Map((spaces ?? []).map((s: any) => [s.id, s.slug]));

  let sent = 0;
  let failed = 0;

  for (const tour of tours) {
    const businessName =
      businessNameMap.get(tour.spaceId) || spaceNameMap.get(tour.spaceId) || 'Your Agent';
    const emailData: TourEmailData = {
      guestName: tour.guestName,
      guestEmail: tour.guestEmail,
      guestPhone: tour.guestPhone,
      propertyAddress: tour.propertyAddress,
      startsAt: tour.startsAt,
      endsAt: tour.endsAt,
      businessName,
      tourId: tour.id,
      slug: spaceSlugMap.get(tour.spaceId) ?? '',
    };

    try {
      await sendTourReminder(emailData);
      // Stamp only after a successful send so a failed send is retried next run.
      await supabase
        .from('Tour')
        .update({ reminderSentAt: new Date().toISOString() })
        .eq('id', tour.id);
      sent++;
    } catch (err) {
      failed++;
      console.error(`[tours/reminders] reminder failed for tour ${tour.id}:`, err);
    }
  }

  return NextResponse.json({ sent, failed, timestamp: now.toISOString() });
}
