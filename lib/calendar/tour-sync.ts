/**
 * Inbound calendar sync — the READ-BACK half of the calendar mirror.
 *
 * `lib/calendar/mirror.ts` is write-only: Chippi pushes a tour onto the
 * realtor's Google Calendar and logs a CalendarEventMirror row. But the
 * realtor's calendar is the source of truth, and the realtor (or the guest)
 * can change the event THERE — delete it, drag it to a new time, RSVP. Until
 * now those changes never flowed back, so the CRM Tour went stale: a deleted
 * event left a "scheduled" tour, a moved event left the wrong time.
 *
 * This module closes that loop. It's invoked from the Composio calendar
 * triggers (GOOGLECALENDAR_EVENT_CANCELED_DELETED_TRIGGER /
 * GOOGLECALENDAR_ATTENDEE_RESPONSE_CHANGED_TRIGGER) via the trigger
 * dispatcher. Given a webhook payload describing an external event change, it:
 *
 *   1. Pulls the external event id out of the payload.
 *   2. Maps it back to a Tour via CalendarEventMirror
 *      (spaceId + externalProvider + externalEventId → sourceTourId). Only
 *      tours Chippi actually mirrored are in scope; an event with no mirror
 *      row is a no-op (it isn't a Chippi tour).
 *   3. Applies the change to the Tour:
 *        DELETED  → cancel the tour + notify the guest + drop the mirror row.
 *        MOVED    → update the tour's start/end + notify the guest + sync the
 *                   mirror row.
 *        RSVP     → record the guest's response on the tour.
 *
 * Posture (matches the rest of the calendar seam):
 *   - BEST-EFFORT: never throws. A bad payload / DB hiccup / missing mapping
 *     degrades to "did nothing", logged. The trigger handler's other work
 *     (capture, draft) must not be sunk by a sync failure.
 *   - IDEMPOTENT: state-based, not delivery-based. Cancelling an already-
 *     cancelled tour is a no-op; moving a tour already at the target time is a
 *     no-op; re-recording the same RSVP is a no-op. So Composio/Inngest at-
 *     least-once redelivery can't double-apply (or double-notify).
 *   - SPACE-SCOPED: every query is filtered by spaceId — the connection's
 *     space, resolved upstream. A cross-space event id matches no mirror row.
 *   - ONLY MAPPED TOURS: no CalendarEventMirror row → no Tour → clean no-op.
 *
 * What we deliberately DON'T do: auto-cancel on a 'declined' RSVP. A decline
 * is a strong signal but not a deletion — the realtor may still want to chase
 * a reschedule (the DRAFT dispatch handles that). We record the status so it's
 * visible; the human decides whether to cancel.
 */

import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
import { logger } from '@/lib/logger';
import { notifyTourCancelled, notifyTourRescheduled } from '@/lib/tour-notify';
import type { CalendarProvider } from './mirror';

/** The kinds of external change we map back onto a Tour. */
export type CalendarChangeKind = 'deleted' | 'moved' | 'rsvp';

export interface CalendarSyncInput {
  /** The connection's space — the ONLY space we touch. */
  spaceId: string;
  /** Provider slug, from the connection's toolkit. */
  provider: CalendarProvider;
  /** Composio trigger slug that fired (for the change-kind heuristic + logs). */
  triggerSlug: string;
  /** Flattened webhook payload (envelope wrappers already collapsed upstream). */
  payload: Record<string, unknown>;
}

export interface CalendarSyncResult {
  /** What we did. 'noop' covers every clean skip (no id, no mapping, already
   *  applied, terminal tour). */
  action: 'cancelled' | 'rescheduled' | 'rsvp_recorded' | 'noop';
  /** The Tour we touched, when we touched one. */
  tourId?: string;
  /** Why we no-op'd, for logs/tests. */
  reason?: string;
}

