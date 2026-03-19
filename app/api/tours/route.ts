import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  const status = req.nextUrl.searchParams.get('status');
  const upcoming = req.nextUrl.searchParams.get('upcoming');

  let query = supabase
    .from('Tour')
    .select('*, Contact(id, name, email, phone)')
    .eq('spaceId', space.id);

  if (status) {
    query = query.eq('status', status);
  }

  if (upcoming === 'true') {
    query = query.gte('startsAt', new Date().toISOString()).in('status', ['scheduled', 'confirmed']);
  }

  const { data, error } = await query.order('startsAt', { ascending: true }).limit(100);
  if (error) throw error;

  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { slug, guestName, guestEmail, guestPhone, propertyAddress, notes, startsAt, endsAt, contactId } = body;

  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  if (!guestName || !guestEmail || !startsAt || !endsAt) {
    return NextResponse.json({ error: 'guestName, guestEmail, startsAt, endsAt required' }, { status: 400 });
  }

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('Tour')
    .insert({
      id: crypto.randomUUID(),
      spaceId: space.id,
      contactId: contactId || null,
      guestName: guestName.trim(),
      guestEmail: guestEmail.trim(),
      guestPhone: guestPhone?.trim() || null,
      propertyAddress: propertyAddress?.trim() || null,
      notes: notes?.trim() || null,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
    })
    .select()
    .single();
  if (error) throw error;

  return NextResponse.json(data, { status: 201 });
}
