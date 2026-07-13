import { supabase } from '@/lib/supabase';

/**
 * Server-side re-validation that a requested tour `startsAt` corresponds to a
 * REAL, allowed slot in the realtor's configured availability window.
 *
 * The public GET /api/tours/available endpoint enforces the window when it
 * generates slots, but the write path (POST /api/tours/book) historically only
 * checked "not in the past" + the atomic conflict RPC — so a crafted POST could
 * book an off-hours / blocked-date / wrong-weekday tour onto the real calendar.
 *
 * This helper reproduces the EXACT slot-determination logic from
 * app/api/tours/available/route.ts (timezone-aware day math, override expansion
 * incl. recurrence, weekday + blocked-date gating, hour window, and
 * duration-aligned slot stepping with the end-of-window fit check) and returns
 * whether the requested timestamp is one of the slots that endpoint would have
 * offered.
 *
 * It deliberately does NOT consider double-booking / GCal conflicts — those are
 * handled separately by the atomic RPC (bookTourAtomic). This is purely the
 * availability-window check.
 */

export interface ValidateSlotResult {
  ok: boolean;
  reason?: string;
}

/** Same offset computation used by available/route.ts. */
function getTimezoneOffsetMs(date: Date, tz: string): number {
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
  const tzStr = date.toLocaleString('en-US', { timeZone: tz });
  const utcDate = new Date(utcStr);
  const tzDate = new Date(tzStr);
  return tzDate.getTime() - utcDate.getTime();
}

/**
 * @param spaceId            the space the booking is for
 * @param startsAt           the requested start time (Date)
 * @param propertyProfileId  validated property profile id, or null for space defaults
 */
