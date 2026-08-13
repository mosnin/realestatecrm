/**
 * Minimal 5-field crontab matcher (UTC) for the worker's master tick.
 *
 * Supports exactly the syntax the schedule uses: star, star-slash-step,
 * plain numbers, and comma lists of numbers (e.g. "0,30"). Anything else THROWS at
 * parse time — an unsupported pattern must fail CI (the matcher tests parse
 * every schedule entry), never silently match nothing in production.
 */

export interface CronFields {
  minute: (v: number) => boolean;
  hour: (v: number) => boolean;
  dayOfMonth: (v: number) => boolean;
  month: (v: number) => boolean;
  dayOfWeek: (v: number) => boolean;
}

function parseField(field: string, min: number, max: number): (v: number) => boolean {
  if (field === '*') return () => true;

  const step = field.match(/^\*\/(\d+)$/);
  if (step) {
    const n = Number(step[1]);
    if (n < 1 || n > max) throw new Error(`invalid step in cron field: ${field}`);
    return (v) => v % n === 0;
  }

  if (/^\d+(,\d+)*$/.test(field)) {
    const values = field.split(',').map(Number);
    for (const v of values) {
      if (v < min || v > max) throw new Error(`out-of-range value in cron field: ${field}`);
    }
    const set = new Set(values);
    return (v) => set.has(v);
  }

  throw new Error(`unsupported cron field syntax: ${field}`);
}

export function parseCron(pattern: string): CronFields {
  const parts = pattern.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`expected 5 cron fields, got: ${pattern}`);
  return {
    minute: parseField(parts[0], 0, 59),
    hour: parseField(parts[1], 0, 23),
    dayOfMonth: parseField(parts[2], 1, 31),
    month: parseField(parts[3], 1, 12),
    dayOfWeek: parseField(parts[4], 0, 7),
  };
}

/**
 * Did `pattern` fire at ANY minute in the half-open window
 * (fromExclusive, toInclusive] (UTC)?
 *
 * This is what makes a best-effort 5-minute master trigger safe: Cloudflare
 * scheduled events can be delayed or skipped, and exact-instant matching means
 * a daily `0 9 * * *` job whose 09:00 tick lands at 09:01 NEVER RUNS THAT DAY.
 * Matching across the window since the last processed tick catches the missed
 * slot instead. Windows are half-open so consecutive ticks can't both claim the
 * same minute (no double-fire).
 *
 * Returns true on the FIRST matching minute — callers enqueue one catch-up run
 * per job per tick, never one per missed slot.
 */
export function cronMatchesInWindow(
  pattern: string,
  fromExclusive: Date,
  toInclusive: Date,
): boolean {
  return latestCronMatchInWindow(pattern, fromExclusive, toInclusive) !== null;
}

/** Latest due minute in a catch-up window. This stable occurrence identity
 * lets the scheduler remember successfully enqueued siblings when a partial
 * queue failure leaves the broader window open for retry. */
export function latestCronMatchInWindow(
  pattern: string,
  fromExclusive: Date,
  toInclusive: Date,
): Date | null {
  const start = Math.floor(fromExclusive.getTime() / 60_000) * 60_000 + 60_000;
  const end = Math.floor(toInclusive.getTime() / 60_000) * 60_000;
  for (let t = end; t >= start; t -= 60_000) {
    const at = new Date(t);
    if (cronMatches(pattern, at)) return at;
  }
  return null;
}

/** Does `pattern` fire at this instant (UTC)? Standard cron dom/dow rule:
 *  when both are restricted, either matching fires; our schedules restrict at
 *  most one, where the rule degenerates to plain AND. */
export function cronMatches(pattern: string, at: Date): boolean {
  const f = parseCron(pattern);
  const minute = at.getUTCMinutes();
  const hour = at.getUTCHours();
  const dom = at.getUTCDate();
  const month = at.getUTCMonth() + 1;
  const dowRaw = at.getUTCDay(); // 0 = Sunday
  const dow = f.dayOfWeek(dowRaw) || f.dayOfWeek(dowRaw === 0 ? 7 : dowRaw); // 0 and 7 both mean Sunday

  const parts = pattern.trim().split(/\s+/);
  const domRestricted = parts[2] !== '*';
  const dowRestricted = parts[4] !== '*';
  const dayOk =
    domRestricted && dowRestricted ? f.dayOfMonth(dom) || dow : f.dayOfMonth(dom) && dow;

  return f.minute(minute) && f.hour(hour) && f.month(month) && dayOk;
}
