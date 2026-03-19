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
    .select('tourDuration, tourStartHour, tourEndHour, tourDaysAvailable, timezone, tourBufferMinutes, tourBlockedDates')
    .eq('spaceId', space.id)
    .maybeSingle();

  const duration = settings?.tourDuration ?? 30;
  const startHour = settings?.tourStartHour ?? 9;
  const endHour = settings?.tourEndHour ?? 17;
  const daysAvailable: number[] = settings?.tourDaysAvailable ?? [1, 2, 3, 4, 5];
  const timezone = settings?.timezone ?? 'America/New_York';
  const bufferMinutes = settings?.tourBufferMinutes ?? 0;
  const blockedDates: string[] = settings?.tourBlockedDates ?? [];

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

  // Include buffer time around each booked tour
  const bookedSlots = (existingTours ?? []).map((t: any) => ({
    start: new Date(t.startsAt).getTime() - bufferMinutes * 60_000,
    end: new Date(t.endsAt).getTime() + bufferMinutes * 60_000,
  }));

  // Fetch Google Calendar busy times if connected
  const gcalBusySlots = await fetchGoogleCalendarBusy(space.id, startDate, endDate);
  const allBusySlots = [...bookedSlots, ...gcalBusySlots];

  // Build blocked dates set for fast lookup
  const blockedSet = new Set(blockedDates);

  // Generate available slots day by day
  const slots: { date: string; times: string[] }[] = [];
  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);

  for (let day = 0; day < 14; day++) {
    const dayOfWeek = cursor.getDay(); // 0=Sun
    const dateKey = cursor.toISOString().split('T')[0];

    if (daysAvailable.includes(dayOfWeek) && !blockedSet.has(dateKey)) {
      const daySlots: string[] = [];
      for (let hour = startHour; hour < endHour; hour++) {
        for (let min = 0; min < 60; min += duration) {
          const slotStart = new Date(cursor);
          slotStart.setHours(hour, min, 0, 0);
          const slotEnd = new Date(slotStart.getTime() + duration * 60_000);

          // Skip slots in the past
          if (slotStart.getTime() < now.getTime()) continue;

          // Check for conflicts with tours (including buffer) and GCal busy times
          const hasConflict = allBusySlots.some(
            (b) => slotStart.getTime() < b.end && slotEnd.getTime() > b.start
          );
          if (!hasConflict) {
            daySlots.push(slotStart.toISOString());
          }
        }
      }
      if (daySlots.length > 0) {
        slots.push({ date: dateKey, times: daySlots });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return NextResponse.json({ slots, duration, timezone });
}

/**
 * Fetch busy times from Google Calendar for the given space.
 * Returns empty array if not connected or if the API call fails.
 */
async function fetchGoogleCalendarBusy(
  spaceId: string,
  timeMin: Date,
  timeMax: Date
): Promise<Array<{ start: number; end: number }>> {
  const { data: tokenRow } = await supabase
    .from('GoogleCalendarToken')
    .select('*')
    .eq('spaceId', spaceId)
    .maybeSingle();

  if (!tokenRow) return [];

  try {
    const accessToken = await getValidGCalToken(tokenRow, spaceId);
    const calendarId = tokenRow.calendarId || 'primary';

    const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: [{ id: calendarId }],
      }),
    });

    if (!res.ok) {
      console.error('[availability] GCal freeBusy failed:', res.status);
      return [];
    }

    const data = await res.json();
    const busyPeriods = data.calendars?.[calendarId]?.busy ?? [];

    return busyPeriods.map((b: { start: string; end: string }) => ({
      start: new Date(b.start).getTime(),
      end: new Date(b.end).getTime(),
    }));
  } catch (err) {
    console.error('[availability] GCal busy check error:', err);
    return [];
  }
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';

async function getValidGCalToken(tokenRow: any, spaceId: string): Promise<string> {
  const expiresAt = new Date(tokenRow.expiresAt).getTime();
  if (Date.now() < expiresAt - 60_000) {
    return tokenRow.accessToken;
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: tokenRow.refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) throw new Error('Failed to refresh Google token');
  const tokens = await res.json();

  await supabase
    .from('GoogleCalendarToken')
    .update({
      accessToken: tokens.access_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .eq('spaceId', spaceId);

  return tokens.access_token;
}
