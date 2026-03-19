import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';

/** GET — list overrides for the next 90 days */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('TourAvailabilityOverride')
    .select('*')
    .eq('spaceId', space.id)
    .gte('date', today)
    .order('date', { ascending: true });
  if (error) throw error;

  return NextResponse.json(data ?? []);
}

/** POST — create or update an override for a specific date */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { slug, date, isBlocked, startHour, endHour, label } = body;

  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 });

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date format (YYYY-MM-DD)' }, { status: 400 });
  }

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  if (!isBlocked) {
    if (startHour == null || endHour == null) {
      return NextResponse.json({ error: 'startHour and endHour required when not blocked' }, { status: 400 });
    }
    if (startHour < 0 || startHour > 23 || endHour < 1 || endHour > 24 || endHour <= startHour) {
      return NextResponse.json({ error: 'Invalid hour range' }, { status: 400 });
    }
  }

  // Upsert — if an override already exists for this date, update it
  const { data, error } = await supabase
    .from('TourAvailabilityOverride')
    .upsert(
      {
        id: crypto.randomUUID(),
        spaceId: space.id,
        date,
        isBlocked: !!isBlocked,
        startHour: isBlocked ? null : startHour,
        endHour: isBlocked ? null : endHour,
        label: label?.trim() || null,
      },
      { onConflict: 'spaceId,date' }
    )
    .select()
    .single();
  if (error) throw error;

  return NextResponse.json(data, { status: 201 });
}
