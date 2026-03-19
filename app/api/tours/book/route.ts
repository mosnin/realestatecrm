import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSpaceFromSlug } from '@/lib/space';
import { sendTourConfirmation, sendAgentNotification, type TourEmailData } from '@/lib/tour-emails';

/** Public endpoint — guests book a tour without authentication. */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { slug, guestName, guestEmail, guestPhone, propertyAddress, notes, startsAt } = body;

  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  if (!guestName?.trim() || !guestEmail?.trim() || !startsAt) {
    return NextResponse.json({ error: 'guestName, guestEmail, startsAt required' }, { status: 400 });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(guestEmail.trim())) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  }

  const space = await getSpaceFromSlug(slug);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });

  // Get duration from settings
  const { data: settings } = await supabase
    .from('SpaceSetting')
    .select('tourDuration')
    .eq('spaceId', space.id)
    .maybeSingle();
  const duration = settings?.tourDuration ?? 30;

  const start = new Date(startsAt);
  if (isNaN(start.getTime())) {
    return NextResponse.json({ error: 'Invalid startsAt' }, { status: 400 });
  }
  if (start.getTime() < Date.now()) {
    return NextResponse.json({ error: 'Cannot book in the past' }, { status: 400 });
  }

  const end = new Date(start.getTime() + duration * 60 * 1000);

  // Check for double booking
  const { data: conflicts } = await supabase
    .from('Tour')
    .select('id')
    .eq('spaceId', space.id)
    .in('status', ['scheduled', 'confirmed'])
    .lt('startsAt', end.toISOString())
    .gt('endsAt', start.toISOString());

  if (conflicts && conflicts.length > 0) {
    return NextResponse.json({ error: 'This time slot is no longer available' }, { status: 409 });
  }

  // Try to match to existing contact by email
  const { data: contactRow } = await supabase
    .from('Contact')
    .select('id')
    .eq('spaceId', space.id)
    .eq('email', guestEmail.trim().toLowerCase())
    .maybeSingle();

  const { data: tour, error } = await supabase
    .from('Tour')
    .insert({
      id: crypto.randomUUID(),
      spaceId: space.id,
      contactId: contactRow?.id ?? null,
      guestName: guestName.trim(),
      guestEmail: guestEmail.trim().toLowerCase(),
      guestPhone: guestPhone?.trim() || null,
      propertyAddress: propertyAddress?.trim() || null,
      notes: notes?.trim() || null,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
    })
    .select()
    .single();
  if (error) throw error;

  // Send confirmation email (non-blocking)
  const { data: settingsFull } = await supabase
    .from('SpaceSetting')
    .select('businessName')
    .eq('spaceId', space.id)
    .maybeSingle();
  const emailData: TourEmailData = {
    guestName: tour.guestName,
    guestEmail: tour.guestEmail,
    guestPhone: tour.guestPhone,
    propertyAddress: tour.propertyAddress,
    startsAt: tour.startsAt,
    endsAt: tour.endsAt,
    businessName: settingsFull?.businessName || space.name,
    tourId: tour.id,
    slug,
  };
  sendTourConfirmation(emailData).catch(console.error);

  // Notify the space owner
  const { data: ownerRow } = await supabase
    .from('User')
    .select('email')
    .eq('id', space.ownerId)
    .maybeSingle();
  if (ownerRow?.email) {
    sendAgentNotification(ownerRow.email, emailData).catch(console.error);
  }

  return NextResponse.json(tour, { status: 201 });
}
