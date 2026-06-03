import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSpaceFromSlug } from '@/lib/space';
import { requireSpaceOwner } from '@/lib/api-auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

/** GET — list waitlist entries (authenticated, space owner) */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  // Lazy expiry: reap stale holds for THIS space before listing.
  // A 'notified' entry whose 30-min hold (expiresAt) has passed is reset
  // back to 'waiting' so the slot is freed. Best-effort — a failure here
  // must not 500 the list.
  try {
    const { error: reapError } = await supabase
      .from('TourWaitlist')
      .update({ status: 'waiting', expiresAt: null, notifiedAt: null })
      .eq('spaceId', space.id)
      .eq('status', 'notified')
      .lt('expiresAt', new Date().toISOString());
    if (reapError) console.error('[waitlist] Reap of expired holds failed:', reapError);
  } catch (err) {
    console.error('[waitlist] Reap of expired holds failed:', err);
  }

  const { data, error } = await supabase
    .from('TourWaitlist')
    .select('*')
    .eq('spaceId', space.id)
    .in('status', ['waiting', 'notified'])
    .order('preferredDate', { ascending: true });
  if (error) throw error;

  return NextResponse.json(data ?? []);
}

/** POST — public endpoint: guest joins the waitlist */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const { allowed } = await checkRateLimit(`waitlist:${ip}`, 5, 3600);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const body = await req.json();
  const { slug, guestName, guestEmail, guestPhone, preferredDate, notes, propertyProfileId } = body;

  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  if (!guestName?.trim() || !guestEmail?.trim() || !preferredDate) {
    return NextResponse.json({ error: 'guestName, guestEmail, preferredDate required' }, { status: 400 });
  }

  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(guestEmail.trim()) || guestEmail.length > 254) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  }

  // Input length validation
  if (guestName.length > 200) return NextResponse.json({ error: 'Name too long' }, { status: 400 });
  if (guestPhone && guestPhone.length > 50) return NextResponse.json({ error: 'Phone too long' }, { status: 400 });
  if (notes && notes.length > 2000) return NextResponse.json({ error: 'Notes too long' }, { status: 400 });

  const space = await getSpaceFromSlug(slug);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });

  // Check for duplicate
  const { data: existing } = await supabase
    .from('TourWaitlist')
    .select('id')
    .eq('spaceId', space.id)
    .eq('guestEmail', guestEmail.trim().toLowerCase())
    .eq('preferredDate', preferredDate)
    .eq('status', 'waiting')
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: 'You are already on the waitlist for this date' }, { status: 409 });
  }

  const { data, error } = await supabase
    .from('TourWaitlist')
    .insert({
      id: crypto.randomUUID(),
      spaceId: space.id,
      propertyProfileId: propertyProfileId || null,
      guestName: guestName.trim(),
      guestEmail: guestEmail.trim().toLowerCase(),
      guestPhone: guestPhone?.trim() || null,
      preferredDate,
      notes: notes?.trim() || null,
    })
    .select()
    .single();
  if (error) throw error;

  return NextResponse.json(data, { status: 201 });
}
