import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSpaceFromSlug } from '@/lib/space';
import { sendTourConfirmation, type TourEmailData } from '@/lib/tour-emails';
import { notifyNewTour } from '@/lib/notify';
import { sendSMS, tourConfirmationSMS } from '@/lib/sms';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { bookTourAtomic, generateManageToken } from '@/lib/tour-booking';
import { validateTourSlot } from '@/lib/tours/validate-slot';
import { escapeIlikePattern } from '@/lib/ilike';

/** Public endpoint — guests book a tour without authentication. */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  // Per-IP cap — tightened from 10 to 3/hour. The booking endpoint sends a
  // real-looking confirmation email to whatever `guestEmail` is provided,
  // which is a platform-as-spammer amplifier. A single IP shouldn't be
  // legitimately booking 3+ tours per hour.
  const { allowed } = await checkRateLimit(`book:rl:${ip}`, 3, 3600);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const body = await req.json();
  const { slug, guestName, guestEmail, guestPhone, propertyAddress, notes, startsAt, propertyProfileId } = body;

  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  if (!guestName?.trim() || !guestEmail?.trim() || !startsAt) {
    return NextResponse.json({ error: 'guestName, guestEmail, startsAt required' }, { status: 400 });
  }

  // Length check FIRST — defends against running the regex on a multi-MB
  // string (ReDoS-ish CPU burn).
  if (guestEmail.length > 254) {
    return NextResponse.json({ error: 'Email too long' }, { status: 400 });
  }
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(guestEmail.trim())) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  }

  // Input length validation to prevent storage DoS
  if (guestName.length > 200) return NextResponse.json({ error: 'Name too long' }, { status: 400 });
  if (guestPhone && guestPhone.length > 50) return NextResponse.json({ error: 'Phone too long' }, { status: 400 });
  if (propertyAddress && propertyAddress.length > 500) return NextResponse.json({ error: 'Address too long' }, { status: 400 });
  if (notes && notes.length > 2000) return NextResponse.json({ error: 'Notes too long' }, { status: 400 });

  const space = await getSpaceFromSlug(slug);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });

  // Per-space cap — catches distributed attacks (botnets rotating IPs) hitting
  // a single victim space. A real space gets at most a handful of bookings per
  // hour; 20 is well above legitimate traffic and well below the daily volume
  // a spammer would want.
  const spaceCheck = await checkRateLimit(`book:space:${space.id}`, 20, 3600);
  if (!spaceCheck.allowed) {
    return NextResponse.json({ error: 'Too many requests for this space' }, { status: 429 });
  }

  // Get duration from settings
  const { data: settings } = await supabase
    .from('SpaceSetting')
    .select('tourDuration')
    .eq('spaceId', space.id)
    .maybeSingle();
  let duration = settings?.tourDuration ?? 30;

  // Validate propertyProfileId belongs to this space before using it,
  // and use its tour duration if available
  let validPropertyProfileId: string | null = null;
  if (propertyProfileId) {
    const { data: profileRow } = await supabase
      .from('TourPropertyProfile')
      .select('id, tourDuration')
      .eq('id', propertyProfileId)
      .eq('spaceId', space.id)
      .eq('isActive', true)
      .maybeSingle();
    if (profileRow) {
      validPropertyProfileId = profileRow.id;
      duration = profileRow.tourDuration;
    }
    // If profile not found or not active, proceed without it (don't block booking)
  }

  const start = new Date(startsAt);
  if (isNaN(start.getTime())) {
    return NextResponse.json({ error: 'Invalid startsAt' }, { status: 400 });
  }
  if (start.getTime() < Date.now()) {
    return NextResponse.json({ error: 'Cannot book in the past' }, { status: 400 });
  }

  // Re-validate that the requested time is a REAL, allowed slot in the realtor's
  // configured availability window. The GET /available endpoint enforces this
  // when generating slots, but the write path must not trust the client: a
  // crafted POST with any future, non-conflicting timestamp could otherwise
  // book an off-hours / blocked-date / wrong-weekday tour. This check is
  // ADDITIVE — the "not in past" check above and the atomic conflict check in
  // bookTourAtomic below both still run.
  const slotCheck = await validateTourSlot(space.id, start, validPropertyProfileId);
  if (!slotCheck.ok) {
    return NextResponse.json(
      { error: slotCheck.reason ?? 'Selected time is not a valid tour slot.' },
      { status: 422 },
    );
  }

  const end = new Date(start.getTime() + duration * 60 * 1000);

  // Try to match to existing contact by email, or create one
  let contactId: string | null = null;
  const { data: contactRow } = await supabase
    .from('Contact')
    .select('id')
    .eq('spaceId', space.id)
    .ilike('email', escapeIlikePattern(guestEmail.trim()))
    .maybeSingle();

  if (contactRow) {
    contactId = contactRow.id;
    // Set source attribution if not already set. Awaited — the prior
    // fire-and-forget pattern could be GC'd on a cold Vercel function
    // before the update committed, so first-touch attribution was missed
    // intermittently. Cost is one extra serial query; the route already
    // does several.
    const { error: srcErr } = await supabase
      .from('Contact')
      .update({ sourceLabel: 'tour-booking' })
      .eq('id', contactId)
      .eq('spaceId', space.id)
      .is('sourceLabel', null);
    if (srcErr) console.error('[book] Source update failed:', srcErr);
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
      // Structured lead-source attribution: public tour-booking is a web form.
      source: 'web_form',
      // `'unscored'` violated the CHECK constraint
      // (`contact_scoring_status_check` allows pending/scored/failed only),
      // so every auto-create silently failed and the tour was booked with
      // a NULL contactId — losing attribution and breaking follow-ups.
      scoringStatus: 'pending',
    });
    if (!createErr) {
      contactId = newContactId;
    } else {
      console.error('[book] Auto-create contact failed:', createErr);
    }
  }

  // Generate a cryptographically secure manage token (256-bit entropy)
  const manageToken = generateManageToken();

  // Atomic booking via the shared DB-function helper — conflict check +
  // insert in a single transaction with row-level locking to prevent
  // double-booking. The agent tool (schedule_tour) routes through the SAME
  // helper so neither path can bypass the conflict check.
  const tourId = crypto.randomUUID();
  const booking = await bookTourAtomic({
    id: tourId,
    spaceId: space.id,
    contactId,
    guestName: guestName.trim(),
    guestEmail: guestEmail.trim().toLowerCase(),
    guestPhone: guestPhone?.trim() || null,
    propertyAddress: propertyAddress?.trim() || null,
    notes: notes?.trim() || null,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    propertyProfileId: validPropertyProfileId,
    manageToken,
  });
  if (!booking.ok && booking.reason === 'error') throw booking.error;

  // Conflict → the slot was taken between the availability check and now.
  if (!booking.ok) {
    return NextResponse.json({ error: 'This time slot is no longer available' }, { status: 409 });
  }

  // Fetch the created tour for the response
  const { data: tour, error: fetchError } = await supabase
    .from('Tour')
    .select('*')
    .eq('id', tourId)
    .single();
  if (fetchError) throw fetchError;

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
    // Lets the confirmation email link the guest to /tour/[token] so they
    // can self-serve cancel/reschedule/feedback (the page existed but was
    // never linked from any guest email).
    manageToken: tour.manageToken,
  };
  try { await sendTourConfirmation(emailData); } catch (e) { console.error('[tours] confirmation email failed:', e); }

  // Send SMS confirmation to guest
  if (tour.guestPhone) {
    const d = new Date(tour.startsAt);
    try {
      await sendSMS(
        tourConfirmationSMS({
          guestName: tour.guestName,
          guestPhone: tour.guestPhone,
          spaceId: space.id,
          businessName: settingsFull?.businessName || space.name,
          date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
          property: tour.propertyAddress,
        })
      );
    } catch (e) { console.error('[tours] SMS confirmation failed:', e); }
  }

  // Notify the space owner (email + SMS via unified dispatcher)
  try { await notifyNewTour({ spaceId: space.id, tourData: emailData }); } catch (e) { console.error('[tours] owner notification failed:', e); }

  // Return a DTO, not the raw row. This is an UNAUTHENTICATED public endpoint;
  // the full Tour row carries internal identifiers (spaceId, contactId,
  // propertyProfileId, googleEventId, reminder timestamps) a booker never needs.
  // manageToken IS returned — the guest needs it to self-serve manage the tour.
  return NextResponse.json(
    {
      id: tour.id,
      guestName: tour.guestName,
      propertyAddress: tour.propertyAddress,
      startsAt: tour.startsAt,
      endsAt: tour.endsAt,
      status: tour.status,
      manageToken: tour.manageToken,
    },
    { status: 201 },
  );
}
