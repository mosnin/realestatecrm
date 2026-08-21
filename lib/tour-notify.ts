/**
 * Guest-facing tour notices for reschedule / cancel.
 *
 * The booking endpoint sends the guest a confirmation email + SMS inline.
 * Reschedule and cancel need the symmetric notice — a guest whose tour
 * silently moved (or vanished) on the realtor's side, with no email, shows
 * up at the wrong time or not at all. The agent tools (`reschedule_tour`,
 * `cancel_tour`) call these so the guest is always told.
 *
 * Best-effort by construction: every send is wrapped, failures are logged,
 * nothing throws. A flaky Resend/Telnyx must never fail the core DB update —
 * same posture as schedule-tour's calendar write.
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import {
  sendTourRescheduled,
  sendTourCancelled,
  type TourEmailData,
} from '@/lib/tour-emails';
import {
  sendSMS,
  tourRescheduledSMS,
  tourCancelledSMS,
} from '@/lib/sms';
import { formatTourShortDate, formatTourTime } from '@/lib/tours/format-wallclock';

export interface TourNoticeInput {
  spaceId: string;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  propertyAddress: string | null;
  /** ISO start of the (new, for reschedule) tour. */
  startsAt: string;
  /** ISO end of the tour. */
  endsAt: string;
  tourId: string;
}

/** Resolve the space's display name + slug + timezone for the email template. Never throws. */
async function resolveBusiness(spaceId: string): Promise<{ businessName: string; slug: string; timezone: string | null }> {
  try {
    const [{ data: settings }, { data: space }] = await Promise.all([
      supabase.from('SpaceSetting').select('businessName, timezone').eq('spaceId', spaceId).maybeSingle(),
      supabase.from('Space').select('name, slug').eq('id', spaceId).maybeSingle(),
    ]);
    return {
      businessName: settings?.businessName || space?.name || 'Your Agent',
      slug: space?.slug ?? '',
      timezone: (settings as { timezone?: string | null } | null)?.timezone ?? null,
    };
  } catch (err) {
    logger.warn('[tour-notify] business lookup failed', { spaceId }, err);
    return { businessName: 'Your Agent', slug: '', timezone: null };
  }
}

/**
 * Tell the guest their tour moved — email + SMS, both best-effort.
 * No-ops cleanly when there's no guest email/phone on file.
 */
export async function notifyTourRescheduled(input: TourNoticeInput): Promise<void> {
  if (!input.guestEmail && !input.guestPhone) return;
  const { businessName, slug, timezone } = await resolveBusiness(input.spaceId);

  if (input.guestEmail) {
    const emailData: TourEmailData = {
      guestName: input.guestName,
      guestEmail: input.guestEmail,
      guestPhone: input.guestPhone,
      propertyAddress: input.propertyAddress,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      businessName,
      tourId: input.tourId,
      slug,
      timezone,
    };
    try {
      await sendTourRescheduled(emailData);
    } catch (err) {
      logger.warn('[tour-notify] reschedule email failed', { tourId: input.tourId }, err);
    }
  }

  if (input.guestPhone) {
    try {
      await sendSMS(
        tourRescheduledSMS({
          guestName: input.guestName,
          guestPhone: input.guestPhone,
          spaceId: input.spaceId,
          businessName,
          date: formatTourShortDate(input.startsAt, timezone),
          time: formatTourTime(input.startsAt, timezone),
          property: input.propertyAddress,
        }),
      );
    } catch (err) {
      logger.warn('[tour-notify] reschedule SMS failed', { tourId: input.tourId }, err);
    }
  }
}

/**
 * Tell the guest their tour was cancelled — email + SMS, both best-effort.
 * No-ops cleanly when there's no guest email/phone on file.
 */
export async function notifyTourCancelled(input: TourNoticeInput): Promise<void> {
  if (!input.guestEmail && !input.guestPhone) return;
  const { businessName, slug, timezone } = await resolveBusiness(input.spaceId);

  if (input.guestEmail) {
    const emailData: TourEmailData = {
      guestName: input.guestName,
      guestEmail: input.guestEmail,
      guestPhone: input.guestPhone,
      propertyAddress: input.propertyAddress,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      businessName,
      tourId: input.tourId,
      slug,
      timezone,
    };
    try {
      await sendTourCancelled(emailData);
    } catch (err) {
      logger.warn('[tour-notify] cancel email failed', { tourId: input.tourId }, err);
    }
  }

  if (input.guestPhone) {
    try {
      await sendSMS(
        tourCancelledSMS({
          guestName: input.guestName,
          guestPhone: input.guestPhone,
          spaceId: input.spaceId,
          businessName,
          date: formatTourShortDate(input.startsAt, timezone),
          property: input.propertyAddress,
        }),
      );
    } catch (err) {
      logger.warn('[tour-notify] cancel SMS failed', { tourId: input.tourId }, err);
    }
  }
}
