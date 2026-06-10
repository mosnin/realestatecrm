import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { getSpaceFromSlug } from '@/lib/space';
import { scoreLeadApplication } from '@/lib/lead-scoring';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * Public endpoint — a visitor on the property storefront asks about a listing.
 *
 * Captures the question as a buyer lead (Contact, leadType 'buyer') linked to
 * the property, then best-effort scores it through the existing engine. Mirrors
 * the tour-booking route's conventions: per-IP + per-space rate limits, email
 * validation, dedupe by email. Scoring is non-blocking — a scoring failure
 * never fails the request; the lead is already saved.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  // Same shape as the booking endpoint: an honest visitor sends one or two
  // inquiries, not a dozen. 5/hour per IP leaves room without inviting spam.
  const { allowed } = await checkRateLimit(`property-inquiry:rl:${ip}`, 5, 3600);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const slug = typeof body.slug === 'string' ? body.slug : '';
  const propertyId = typeof body.propertyId === 'string' ? body.propertyId : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';

  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  if (!name || !email) {
    return NextResponse.json({ error: 'name and email required' }, { status: 400 });
  }

  // Length check before the regex (cheap guard against a multi-MB string).
  if (email.length > 254) return NextResponse.json({ error: 'Email too long' }, { status: 400 });
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email)) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  }
  if (name.length > 200) return NextResponse.json({ error: 'Name too long' }, { status: 400 });
  if (phone && phone.length > 50) return NextResponse.json({ error: 'Phone too long' }, { status: 400 });
  if (message && message.length > 2000) return NextResponse.json({ error: 'Message too long' }, { status: 400 });

  const space = await getSpaceFromSlug(slug);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });

  // Per-space cap — catches distributed spam against one realtor.
  const spaceCheck = await checkRateLimit(`property-inquiry:space:${space.id}`, 30, 3600);
  if (!spaceCheck.allowed) {
    return NextResponse.json({ error: 'Too many requests for this space' }, { status: 429 });
  }

  // Resolve the property (best-effort — the inquiry stands even if the listing
  // was removed). When found, capture its address for the note + link it on
  // the contact's `properties` array.
  let propertyAddress: string | null = null;
  let linkedPropertyId: string | null = null;
  if (propertyId) {
    const { data: prop } = await supabase
      .from('Property')
      .select('id, address, unitNumber, city, stateRegion')
      .eq('id', propertyId)
      .eq('spaceId', space.id)
      .maybeSingle();
    if (prop) {
      linkedPropertyId = prop.id;
      const unit = prop.unitNumber ? ` #${prop.unitNumber}` : '';
      const cityState = [prop.city, prop.stateRegion].filter(Boolean).join(', ');
      propertyAddress = cityState ? `${prop.address}${unit}, ${cityState}` : `${prop.address}${unit}`;
    }
  }

  // Build the note: which listing, plus the visitor's message.
  const noteParts: string[] = [];
  if (propertyAddress) noteParts.push(`Inquiry about: ${propertyAddress}`);
  if (message) noteParts.push(message);
  const notes = noteParts.length > 0 ? noteParts.join('\n') : null;

  // Dedupe by email (case-insensitive) within the space — same contract the
  // tour-booking route uses. A repeat inquiry updates the existing buyer rather
  // than creating a duplicate.
  let contactId: string | null = null;
  let isNewContact = false;
  const { data: existing } = await supabase
    .from('Contact')
    .select('id')
    .eq('spaceId', space.id)
    .ilike('email', email)
    .maybeSingle();

  if (existing) {
    contactId = existing.id;
    const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (notes) update.notes = notes;
    // Add the linked property without duplicating an existing entry.
    if (linkedPropertyId) {
      const { data: row } = await supabase
        .from('Contact')
        .select('properties')
        .eq('id', contactId)
        .maybeSingle();
      const current: string[] = Array.isArray(row?.properties) ? row!.properties : [];
      if (!current.includes(linkedPropertyId)) {
        update.properties = [...current, linkedPropertyId];
      }
    }
    const { error: updErr } = await supabase
      .from('Contact')
      .update(update)
      .eq('id', contactId)
      .eq('spaceId', space.id);
    if (updErr) logger.warn('[property-inquiry] contact update failed', { contactId }, updErr);
  } else {
    isNewContact = true;
    const newId = crypto.randomUUID();
    const { error: createErr } = await supabase.from('Contact').insert({
      id: newId,
      spaceId: space.id,
      name,
      email: email.toLowerCase(),
      phone: phone || null,
      address: propertyAddress,
      notes,
      leadType: 'buyer',
      type: 'QUALIFICATION',
      properties: linkedPropertyId ? [linkedPropertyId] : [],
      tags: ['property-inquiry', 'new-lead'],
      sourceLabel: 'property-inquiry',
      // 'pending' is the only pre-score value the scoring_status CHECK allows.
      scoringStatus: 'pending',
      scoreLabel: 'unscored',
    });
    if (createErr) {
      logger.error('[property-inquiry] contact create failed', { spaceId: space.id }, createErr);
      return NextResponse.json({ error: "Couldn't save your inquiry — try again." }, { status: 500 });
    }
    contactId = newId;
  }

  // Best-effort scoring — never blocks or fails the request. A bare inquiry has
  // little application data, so this mostly yields a low/early-stage score, but
  // it keeps the lead on the same scored pipeline as the intake form.
  if (isNewContact && contactId) {
    try {
      const scoring = await scoreLeadApplication({
        contactId,
        name,
        email: email.toLowerCase(),
        phone,
        budget: null,
        applicationData: null,
        leadType: 'buyer',
      });
      await supabase
        .from('Contact')
        .update({
          scoringStatus: scoring.scoringStatus,
          leadScore: scoring.leadScore,
          scoreLabel: scoring.scoreLabel,
          scoreSummary: scoring.scoreSummary,
          scoreDetails: scoring.scoreDetails,
          updatedAt: new Date().toISOString(),
        })
        .eq('id', contactId);
    } catch (err) {
      logger.warn('[property-inquiry] scoring failed (non-fatal)', { contactId }, err);
    }
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
