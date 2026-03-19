import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSpaceFromSlug } from '@/lib/space';

/** Public endpoint — returns available time slots for the next 14 days. */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  const dateStr = req.nextUrl.searchParams.get('date'); // YYYY-MM-DD
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const space = await getSpaceFromSlug(slug);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });

  // Load space settings for availability config
  const { data: settings } = await supabase
    .from('SpaceSetting')
    .select('tourDuration, tourStartHour, tourEndHour, tourDaysAvailable, timezone')
    .eq('spaceId', space.id)
    .maybeSingle();

  const duration = settings?.tourDuration ?? 30;
  const startHour = settings?.tourStartHour ?? 9;
  const endHour = settings?.tourEndHour ?? 17;
  const daysAvailable: number[] = settings?.tourDaysAvailable ?? [1, 2, 3, 4, 5];
  const timezone = settings?.timezone ?? 'America/New_York';

  // Determine date range
  const now = new Date();
  const startDate = dateStr ? new Date(dateStr + 'T00:00:00') : now;
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 14);

  // Fetch existing tours in range
  const { data: existingTours } = await supabase
    .from('Tour')
    .select('startsAt, endsAt')
    .eq('spaceId', space.id)
    .in('status', ['scheduled', 'confirmed'])
    .gte('startsAt', startDate.toISOString())
    .lte('startsAt', endDate.toISOString());

  const bookedSlots = (existingTours ?? []).map((t: any) => ({
    start: new Date(t.startsAt).getTime(),
    end: new Date(t.endsAt).getTime(),
  }));

  // Generate available slots day by day
  const slots: { date: string; times: string[] }[] = [];
  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);

  for (let day = 0; day < 14; day++) {
    const dayOfWeek = cursor.getDay(); // 0=Sun
    if (daysAvailable.includes(dayOfWeek)) {
      const daySlots: string[] = [];
      for (let hour = startHour; hour < endHour; hour++) {
        for (let min = 0; min < 60; min += duration) {
          const slotStart = new Date(cursor);
          slotStart.setHours(hour, min, 0, 0);
          const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);

          // Skip slots in the past
          if (slotStart.getTime() < now.getTime()) continue;

          // Check for conflicts
          const hasConflict = bookedSlots.some(
            (b) => slotStart.getTime() < b.end && slotEnd.getTime() > b.start
          );
          if (!hasConflict) {
            daySlots.push(slotStart.toISOString());
          }
        }
      }
      if (daySlots.length > 0) {
        slots.push({
          date: cursor.toISOString().split('T')[0],
          times: daySlots,
        });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return NextResponse.json({ slots, duration, timezone });
}
