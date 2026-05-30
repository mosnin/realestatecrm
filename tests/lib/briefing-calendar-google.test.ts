/**
 * Pure-helper tests for the Google Calendar signal source. The gather()
 * path hits Composio + Supabase and is covered by integration tests
 * elsewhere; here we lock the classification logic that decides what's
 * a signal and what's noise.
 */

import { describe, expect, it } from 'vitest';
import {
  normalizeEmail,
  eventStart,
  isStaleRecurring,
  findMatchedAttendee,
  classifyEvent,
  type ClassifyInput,
} from '@/lib/briefing/signal-sources/calendar-google';

const contact = {
  id: 'c-1',
  name: 'Dani Ortega',
  email: 'dani@example.com',
  lastContactedAt: null,
};

function makeInput(overrides: Partial<ClassifyInput> = {}): ClassifyInput {
  return {
    id: 'ev-1',
    summary: 'Coffee with Dani',
    start: new Date('2026-05-30T18:00:00Z'),
    contact,
    declined: false,
    hasRecentThread: false,
    ...overrides,
  };
}

describe('calendar-google — normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  DANI@Example.COM  ')).toBe('dani@example.com');
  });
  it('returns null for empty or null', () => {
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail('   ')).toBeNull();
  });
});

describe('calendar-google — eventStart', () => {
  it('reads dateTime first', () => {
    const d = eventStart({ start: { dateTime: '2026-05-30T14:00:00Z', date: '2026-05-30' } });
    expect(d?.toISOString()).toBe('2026-05-30T14:00:00.000Z');
  });
  it('falls back to all-day date', () => {
    const d = eventStart({ start: { date: '2026-05-30' } });
    expect(d).not.toBeNull();
  });
  it('returns null on missing or invalid', () => {
    expect(eventStart({})).toBeNull();
    expect(eventStart({ start: { dateTime: 'garbage' } })).toBeNull();
  });
});

describe('calendar-google — isStaleRecurring', () => {
  const now = new Date('2026-05-30T12:00:00Z');
  it('non-recurring is never stale', () => {
    expect(isStaleRecurring({ id: 'a' }, now)).toBe(false);
  });
  it('recurring series < 60 days old is fresh', () => {
    const start = new Date(now.getTime() - 30 * 86400000).toISOString();
    expect(
      isStaleRecurring({ recurringEventId: 'r1', originalStartTime: { dateTime: start } }, now),
    ).toBe(false);
  });
  it('recurring series > 60 days old is stale', () => {
    const start = new Date(now.getTime() - 90 * 86400000).toISOString();
    expect(
      isStaleRecurring({ recurringEventId: 'r1', originalStartTime: { dateTime: start } }, now),
    ).toBe(true);
  });
});

describe('calendar-google — findMatchedAttendee', () => {
  const byEmail = new Map([['dani@example.com', contact]]);

  it('returns null when no attendees', () => {
    expect(findMatchedAttendee({}, byEmail)).toBeNull();
  });
  it('matches first non-self contact email', () => {
    const match = findMatchedAttendee(
      {
        attendees: [
          { email: 'realtor@me.com', self: true },
          { email: 'DANI@example.com', responseStatus: 'accepted' },
        ],
      },
      byEmail,
    );
    expect(match?.contact.id).toBe('c-1');
    expect(match?.status).toBe('accepted');
  });
  it('ignores organizer and resource rows', () => {
    expect(
      findMatchedAttendee(
        { attendees: [{ email: 'dani@example.com', organizer: true }] },
        byEmail,
      ),
    ).toBeNull();
    expect(
      findMatchedAttendee({ attendees: [{ email: 'dani@example.com', resource: true }] }, byEmail),
    ).toBeNull();
  });
  it('skips attendees without a contact match', () => {
    expect(
      findMatchedAttendee({ attendees: [{ email: 'stranger@nowhere.com' }] }, byEmail),
    ).toBeNull();
  });
});

describe('calendar-google — classifyEvent', () => {
  const now = new Date('2026-05-30T14:00:00Z');
  const firedRecent = new Date(now.getTime() - 60 * 60 * 1000);
  const firedOld = new Date(now.getTime() - 36 * 60 * 60 * 1000);

  it('emits a reply when today + declined + trigger fired in last 24h', () => {
    const sig = classifyEvent(
      makeInput({
        start: new Date(now.getTime() + 2 * 60 * 60 * 1000),
        declined: true,
      }),
      now,
      firedRecent,
    );
    expect(sig?.kind).toBe('reply');
    expect(sig?.urgency).toBe(1);
    expect(sig?.confidence).toBe(0.88);
    expect(sig?.evidence).toMatch(/declined/);
  });

  it('falls back to prep when decline is older than 24h', () => {
    const sig = classifyEvent(
      makeInput({
        start: new Date(now.getTime() + 2 * 60 * 60 * 1000),
        declined: true,
      }),
      now,
      firedOld,
    );
    expect(sig?.kind).toBe('prep');
    expect(sig?.confidence).toBe(0.92);
  });

  it('emits prep urgency-1 within 4h today', () => {
    const sig = classifyEvent(
      makeInput({ start: new Date(now.getTime() + 3 * 60 * 60 * 1000) }),
      now,
      null,
    );
    expect(sig?.kind).toBe('prep');
    expect(sig?.urgency).toBe(1);
    expect(sig?.confidence).toBe(0.92);
  });

  it('emits prep urgency-2 tomorrow when no recent thread', () => {
    const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    const sig = classifyEvent(makeInput({ start: tomorrow, hasRecentThread: false }), now, null);
    expect(sig?.kind).toBe('prep');
    expect(sig?.urgency).toBe(2);
    expect(sig?.confidence).toBe(0.82);
    expect(sig?.evidence).toMatch(/No recent thread/);
  });

  it('drops tomorrow events when a recent thread already exists', () => {
    const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    const sig = classifyEvent(makeInput({ start: tomorrow, hasRecentThread: true }), now, null);
    expect(sig).toBeNull();
  });

  it('drops events that already started more than 30 minutes ago', () => {
    const sig = classifyEvent(
      makeInput({ start: new Date(now.getTime() - 60 * 60 * 1000) }),
      now,
      null,
    );
    expect(sig).toBeNull();
  });

  it('drops today events outside the 4h window when not declined', () => {
    const sig = classifyEvent(
      makeInput({ start: new Date(now.getTime() + 8 * 60 * 60 * 1000) }),
      now,
      null,
    );
    expect(sig).toBeNull();
  });

  it('uses contact name as subject, not event title', () => {
    const sig = classifyEvent(
      makeInput({ start: new Date(now.getTime() + 2 * 60 * 60 * 1000) }),
      now,
      null,
    );
    expect(sig?.subject.name).toBe('Dani Ortega');
    expect(sig?.subject.href).toBe('/contacts/c-1');
  });

  it('signals stay above the 0.7 confidence floor', () => {
    const candidates = [
      classifyEvent(
        makeInput({ start: new Date(now.getTime() + 2 * 60 * 60 * 1000), declined: true }),
        now,
        firedRecent,
      ),
      classifyEvent(makeInput({ start: new Date(now.getTime() + 2 * 60 * 60 * 1000) }), now, null),
    ];
    for (const s of candidates) {
      expect(s).not.toBeNull();
      expect(s!.confidence).toBeGreaterThanOrEqual(0.7);
    }
  });
});
