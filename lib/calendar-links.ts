/**
 * Calendar deep-links for the guest booking flow.
 *
 * After a tour is booked, the confirmation offers "add to calendar" — the
 * single highest-leverage moment to capture the slot while it's fresh and cut
 * no-shows. Two routes cover every calendar app:
 *   - Google Calendar  → a prefilled "create event" URL (no auth dance)
 *   - .ics data URI     → Apple Calendar / Outlook / everything else
 *
 * The slot ISO carries the authoritative instant; we emit UTC timestamps so
 * both targets resolve the event to the guest's own local time.
 */

export interface CalendarEventInput {
  title: string;
  start: Date;
  end: Date;
  location?: string | null;
  details?: string | null;
}

/** Format a Date as the floating UTC timestamp calendar links expect:
 *  YYYYMMDDTHHMMSSZ. */
export function toCalStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Google Calendar "create event" deep link. Opens a prefilled event the
 *  guest just saves — works on mobile + desktop. */
export function googleCalendarUrl({ title, start, end, location, details }: CalendarEventInput): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${toCalStamp(start)}/${toCalStamp(end)}`,
  });
  if (location) params.set('location', location);
  if (details) params.set('details', details);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** A self-contained .ics data URI for Apple Calendar / Outlook. RFC-5545
 *  shaped; kept compact (line-folding isn't needed at this size). Returns a
 *  `data:` URL the anchor downloads. */
export function icsDataUri({ title, start, end, location, details }: CalendarEventInput): string {
  const esc = (s: string) => s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const uid = `${toCalStamp(start)}-${Math.random().toString(36).slice(2)}@chippi`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Chippi//Tour//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toCalStamp(new Date())}`,
    `DTSTART:${toCalStamp(start)}`,
    `DTEND:${toCalStamp(end)}`,
    `SUMMARY:${esc(title)}`,
    location ? `LOCATION:${esc(location)}` : '',
    details ? `DESCRIPTION:${esc(details)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines.join('\r\n'))}`;
}
