import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSpaceFromSlug } from '@/lib/space';
import { sendTourConfirmation, sendAgentNotification, type TourEmailData } from '@/lib/tour-emails';

/** Public endpoint — guests book a tour without authentication. */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { slug, guestName, guestEmail, guestPhone, propertyAddress, notes, startsAt, propertyProfileId } = body;

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

  // Try to match to existing contact by email, or create one
  let contactId: string | null = null;
  const { data: contactRow } = await supabase
    .from('Contact')
    .select('id')
    .eq('spaceId', space.id)
    .ilike('email', guestEmail.trim())
    .maybeSingle();

  if (contactRow) {
    contactId = contactRow.id;
    // Set source attribution if not already set
    supabase
      .from('Contact')
      .update({ sourceLabel: 'tour-booking' })
      .eq('id', contactId)
      .is('sourceLabel', null)
      .then(({ error: srcErr }) => { if (srcErr) console.error('[book] Source update failed:', srcErr); });
  } else {
    // Auto-create a contact for this tour guest
    const newContactId = crypto.randomUUID();
    const { error: createErr } = await supabase.from('Contact').insert({
      id: newContactId,
      spaceId: space.id,
      name: guestName.trim(),
      email: guestEmail.trim().toLowerCase(),
      phone: guestPhone?.trim() || null,
      address: propertyAddress?.trim() || null,
      type: 'TOUR',
      tags: ['tour-booking'],
      sourceLabel: 'tour-booking',
      scoringStatus: 'unscored',
    });
    if (!createErr) {
      contactId = newContactId;
    } else {
      console.error('[book] Auto-create contact failed:', createErr);
    }
  }

  // Generate a unique manage token for guest self-service
  const manageToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 16);

  const { data: tour, error } = await supabase
    .from('Tour')
    .insert({
      id: crypto.randomUUID(),
      spaceId: space.id,
      contactId,
      guestName: guestName.trim(),
      guestEmail: guestEmail.trim().toLowerCase(),
      guestPhone: guestPhone?.trim() || null,
      propertyAddress: propertyAddress?.trim() || null,
      notes: notes?.trim() || null,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      propertyProfileId: propertyProfileId || null,
      manageToken,
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
