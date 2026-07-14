/** A `schedule` workflow's trigger.config, as stored. */
export interface ScheduleConfig {
  cadence: 'hourly' | 'daily' | 'weekdays';
  hour?: number;
  timezone?: string;
}

// Formatter construction is the expensive part of Intl — cache one per
// timezone so the watermark scan (up to LOOKBACK_HOURS probes per workflow)
// stays cheap across a 500-workflow tick.
const formatterCache = new Map<string, Intl.DateTimeFormat | null>();

function formatterFor(timezone: string): Intl.DateTimeFormat | null {
  if (formatterCache.has(timezone)) return formatterCache.get(timezone) ?? null;
  let fmt: Intl.DateTimeFormat | null = null;
  try {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      weekday: 'short',
      hour12: false,
    });
  } catch {
    fmt = null; // invalid zone → callers fall back to UTC
  }
  formatterCache.set(timezone, fmt);
  return fmt;
}

/** Resolve the local hour and weekday, falling back to UTC for invalid zones. */
function localHourAndDay(now: Date, timezone?: string): { hour: number; dow: number } {
  const fmt = timezone ? formatterFor(timezone) : null;
  if (!fmt) return { hour: now.getUTCHours(), dow: now.getUTCDay() };

  try {
    const parts = fmt.formatToParts(now);
    const hourStr = parts.find((p) => p.type === 'hour')?.value ?? String(now.getUTCHours());
    const weekdayStr = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
    const dayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    return {
      hour: parseInt(hourStr, 10) % 24,
      dow: dayMap[weekdayStr] ?? now.getUTCDay(),
    };
  } catch {
    return { hour: now.getUTCHours(), dow: now.getUTCDay() };
  }
}

/** Is this hour-boundary instant a scheduled slot for the config? */
function matchesSlot(config: ScheduleConfig, at: Date): boolean {
  if (config.cadence === 'hourly') return true;
  const { hour, dow } = localHourAndDay(at, config.timezone);
  if (hour !== (config.hour ?? 0)) return false;
  return config.cadence !== 'weekdays' || (dow >= 1 && dow <= 5);
}

/** Decide whether a schedule workflow is due in the current hourly tick.
 *
 * NOTE: this is the tick-time check only — it fires iff `now` falls inside a
 * scheduled hour, so a missed cron tick silently drops that slot. The cron
 * uses isScheduleDueWithWatermark (below) for catch-up; this stays exported
 * for backward compatibility and as the null-watermark bootstrap rule. */
export function isScheduleDue(config: ScheduleConfig, now: Date): boolean {
  return matchesSlot(config, now);
}

const HOUR_MS = 3_600_000;

// How far back to search for the most recent scheduled slot. 8 days covers the
// longest legal gap (a weekdays schedule probed on a Monday reaches back to
// Friday, ~3 days) with generous headroom; a misconfigured hour (e.g. 25)
// simply never matches and the workflow is honestly "not due".
const LOOKBACK_HOURS = 8 * 24;

/**
 * The most recent scheduled fire instant at or before `now`, as an hour
 * boundary (Vercel crons tick on the hour). Null when no slot exists inside
 * the lookback window (e.g. an out-of-range configured hour).
 */
export function latestScheduledSlot(config: ScheduleConfig, now: Date): Date | null {
  const topOfHour = new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS);
  if (config.cadence === 'hourly') return topOfHour;

  for (let back = 0; back < LOOKBACK_HOURS; back++) {
    const candidate = new Date(topOfHour.getTime() - back * HOUR_MS);
    if (matchesSlot(config, candidate)) return candidate;
  }
  return null;
}

export interface ScheduleDueResult {
  due: boolean;
  /** The slot being fired (or the one most recently satisfied). Stamp THIS —
   *  not `now` — into lastScheduledFireAt so a re-tick inside the same slot
   *  compares equal and can't double-fire. */
  slot: Date | null;
}

/**
 * Watermark-aware due check: fire iff the most recent scheduled slot <= now is
 * strictly later than the last slot we already fired (`lastScheduledFireAt`).
 *
 * This is what makes a LATE hourly tick still fire a missed slot exactly once:
 * a 09:00 daily schedule whose tick arrives at 11:07 still sees "latest slot =
 * today 09:00 > watermark (yesterday 09:00)" and fires; the next tick that day
 * sees slot == watermark and does not.
 *
 * A null watermark (pre-migration rows, or a workflow that has never fired)
 * falls back to the strict tick-time rule so the first deploy of this logic
 * can't mass-fire every daily workflow at whatever hour it ships.
 */
export function isScheduleDueWithWatermark(
  config: ScheduleConfig,
  now: Date,
  lastScheduledFireAt: string | Date | null | undefined,
): ScheduleDueResult {
  const slot = latestScheduledSlot(config, now);

  if (lastScheduledFireAt == null) {
    return { due: isScheduleDue(config, now), slot };
  }
  if (!slot) return { due: false, slot: null };

  const watermark = new Date(lastScheduledFireAt).getTime();
  if (!Number.isFinite(watermark)) {
    // Unparseable watermark — treat like null rather than firing blind.
    return { due: isScheduleDue(config, now), slot };
  }
  return { due: slot.getTime() > watermark, slot };
}
