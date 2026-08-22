/**
 * One seam for dropping / moving a tour on BOTH calendar systems.
 *
 * Agent `schedule_tour` writes through Composio (`CalendarEventMirror`).
 * The tours page "Add to calendar" button writes a legacy `Tour.googleEventId`
 * via GoogleCalendarToken. Cancel / delete / reschedule on the HTTP paths
 * (realtor PATCH/DELETE, guest manage-token cancel) only cleaned the legacy
 * id — so a Composio-mirrored tour left a ghost slot on the realtor's
 * calendar. Agent `cancel_tour` already did both; this helper is that same
 * pair, callable from every writer.
 *
 * Never throws. A calendar hiccup is logged; the Tour row is already the
 * source of truth for the caller's primary action.
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { deleteGoogleEvent, updateGoogleEvent } from '@/lib/gcal-helpers';
import {
  findCalendarConnection,
  deleteEventThrough,
  updateEventThrough,
} from '@/lib/calendar/mirror';

export async function dropTourCalendarArtifacts(input: {
  spaceId: string;
  tourId: string;
  googleEventId?: string | null;
}): Promise<void> {
  const googleEventId = input.googleEventId ?? null;
  if (googleEventId) {
    try {
      const ok = await deleteGoogleEvent({
        spaceId: input.spaceId,
        googleEventId,
      });
      if (ok) {
        const { error } = await supabase
          .from('Tour')
          .update({ googleEventId: null })
          .eq('id', input.tourId)
          .eq('spaceId', input.spaceId);
        if (error) {
          logger.warn('[tours.calendar-propagate] failed to clear googleEventId', {
            spaceId: input.spaceId,
            tourId: input.tourId,
            err: error.message,
          });
        }
      }
    } catch (err) {
      logger.warn(
        '[tours.calendar-propagate] legacy delete threw',
        { spaceId: input.spaceId, tourId: input.tourId },
        err,
      );
    }
  }

  try {
    const connection = await findCalendarConnection(input.spaceId);
    if (connection) {
      await deleteEventThrough({
        spaceId: input.spaceId,
        connection,
        sourceTourId: input.tourId,
      });
    }
  } catch (err) {
    logger.warn(
      '[tours.calendar-propagate] composio delete threw',
      { spaceId: input.spaceId, tourId: input.tourId },
      err,
    );
  }
}

export async function moveTourCalendarArtifacts(input: {
  spaceId: string;
  tourId: string;
  googleEventId?: string | null;
  startsAt: string;
  endsAt: string;
}): Promise<void> {
  if (input.googleEventId) {
    try {
      await updateGoogleEvent({
        spaceId: input.spaceId,
        googleEventId: input.googleEventId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
      });
    } catch (err) {
      logger.warn(
        '[tours.calendar-propagate] legacy update threw',
        { spaceId: input.spaceId, tourId: input.tourId },
        err,
      );
    }
  }

  try {
    const connection = await findCalendarConnection(input.spaceId);
    if (connection) {
      await updateEventThrough({
        spaceId: input.spaceId,
        connection,
        sourceTourId: input.tourId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
      });
    }
  } catch (err) {
    logger.warn(
      '[tours.calendar-propagate] composio update threw',
      { spaceId: input.spaceId, tourId: input.tourId },
      err,
    );
  }
}
