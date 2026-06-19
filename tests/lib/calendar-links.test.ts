import { describe, it, expect } from 'vitest';
import { toCalStamp, googleCalendarUrl, icsDataUri } from '@/lib/calendar-links';

// A fixed instant so the UTC stamp is deterministic regardless of test-runner TZ.
const START = new Date('2026-07-01T18:30:00.000Z'); // 18:30 UTC
const END = new Date('2026-07-01T19:00:00.000Z'); // +30 min

describe('toCalStamp', () => {
  it('formats a Date as a floating UTC calendar stamp', () => {
    expect(toCalStamp(START)).toBe('20260701T183000Z');
  });

  it('strips milliseconds', () => {
    expect(toCalStamp(new Date('2026-12-31T23:59:59.123Z'))).toBe('20261231T235959Z');
  });
});

describe('googleCalendarUrl', () => {
  it('builds a prefilled create-event URL with the slot window', () => {
    const url = googleCalendarUrl({ title: 'Tour with Acme Realty', start: START, end: END });
    expect(url.startsWith('https://calendar.google.com/calendar/render?')).toBe(true);
    expect(url).toContain('action=TEMPLATE');
    expect(url).toContain('dates=20260701T183000Z%2F20260701T190000Z');
    // Title is URL-encoded by URLSearchParams (spaces -> +).
    expect(url).toContain('text=Tour+with+Acme+Realty');
  });

  it('includes location and details only when provided', () => {
    const withLoc = googleCalendarUrl({
      title: 'Tour',
      start: START,
      end: END,
      location: '123 Main St',
      details: 'See you there',
    });
    expect(withLoc).toContain('location=123+Main+St');
    expect(withLoc).toContain('details=See+you+there');

    const withoutLoc = googleCalendarUrl({ title: 'Tour', start: START, end: END });
    expect(withoutLoc).not.toContain('location=');
    expect(withoutLoc).not.toContain('details=');
  });
});

describe('icsDataUri', () => {
  function decode(uri: string): string {
    expect(uri.startsWith('data:text/calendar;charset=utf-8,')).toBe(true);
    return decodeURIComponent(uri.slice('data:text/calendar;charset=utf-8,'.length));
  }

  it('emits a well-formed single VEVENT with the slot window', () => {
    const ics = decode(icsDataUri({ title: 'Tour with Acme', start: START, end: END }));
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('DTSTART:20260701T183000Z');
    expect(ics).toContain('DTEND:20260701T190000Z');
    expect(ics).toContain('SUMMARY:Tour with Acme');
    expect(ics).toContain('END:VEVENT');
    expect(ics).toContain('END:VCALENDAR');
    // Exactly one event.
    expect(ics.match(/BEGIN:VEVENT/g)?.length).toBe(1);
  });

  it('escapes special characters in summary and location', () => {
    const ics = decode(
      icsDataUri({
        title: 'Tour; with, Acme',
        start: START,
        end: END,
        location: '1 Main St, Apt; 2',
      }),
    );
    expect(ics).toContain('SUMMARY:Tour\\; with\\, Acme');
    expect(ics).toContain('LOCATION:1 Main St\\, Apt\\; 2');
  });

  it('omits location and description lines when not provided', () => {
    const ics = decode(icsDataUri({ title: 'Tour', start: START, end: END }));
    expect(ics).not.toContain('LOCATION:');
    expect(ics).not.toContain('DESCRIPTION:');
  });
});
