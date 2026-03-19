import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendTourReminder, type TourEmailData } from '@/lib/tour-emails';

/**
 * Cron endpoint — sends reminder emails for tours happening in the next 24 hours.
 * Call this via Vercel Cron or external scheduler (e.g., every hour).
 *
 * Protect with CRON_SECRET env var to prevent unauthorized calls.
 */
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const in23h = new Date(now.getTime() + 23 * 60 * 60 * 1000);

  // Find tours starting between 23–24 hours from now (1-hour window to avoid duplicates)
  const { data: tours, error } = await supabase
    .from('Tour')
    .select('*, Space(name, id, ownerId)')
    .in('status', ['scheduled', 'confirmed'])
    .gte('startsAt', in23h.toISOString())
    .lte('startsAt', in24h.toISOString());

  if (error) {
    console.error('[tour-reminders] Query error:', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  let sent = 0;
  for (const tour of tours ?? []) {
    const spaceName = (tour as any).Space?.name ?? '';
    const spaceId = (tour as any).Space?.id ?? tour.spaceId;

    const { data: settings } = await supabase
      .from('SpaceSetting')
      .select('businessName')
      .eq('spaceId', spaceId)
      .maybeSingle();

    const emailData: TourEmailData = {
      guestName: tour.guestName,
      guestEmail: tour.guestEmail,
      guestPhone: tour.guestPhone,
      propertyAddress: tour.propertyAddress,
      startsAt: tour.startsAt,
      endsAt: tour.endsAt,
      businessName: settings?.businessName || spaceName,
      tourId: tour.id,
      slug: '',
    };

    try {
      await sendTourReminder(emailData);
      sent++;
    } catch (err) {
      console.error(`[tour-reminders] Failed for tour ${tour.id}:`, err);
    }
  }

  return NextResponse.json({ sent, total: tours?.length ?? 0 });
}
