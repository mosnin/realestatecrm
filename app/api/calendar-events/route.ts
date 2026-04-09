import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';

// GET /api/calendar-events?slug=xxx — list all custom events for the space
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  const { data, error } = await supabase
    .from('CalendarEvent')
    .select('id, title, date, time, description, color, createdAt')
    .eq('spaceId', space.id)
    .order('date', { ascending: true });

  if (error) return NextResponse.json({ error: 'Failed to load calendar events' }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/calendar-events — create a new event
export async function POST(req: NextRequest) {
  const { slug, title, date, time, description, color } = await req.json();
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  if (!title || !date) return NextResponse.json({ error: 'title and date required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  const { data, error } = await supabase
    .from('CalendarEvent')
    .insert({
      spaceId: space.id,
      title: String(title).slice(0, 200),
      date: String(date),
      time: time ? String(time).slice(0, 10) : null,
      description: description ? String(description).slice(0, 2000) : null,
      color: color && /^#[0-9a-fA-F]{6}$/.test(String(color)) ? String(color) : null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: 'Failed to create calendar event' }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