/** Pull a string by trying each key in order; supports dotted nested paths.
 *  Mirrors the picker in lib/integrations/triggers.ts so payload shape handling
 *  stays consistent, but kept local so this module doesn't depend on trigger
 *  internals. Returns the first non-empty string, else null. */
function pickString(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = key.includes('.') ? pickPath(obj, key.split('.')) : obj[key];
    if (typeof v === 'string' && v.trim().length > 0) return v;
  }
  return null;
}

function pickPath(obj: Record<string, unknown>, path: string[]): unknown {
  let cur: unknown = obj;
  for (const seg of path) {
    if (cur && typeof cur === 'object' && seg in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return cur;
}

/**
 * The external event id Google/Composio puts on a calendar webhook. Google
 * Calendar events carry `id`; Composio's various trigger generations also
 * surface it as `event_id` / `eventId`, sometimes nested under `event`. We try
 * the known shapes in priority order. Returns null when none is present — the
 * caller then no-ops (we can't map an event with no id back to a tour).
 */
export function extractExternalEventId(payload: Record<string, unknown>): string | null {
  return pickString(
    payload,
    'event_id',
    'eventId',
    'id',
    'event.id',
    'event.event_id',
    'event.eventId',
    'eventId.id',
  );
}

/**
 * The guest's RSVP/response status from an attendee-response webhook. Google's
 * vocab is accepted | declined | tentative | needsAction; Composio may relabel.
 * Returned verbatim (lower-cased) so an unknown value is still recorded.
 */
function extractResponseStatus(payload: Record<string, unknown>): string | null {
  const raw = pickString(
    payload,
    'responseStatus',
    'response_status',
    'response',
    'status',
    'attendeeResponse',
    'attendee.responseStatus',
  );
  return raw ? raw.trim().toLowerCase() : null;
}

/** An ISO start/end pair pulled from the payload, when the event moved.
 *  Google nests under start.dateTime / end.dateTime; Composio flattens to
 *  start_datetime / startTime etc. Either bound may be absent. */
function extractNewWindow(payload: Record<string, unknown>): { startsAt: string | null; endsAt: string | null } {
  const startRaw = pickString(
    payload,
    'start_datetime',
    'startTime',
    'start_time',
    'startDateTime',
    'start.dateTime',
    'start.date',
    'newStart',
  );
  const endRaw = pickString(
    payload,
    'end_datetime',
    'endTime',
    'end_time',
    'endDateTime',
    'end.dateTime',
    'end.date',
    'newEnd',
  );
  return {
    startsAt: toIso(startRaw),
    endsAt: toIso(endRaw),
  };
}

/** Parse a date-ish string to a canonical ISO string, or null if unparseable.
 *  Keeps the comparison/store representation stable regardless of the inbound
 *  format (Z vs +00:00, with/without millis). */
function toIso(raw: string | null): string | null {
  if (!raw) return null;
  const t = new Date(raw);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

/** Two instants are the "same" tour time iff they're equal to the minute.
 *  Calendars and our store can disagree on seconds/millis on a round-trip; a
 *  minute is the meaningful granularity for a tour slot and keeps the move
 *  detection idempotent (don't "move" a tour to where it already is). */
function sameMinute(a: string, b: string): boolean {
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
  return Math.floor(ta / 60000) === Math.floor(tb / 60000);
}

/** True when the cancel/delete trigger reports the event as actually gone.
 *  Google's cancel webhook sets status='cancelled'; Composio's
 *  EVENT_CANCELED_DELETED trigger fires only on a real removal, so the slug
 *  itself is the signal. We treat "status says cancelled" OR "this is the
 *  cancel/delete slug" as a deletion. */
function isDeletion(triggerSlug: string, payload: Record<string, unknown>): boolean {
  if (triggerSlug.includes('CANCELED') || triggerSlug.includes('CANCELLED') || triggerSlug.includes('DELETED')) {
    return true;
  }
  const status = pickString(payload, 'status', 'eventStatus');
  return status === 'cancelled' || status === 'canceled';
}

/**
 * Tour columns the sync reads + the guest fields the notify helpers need.
 * `start`/`end`/`status` drive the apply decisions; the guest fields feed the
 * best-effort notice; `externalResponseStatus` lets RSVP be idempotent.
 */
interface MappedTour {
  id: string;
  status: string;
  startsAt: string;
  endsAt: string;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  propertyAddress: string | null;
  externalResponseStatus: string | null;
}

/**
 * Map an external event id back to the Tour Chippi mirrored it from.
 *
 * The join: CalendarEventMirror(spaceId, externalProvider, externalEventId) →
 * sourceTourId → Tour(id, spaceId). BOTH lookups are space-scoped, so a
 * cross-space event id can never reach another tenant's tour. Returns null
 * when the event isn't a Chippi tour mirror (the common case for a realtor's
 * unrelated calendar events) or the tour is gone / the mirror has no source.
 */
async function mapEventToTour(
  spaceId: string,
  provider: CalendarProvider,
  externalEventId: string,
): Promise<{ tour: MappedTour; mirrorId: string } | null> {
  const { data: mirror, error: mirrorErr } = await tenantTable(supabase, 'CalendarEventMirror', { spaceId })
    .select('id, sourceTourId')
    .eq('externalProvider', provider)
    .eq('externalEventId', externalEventId)
    .not('sourceTourId', 'is', null)
    .order('createdAt', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (mirrorErr) {
    logger.warn('[calendar.tour-sync] mirror lookup failed', { spaceId, externalEventId, err: mirrorErr.message });
    return null;
  }
  const sourceTourId = (mirror as { sourceTourId?: string | null } | null)?.sourceTourId ?? null;
  const mirrorId = (mirror as { id?: string } | null)?.id ?? null;
  if (!sourceTourId || !mirrorId) return null;

  const { data: tour, error: tourErr } = await tenantTable(supabase, 'Tour', { spaceId })
    .select('id, status, startsAt, endsAt, guestName, guestEmail, guestPhone, propertyAddress, externalResponseStatus')
    .eq('id', sourceTourId)
    .maybeSingle();

  if (tourErr) {
    logger.warn('[calendar.tour-sync] tour lookup failed', { spaceId, sourceTourId, err: tourErr.message });
    return null;
  }
  if (!tour) return null;

  return { tour: tour as MappedTour, mirrorId };
}

/** Stamp lastExternalSyncAt (forensics). Best-effort, never blocks. */
async function stampSynced(spaceId: string, tourId: string, extra: Record<string, unknown> = {}): Promise<void> {
  const { error } = await tenantTable(supabase, 'Tour', { spaceId })
    .update({ lastExternalSyncAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...extra })
    .eq('id', tourId);
  if (error) {
    logger.warn('[calendar.tour-sync] stamp failed', { spaceId, tourId, err: error.message });
  }
}

/**
 * Apply an external calendar change to the mapped Tour.
 *
 * The single entry point the trigger dispatcher calls. Resolves the change
 * kind from the slug + payload, maps the event to a tour, and applies the
 * right mutation. Returns a structured result for logging/tests; NEVER throws.
 */
export async function syncCalendarEventToTour(
  input: CalendarSyncInput,
): Promise<CalendarSyncResult> {
  try {
    const externalEventId = extractExternalEventId(input.payload);
    if (!externalEventId) {
      return { action: 'noop', reason: 'no_event_id' };
    }

    const mapped = await mapEventToTour(input.spaceId, input.provider, externalEventId);
    if (!mapped) {
      // Not a Chippi tour (or the tour/mirror is gone) — the common case for a
      // realtor's everyday calendar churn. Nothing to do.
      return { action: 'noop', reason: 'no_mapped_tour' };
    }
    const { tour, mirrorId } = mapped;

    // ── DELETED externally → cancel the tour ────────────────────────────────
    if (isDeletion(input.triggerSlug, input.payload)) {
      return cancelFromExternal(input, tour, mirrorId);
    }

    // ── MOVED externally → update the tour time ─────────────────────────────
    // Only when the payload actually carries a new window AND it differs from
    // what we have. A bare RSVP webhook with no times falls through to RSVP.
    const { startsAt, endsAt } = extractNewWindow(input.payload);
    if (startsAt && !sameMinute(startsAt, tour.startsAt)) {
      return rescheduleFromExternal(input, tour, startsAt, endsAt);
    }

    // ── RSVP / response change → record on the tour ─────────────────────────
    const responseStatus = extractResponseStatus(input.payload);
    if (responseStatus) {
      return rsvpFromExternal(input, tour, responseStatus);
    }

    // Nothing actionable in the payload (e.g. a move webhook whose time we
    // already have, or an RSVP webhook with no status). Idempotent no-op.
    return { action: 'noop', tourId: tour.id, reason: 'nothing_to_apply' };
  } catch (err) {
    // Best-effort: a sync failure must never sink the trigger handler.
    logger.warn(
      '[calendar.tour-sync] sync threw',
      { spaceId: input.spaceId, triggerSlug: input.triggerSlug },
      err,
    );
    return { action: 'noop', reason: 'threw' };
  }
}

/** Cancel the tour because its external event was deleted/cancelled. */
async function cancelFromExternal(
  input: CalendarSyncInput,
  tour: MappedTour,
  mirrorId: string,
): Promise<CalendarSyncResult> {
  // Idempotency: a tour already cancelled (or in another terminal state) must
  // not be re-cancelled or re-notified. completed/no_show are realtor outcomes
  // an external delete shouldn't override — the appointment already happened.
  if (tour.status === 'cancelled' || tour.status === 'completed' || tour.status === 'no_show') {
    return { action: 'noop', tourId: tour.id, reason: `terminal_${tour.status}` };
  }

  // Conditional update: flip ONLY a row still not cancelled, and return the
  // affected row. Two concurrent deliveries race here — the loser's update
  // matches no row (status already 'cancelled'), so it gets `claimed === null`
  // and skips the mirror-drop + notify. Net: cancel + notify happen exactly
  // once even under at-least-once redelivery.
  const { data: claimed, error: updErr } = await tenantTable(supabase, 'Tour', { spaceId: input.spaceId })
    .update({
      status: 'cancelled',
      lastExternalSyncAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .eq('id', tour.id)
    .neq('status', 'cancelled')
    .select('id')
    .maybeSingle();

  if (updErr) {
    logger.warn('[calendar.tour-sync] cancel update failed', { spaceId: input.spaceId, tourId: tour.id, err: updErr.message });
    return { action: 'noop', tourId: tour.id, reason: 'cancel_update_failed' };
  }
  if (!claimed) {
    // Another delivery already cancelled it between our read and write.
    return { action: 'noop', tourId: tour.id, reason: 'already_cancelled' };
  }

  // Drop the now-stale mirror row so a later read/sync can't resurface it.
  const { error: delErr } = await tenantTable(supabase, 'CalendarEventMirror', { spaceId: input.spaceId })
    .delete()
    .eq('id', mirrorId);
  if (delErr) {
    logger.warn('[calendar.tour-sync] mirror delete failed', { spaceId: input.spaceId, mirrorId, err: delErr.message });
  }

  // Tell the guest — same best-effort notice the agent's cancel_tour sends.
  await notifyTourCancelled({
    spaceId: input.spaceId,
    guestName: tour.guestName || 'there',
    guestEmail: tour.guestEmail,
    guestPhone: tour.guestPhone,
    propertyAddress: tour.propertyAddress,
    startsAt: tour.startsAt,
    endsAt: tour.endsAt,
    tourId: tour.id,
  }).catch((err) => {
    logger.warn('[calendar.tour-sync] cancel notify failed', { spaceId: input.spaceId, tourId: tour.id }, err);
  });

  logger.info('[calendar.tour-sync] tour cancelled from external delete', {
    spaceId: input.spaceId,
    tourId: tour.id,
    triggerSlug: input.triggerSlug,
  });
  return { action: 'cancelled', tourId: tour.id };
}

/** Move the tour because its external event was dragged to a new time. */
async function rescheduleFromExternal(
  input: CalendarSyncInput,
  tour: MappedTour,
  startsAt: string,
  endsAtRaw: string | null,
): Promise<CalendarSyncResult> {
  // A cancelled/completed/no_show tour shouldn't be silently revived by an
  // external move — leave terminal tours alone.
  if (tour.status === 'cancelled' || tour.status === 'completed' || tour.status === 'no_show') {
    return { action: 'noop', tourId: tour.id, reason: `terminal_${tour.status}` };
  }

  // Preserve the original duration when the webhook gives a start but no end.
  let endsAt = endsAtRaw;
  if (!endsAt || new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    const dur = Math.max(15 * 60 * 1000, new Date(tour.endsAt).getTime() - new Date(tour.startsAt).getTime());
    endsAt = new Date(new Date(startsAt).getTime() + dur).toISOString();
  }

  const { error: updErr } = await tenantTable(supabase, 'Tour', { spaceId: input.spaceId })
    .update({
      startsAt,
      endsAt,
      lastExternalSyncAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .eq('id', tour.id);
  if (updErr) {
    logger.warn('[calendar.tour-sync] reschedule update failed', { spaceId: input.spaceId, tourId: tour.id, err: updErr.message });
    return { action: 'noop', tourId: tour.id, reason: 'reschedule_update_failed' };
  }

  // Keep the mirror row's window in step (it's our forensic record). Best-
  // effort; scoped to this space's mirror rows for this tour.
  const { error: mErr } = await tenantTable(supabase, 'CalendarEventMirror', { spaceId: input.spaceId })
    .update({ start: startsAt, end: endsAt })
    .eq('sourceTourId', tour.id);
  if (mErr) {
    logger.warn('[calendar.tour-sync] mirror window update failed', { spaceId: input.spaceId, tourId: tour.id, err: mErr.message });
  }

  await notifyTourRescheduled({
    spaceId: input.spaceId,
    guestName: tour.guestName || 'there',
    guestEmail: tour.guestEmail,
    guestPhone: tour.guestPhone,
    propertyAddress: tour.propertyAddress,
    startsAt,
    endsAt,
    tourId: tour.id,
  }).catch((err) => {
    logger.warn('[calendar.tour-sync] reschedule notify failed', { spaceId: input.spaceId, tourId: tour.id }, err);
  });

  logger.info('[calendar.tour-sync] tour rescheduled from external move', {
    spaceId: input.spaceId,
    tourId: tour.id,
    startsAt,
  });
  return { action: 'rescheduled', tourId: tour.id };
}

/** Record the guest's RSVP on the tour. No notify (a quiet status update),
 *  and no auto-cancel on decline — see the module header. */
async function rsvpFromExternal(
  input: CalendarSyncInput,
  tour: MappedTour,
  responseStatus: string,
): Promise<CalendarSyncResult> {
  // Idempotent: re-recording the same status is a no-op (no write, no churn).
  if ((tour.externalResponseStatus ?? null) === responseStatus) {
    return { action: 'noop', tourId: tour.id, reason: 'rsvp_unchanged' };
  }

  await stampSynced(input.spaceId, tour.id, { externalResponseStatus: responseStatus });

  logger.info('[calendar.tour-sync] tour RSVP recorded from external response', {
    spaceId: input.spaceId,
    tourId: tour.id,
    responseStatus,
  });
  return { action: 'rsvp_recorded', tourId: tour.id };
}
