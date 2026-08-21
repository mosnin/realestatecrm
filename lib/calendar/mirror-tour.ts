/**
 * Mirror a booked Tour onto the realtor's external calendar.
 *
 * One seam for public /book and (optionally) other writers:
 *   1. Active Composio calendar → writeEventThrough
 *   2. Else legacy GoogleCalendarToken → createGoogleEvent
 *   3. Else skip (no calendar connected)
 *
 * Returns whether a write was attempted and whether it landed. Public
 * book treats attempted+failed as a hard error and rolls the Tour back.
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { findCalendarConnection, writeEventThrough } from '@/lib/calendar/mirror';
import { createGoogleEvent } from '@/lib/gcal-helpers';

export interface MirrorTourInput {
  spaceId: string;
  tourId: string;
  guestName: string;
  guestEmail: string;
  guestPhone?: string | null;
  propertyAddress?: string | null;
  notes?: string | null;
  startsAt: string;
  endsAt: string;
  createdBy?: 'agent' | 'realtor';
}

export type MirrorTourResult =
  | { attempted: false; reason: 'no_connection' }
  | { attempted: true; externalOk: true; via: 'composio' | 'legacy' }
  | { attempted: true; externalOk: false; via: 'composio' | 'legacy' };

function tourDescription(input: MirrorTourInput): string {
  return [
    input.propertyAddress ? `Property: ${input.propertyAddress}` : null,
    input.guestEmail ? `Guest: ${input.guestName} <${input.guestEmail}>` : null,
    input.guestPhone ? `Phone: ${input.guestPhone}` : null,
    input.notes ? `Notes: ${input.notes}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

export async function mirrorTourBookingToCalendar(
  input: MirrorTourInput,
): Promise<MirrorTourResult> {
  const connection = await findCalendarConnection(input.spaceId);
  if (connection) {
    const result = await writeEventThrough({
      spaceId: input.spaceId,
      connection,
      title: `Tour: ${input.guestName || 'Guest'}`,
      description: tourDescription(input) || null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      attendees: input.guestEmail
        ? [{ email: input.guestEmail, name: input.guestName || null }]
        : [],
      sourceTourId: input.tourId,
      createdBy: input.createdBy ?? 'realtor',
    });
    return {
      attempted: true,
      externalOk: result.externalOk,
      via: 'composio',
    };
  }

  const { data: tokenRow } = await supabase
    .from('GoogleCalendarToken')
    .select('accessToken, refreshToken, expiresAt, calendarId')
    .eq('spaceId', input.spaceId)
    .maybeSingle();
  if (!tokenRow) {
    return { attempted: false, reason: 'no_connection' };
  }

  try {
    const created = await createGoogleEvent({
      spaceId: input.spaceId,
      title: `Tour: ${input.guestName || 'Guest'}`,
      description: tourDescription(input),
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    });
    if (!created.ok) {
      return { attempted: true, externalOk: false, via: 'legacy' };
    }
    const { error: stampErr } = await supabase
      .from('Tour')
      .update({ googleEventId: created.googleEventId })
      .eq('id', input.tourId)
      .eq('spaceId', input.spaceId);
    if (stampErr) {
      logger.warn('[calendar.mirror-tour] failed to stamp googleEventId', {
        spaceId: input.spaceId,
        tourId: input.tourId,
        err: stampErr.message,
      });
    }
    return { attempted: true, externalOk: true, via: 'legacy' };
  } catch (err) {
    logger.warn('[calendar.mirror-tour] legacy write threw', {
      spaceId: input.spaceId,
      tourId: input.tourId,
    }, err);
    return { attempted: true, externalOk: false, via: 'legacy' };
  }
}

/** Cancel a just-created tour when the calendar write failed. Scoped. */
export async function rollbackTourBooking(spaceId: string, tourId: string): Promise<void> {
  const { error } = await supabase
    .from('Tour')
    .update({
      status: 'cancelled',
      updatedAt: new Date().toISOString(),
      notes: 'Cancelled: could not add this tour to the realtor calendar.',
    })
    .eq('id', tourId)
    .eq('spaceId', spaceId);
  if (error) {
    logger.error('[calendar.mirror-tour] rollback failed', { spaceId, tourId, err: error.message });
  }
}
