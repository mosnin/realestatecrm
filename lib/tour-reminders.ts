/**
 * Tour reminder sender.
 *
 * Finds tours starting within the next 24h (status scheduled/confirmed) and
 * sends each guest a reminder email + SMS. Two reminders per tour — a 24h
 * "tomorrow" nudge and a 1h "today" nudge — tracked independently so each
 * fires exactly once.
 *
 * Idempotency: before sending, we CLAIM the send by conditionally stamping
 * the matching column (`reminder24SentAt` / `reminder1hSentAt`) only if it's
 * still null, and proceed only when the claim wins the row. Two concurrent
 * cron ticks therefore can't double-blast the same guest — the loser's
 * conditional update touches zero rows and it bails.
 *
 * Lives in lib/ (not the route) so the POST endpoint and the
 * `/api/cron/tour-reminders` cron share one sender, and so a Next.js route
 * file isn't forced to export a non-handler symbol.
 */

import { supabase } from '@/lib/supabase';
import { sendTourReminder, type TourEmailData } from '@/lib/tour-emails';
import { sendSMS, tourReminderSMS } from '@/lib/sms';
import { logger } from '@/lib/logger';
import { unscoped } from '@/lib/supabase-guard';
import { formatTourTime } from '@/lib/tours/format-wallclock';

export interface ReminderRow {
  tourId: string;
  type: '1h' | '24h';
  guestEmail: string;
  guestPhone: string | null;
  delivered: { email: boolean; sms: boolean };
}

/**
 * Do the work: query due tours, claim+send each reminder. Returns a summary.
 * Best-effort per tour — one guest's failed send never blocks the rest.
 */
export async function runTourReminders(): Promise<{ processed: number; reminders: ReminderRow[] }> {
  const now = new Date();
  const in1h = new Date(now.getTime() + 60 * 60 * 1000);
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const { data: tours, error } = await unscoped(supabase
    .from('Tour'), 'post-fetch: caller verified parent scope before this id query')
    .select(
      'id, guestName, guestEmail, guestPhone, propertyAddress, startsAt, endsAt, status, spaceId, manageToken, contactId, reminder24SentAt, reminder1hSentAt',
    )
    .in('status', ['scheduled', 'confirmed'])
    .gte('startsAt', now.toISOString())
    .lte('startsAt', in24h.toISOString())
    .order('startsAt', { ascending: true })
    .limit(100);

  if (error) {
    logger.error('[tours/reminders] query failed', undefined, error);
    throw error;
  }
  if (!tours?.length) return { processed: 0, reminders: [] };

  // Resolve business names once per space for the templates.
  const spaceIds = [...new Set(tours.map((t: any) => t.spaceId))];
  const [{ data: settings }, { data: spaces }] = await Promise.all([
    supabase.from('SpaceSetting').select('spaceId, businessName, timezone').in('spaceId', spaceIds),
    supabase.from('Space').select('id, name, slug').in('id', spaceIds),
  ]);
  const nameMap = new Map((settings ?? []).map((s: any) => [s.spaceId, s.businessName]));
  const tzMap = new Map((settings ?? []).map((s: any) => [s.spaceId, s.timezone as string | null | undefined]));
  const spaceMap = new Map((spaces ?? []).map((s: any) => [s.id, s]));

  const reminders: ReminderRow[] = [];

  for (const tour of tours) {
    const tourStart = new Date(tour.startsAt);
    const type: '1h' | '24h' = tourStart <= in1h ? '1h' : '24h';
    const column = type === '1h' ? 'reminder1hSentAt' : 'reminder24SentAt';

    // Skip if this reminder type already went out (cheap pre-check; the
    // conditional claim below is the real race guard).
    if (type === '1h' && tour.reminder1hSentAt) continue;
    if (type === '24h' && tour.reminder24SentAt) continue;

    // CLAIM the send: stamp the column only if still null. If another cron
    // tick already claimed it, this updates zero rows and we skip — no
    // double-send.
    const { data: claimed, error: claimErr } = await unscoped(supabase
      .from('Tour'), 'post-fetch: caller verified parent scope before this id query')
      .update({ [column]: new Date().toISOString() })
      .eq('id', tour.id)
      .is(column, null)
      .select('id')
      .maybeSingle();
    if (claimErr) {
      logger.warn('[tours/reminders] claim failed', { tourId: tour.id, type }, claimErr);
      continue;
    }
    if (!claimed) continue; // lost the race / already sent

    const businessName =
      nameMap.get(tour.spaceId) || spaceMap.get(tour.spaceId)?.name || 'Your Agent';
    const slug = spaceMap.get(tour.spaceId)?.slug ?? '';
    const timezone = tzMap.get(tour.spaceId) ?? null;

    const emailData: TourEmailData = {
      guestName: tour.guestName,
      guestEmail: tour.guestEmail,
      guestPhone: tour.guestPhone,
      propertyAddress: tour.propertyAddress,
      startsAt: tour.startsAt,
      endsAt: tour.endsAt,
      businessName,
      tourId: tour.id,
      slug,
      manageToken: tour.manageToken,
      timezone,
    };

    const delivered = { email: false, sms: false };

    // Email (guestEmail is a required Tour column). Best-effort.
    try {
      await sendTourReminder(emailData);
      delivered.email = true;
    } catch (err) {
      logger.warn('[tours/reminders] email failed', { tourId: tour.id, type }, err);
    }

    // SMS when a phone is on file. Best-effort.
    if (tour.guestPhone) {
      try {
        const sent = await sendSMS(
          tourReminderSMS({
            guestName: tour.guestName,
            guestPhone: tour.guestPhone,
            spaceId: tour.spaceId,
            businessName,
            time: formatTourTime(tour.startsAt, timezone),
            property: tour.propertyAddress,
          }),
        );
        delivered.sms = sent;
      } catch (err) {
        logger.warn('[tours/reminders] SMS failed', { tourId: tour.id, type }, err);
      }
    }

    reminders.push({
      tourId: tour.id,
      type,
      guestEmail: tour.guestEmail,
      guestPhone: tour.guestPhone,
      delivered,
    });
  }

  return { processed: reminders.length, reminders };
}
