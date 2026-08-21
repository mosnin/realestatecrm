/**
 * Tour wall-clock formatting in the workspace timezone.
 *
 * Confirmation / reminder / cancel emails and SMS used to call
 * `toLocaleString` with no `timeZone`. On Vercel that is UTC, so a 2:00 PM
 * America/New_York tour was sent to the guest as "6:00 PM" (or 7:00 PM in
 * winter). The booking page and prep card already use SpaceSetting.timezone;
 * guest-facing copy has to match.
 *
 * Invalid / missing IANA names fall back to America/New_York — the same
 * default the availability slot generator uses.
 */

export const DEFAULT_TOUR_TIMEZONE = 'America/New_York';

export function resolveTourTimezone(timezone?: string | null): string {
  const tz = timezone?.trim();
  if (!tz) return DEFAULT_TOUR_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format();
    return tz;
  } catch {
    return DEFAULT_TOUR_TIMEZONE;
  }
}

function asDate(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Wednesday, July 15, 2026" */
export function formatTourDate(iso: string, timezone?: string | null): string {
  const d = asDate(iso);
  if (!d) return '';
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: resolveTourTimezone(timezone),
  });
}

/** "Jul 15" */
export function formatTourShortDate(iso: string, timezone?: string | null): string {
  const d = asDate(iso);
  if (!d) return '';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: resolveTourTimezone(timezone),
  });
}

/** "2:00 PM" */
export function formatTourTime(iso: string, timezone?: string | null): string {
  const d = asDate(iso);
  if (!d) return '';
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: resolveTourTimezone(timezone),
  });
}