export async function validateTourSlot(
  spaceId: string,
  startsAt: Date,
  propertyProfileId: string | null,
): Promise<ValidateSlotResult> {
  // ── Load space settings (same fields available/route.ts reads) ──────────────
  const { data: settings } = await supabase
    .from('SpaceSetting')
    .select('tourDuration, tourStartHour, tourEndHour, tourDaysAvailable, timezone, tourBufferMinutes, tourBlockedDates')
    .eq('spaceId', spaceId)
    .maybeSingle();

  let duration = settings?.tourDuration ?? 30;
  let startHour = settings?.tourStartHour ?? 7;
  let endHour = settings?.tourEndHour ?? 17;
  let daysAvailable: number[] = settings?.tourDaysAvailable ?? [1, 2, 3, 4, 5];
  const timezone = settings?.timezone ?? 'America/New_York';
  const blockedDates: string[] = settings?.tourBlockedDates ?? [];

  // ── Per-property overrides (same precedence available/route.ts uses) ────────
  if (propertyProfileId) {
    const { data: profile } = await supabase
      .from('TourPropertyProfile')
      .select('*')
      .eq('id', propertyProfileId)
      .eq('spaceId', spaceId)
      .eq('isActive', true)
      .maybeSingle();
    if (profile) {
      duration = profile.tourDuration;
      startHour = profile.startHour;
      endHour = profile.endHour;
      daysAvailable = profile.daysAvailable;
    }
  }

  const blockedSet = new Set(blockedDates);

  // ── Determine the requested slot's LOCAL day in the space timezone ──────────
  // available/route.ts derives each day's local date from a noon cursor; we go
  // the other direction: convert the requested UTC instant into the space TZ to
  // find its calendar day, then regenerate that day's slots and look for a match.
  const tzOffsetAtStart = getTimezoneOffsetMs(startsAt, timezone);
  const localStart = new Date(startsAt.getTime() + tzOffsetAtStart);
  const year = localStart.getUTCFullYear();
  const month = localStart.getUTCMonth();
  const dayOfMonth = localStart.getUTCDate();

  // Build a noon cursor for that local day, matching available/route.ts's
  // "use noon to avoid DST edge cases" approach for the per-day offset.
  const cursor = new Date(Date.UTC(year, month, dayOfMonth, 12, 0, 0, 0));
  const tzOffset = getTimezoneOffsetMs(cursor, timezone);
  // Keep the shifted "local wall clock" representation in UTC getters. Using
  // getFullYear()/new Date(y,m,d,...) here makes validation depend on the
  // server process timezone (UTC on Vercel, local timezone in development).
  const dayOfWeek = new Date(Date.UTC(year, month, dayOfMonth)).getUTCDay();
  const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`;

  // ── Build the effective override for this single date (single + recurring) ──
  const { data: overridesRaw } = await supabase
    .from('TourAvailabilityOverride')
    .select('date, isBlocked, startHour, endHour, recurrence, endDate, propertyProfileId')
    .eq('spaceId', spaceId);

  let effectiveOverride: { isBlocked: boolean; startHour: number | null; endHour: number | null } | undefined;

  // Single-date overrides take precedence over recurring ones (available/route.ts
  // sets single-date entries directly and refuses to overwrite them with
  // recurring expansions). Resolve singles first.
  for (const o of overridesRaw ?? []) {
    if (propertyProfileId && o.propertyProfileId && o.propertyProfileId !== propertyProfileId) continue;
    if (!propertyProfileId && o.propertyProfileId) continue;
    if (o.recurrence === 'none' && o.date === dateKey) {
      effectiveOverride = { isBlocked: o.isBlocked, startHour: o.startHour, endHour: o.endHour };
      break;
    }
  }

  if (!effectiveOverride) {
    for (const o of overridesRaw ?? []) {
      if (propertyProfileId && o.propertyProfileId && o.propertyProfileId !== propertyProfileId) continue;
      if (!propertyProfileId && o.propertyProfileId) continue;
      if (o.recurrence === 'none') continue;

      // Does this recurring override land on dateKey? Walk forward from its
      // start the same way available/route.ts expands it.
      const oStart = new Date(o.date + 'T12:00:00Z');
      const targetDay = new Date(dateKey + 'T12:00:00Z');
      const oEnd = o.endDate ? new Date(o.endDate + 'T12:00:00Z') : targetDay;
      if (targetDay < oStart || targetDay > oEnd) continue;

      const cur = new Date(oStart);
      let lands = false;
      // Bound the walk; the 14-day availability horizon means recurrences never
      // need to expand far, but cap iterations defensively.
      for (let i = 0; i < 1000 && cur <= oEnd; i++) {
        const key = `${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, '0')}-${String(cur.getUTCDate()).padStart(2, '0')}`;
        if (key === dateKey) { lands = true; break; }
        if (o.recurrence === 'weekly') cur.setUTCDate(cur.getUTCDate() + 7);
        else if (o.recurrence === 'biweekly') cur.setUTCDate(cur.getUTCDate() + 14);
        else if (o.recurrence === 'monthly') cur.setUTCMonth(cur.getUTCMonth() + 1);
        else break;
      }
      if (lands) {
        effectiveOverride = { isBlocked: o.isBlocked, startHour: o.startHour, endHour: o.endHour };
        break;
      }
    }
  }

  // ── Resolve the day's window (same branching as available/route.ts) ─────────
  let dayAvailable = false;
  let dayStart = startHour;
  let dayEnd = endHour;

  if (effectiveOverride) {
    if (effectiveOverride.isBlocked) {
      dayAvailable = false;
    } else if (effectiveOverride.startHour != null && effectiveOverride.endHour != null) {
      dayAvailable = true;
      dayStart = effectiveOverride.startHour;
      dayEnd = effectiveOverride.endHour;
    }
  } else {
    dayAvailable = daysAvailable.includes(dayOfWeek) && !blockedSet.has(dateKey);
  }

  if (!dayAvailable) {
    return { ok: false, reason: 'Selected time is outside available hours.' };
  }

  // ── Regenerate the day's candidate slot start times, look for an exact match.
  const dayEndMs = Date.UTC(
    year,
    month,
    dayOfMonth,
    dayEnd % 24, 0, 0, 0,
  ) + (dayEnd >= 24 ? 24 * 60 * 60_000 : 0);

  const requestedMs = startsAt.getTime();

  for (let hour = dayStart; hour < dayEnd; hour++) {
    for (let min = 0; min < 60; min += duration) {
      const localSlotMs = Date.UTC(year, month, dayOfMonth, hour, min, 0, 0);
      if (localSlotMs + duration * 60_000 > dayEndMs) continue;

      const utcSlotMs = localSlotMs - tzOffset;
      if (utcSlotMs === requestedMs) {
        return { ok: true };
      }
    }
  }

  return { ok: false, reason: 'Selected time is not a valid tour slot.' };
}
