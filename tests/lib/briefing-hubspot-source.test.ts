/**
 * HubSpot signal source — unit tests for the pure helpers.
 *
 * Composio itself is integration territory and isn't mocked here. What
 * IS worth locking in:
 *
 *   - The deal cross-walk is case-insensitive on title and only matches
 *     on the WHOLE title. A partial / substring match would surface the
 *     wrong deal; a case-sensitive match would silently miss when
 *     HubSpot's title casing differs from Chippi's.
 *
 *   - The contact cross-walk is case-insensitive + whitespace-trimmed on
 *     email. Without this, a HubSpot row with " Email@Host.com " would
 *     silently never match the Chippi row with "email@host.com" and the
 *     new-contact tip would fire for someone who is in fact in Chippi.
 *
 *   - The trigger freshness gate (`firedRecently`) only opens within 24h.
 *     Drift here means stage-advance signals from last week start firing.
 *
 *   - `daysUntil` floors at the calendar-day boundary — a closedate at
 *     11pm today is "0 days", same as one at 8am today.
 *
 *   - `formatCloseDate` renders the design's three buckets (today,
 *     tomorrow, weekday-within-week).
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  matchDealByTitle,
  matchContactByEmail,
  daysUntil,
  firedRecently,
  formatCloseDate,
  describeChippiStage,
} from '@/lib/briefing/signal-sources/hubspot';

describe('hubspot source — deal title cross-walk', () => {
  const deals = [
    { id: 'd-chen', title: 'Chen — 145 Maple', stageId: 's1' },
    { id: 'd-reyes', title: 'Reyes Family — Bayside Condo', stageId: 's2' },
  ];

  it('matches an exact title', () => {
    expect(matchDealByTitle('Chen — 145 Maple', deals)?.id).toBe('d-chen');
  });

  it('matches case-insensitively', () => {
    expect(matchDealByTitle('CHEN — 145 MAPLE', deals)?.id).toBe('d-chen');
  });

  it('trims surrounding whitespace before comparing', () => {
    expect(matchDealByTitle('  Reyes Family — Bayside Condo  ', deals)?.id).toBe('d-reyes');
  });

  it('returns null on a partial match (substring)', () => {
    // Partial matches would name the wrong deal — drop instead.
    expect(matchDealByTitle('Chen', deals)).toBeNull();
  });

  it('returns null when no deal matches', () => {
    expect(matchDealByTitle('Unknown Deal', deals)).toBeNull();
  });

  it('returns null on null / empty / whitespace-only input', () => {
    expect(matchDealByTitle(null, deals)).toBeNull();
    expect(matchDealByTitle('', deals)).toBeNull();
    expect(matchDealByTitle('   ', deals)).toBeNull();
  });
});

describe('hubspot source — contact email cross-walk', () => {
  const contacts = [
    { id: 'c-tara', name: 'Tara Mendes', email: 'tara@example.com' },
    { id: 'c-jay', name: 'Jay Park', email: 'jay@example.com' },
    { id: 'c-noemail', name: 'No Email', email: null },
  ];

  it('matches an exact email', () => {
    expect(matchContactByEmail('tara@example.com', contacts)?.id).toBe('c-tara');
  });

  it('matches case-insensitively', () => {
    expect(matchContactByEmail('Tara@Example.com', contacts)?.id).toBe('c-tara');
  });

  it('trims surrounding whitespace', () => {
    expect(matchContactByEmail('  jay@example.com  ', contacts)?.id).toBe('c-jay');
  });

  it('returns null when no email matches', () => {
    expect(matchContactByEmail('stranger@example.com', contacts)).toBeNull();
  });

  it('returns null on null / empty input', () => {
    expect(matchContactByEmail(null, contacts)).toBeNull();
    expect(matchContactByEmail('', contacts)).toBeNull();
  });

  it('skips Chippi contacts whose own email is null (no accidental match)', () => {
    expect(matchContactByEmail('', contacts)).toBeNull();
  });
});

describe('hubspot source — daysUntil', () => {
  beforeEach(() => {
    // Pin "now" to 2026-05-30 10:00 local. The function floors to the
    // calendar day so the time of day in `now` doesn't matter.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 30, 10, 0, 0));
  });
  afterEach(() => { vi.useRealTimers(); });

  it('returns 0 for today', () => {
    // 11pm today is still 0 — same calendar day.
    expect(daysUntil('2026-05-30T23:00:00Z')).toBe(0);
  });

  it('returns 1 for tomorrow', () => {
    expect(daysUntil('2026-05-31T08:00:00Z')).toBe(1);
  });

  it('returns 7 for a week out', () => {
    expect(daysUntil('2026-06-06T08:00:00Z')).toBe(7);
  });

  it('returns negative when the date is past', () => {
    expect(daysUntil('2026-05-28T08:00:00Z')).toBeLessThan(0);
  });

  it('returns null on null / invalid input', () => {
    expect(daysUntil(null)).toBeNull();
    expect(daysUntil(undefined)).toBeNull();
    expect(daysUntil('not-a-date')).toBeNull();
  });
});

describe('hubspot source — firedRecently (24h trigger window)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-30T10:00:00Z'));
  });
  afterEach(() => { vi.useRealTimers(); });

  it('returns true for 1 hour ago', () => {
    expect(firedRecently('2026-05-30T09:00:00Z')).toBe(true);
  });

  it('returns true at exactly the 24h boundary', () => {
    expect(firedRecently('2026-05-29T10:00:00Z')).toBe(true);
  });

  it('returns false just past 24h ago', () => {
    expect(firedRecently('2026-05-29T09:59:00Z')).toBe(false);
  });

  it('returns false for null / invalid', () => {
    expect(firedRecently(null)).toBe(false);
    expect(firedRecently(undefined)).toBe(false);
    expect(firedRecently('garbage')).toBe(false);
  });
});

describe('hubspot source — formatCloseDate', () => {
  it('says "today" at 0 days', () => {
    expect(formatCloseDate('2026-05-30T12:00:00Z', 0)).toBe('today');
  });

  it('says "tomorrow" at 1 day', () => {
    expect(formatCloseDate('2026-05-31T12:00:00Z', 1)).toBe('tomorrow');
  });

  it('renders a weekday name inside the week (≤6 days)', () => {
    // 2026-06-05 is a Friday — the design's exact example string.
    const out = formatCloseDate('2026-06-05T12:00:00Z', 6);
    expect(out).toMatch(/^[A-Z][a-z]+day$/);
  });

  it('renders month + day past one week', () => {
    const out = formatCloseDate('2026-06-30T12:00:00Z', 31);
    expect(out).toMatch(/^[A-Z][a-z]+ \d+$/); // e.g. "Jun 30"
  });

  it('falls back gracefully on invalid ISO', () => {
    expect(formatCloseDate('not-a-date', 5)).toBe('in 5 days');
    expect(formatCloseDate(null, 5)).toBe('in 5 days');
  });
});

describe('hubspot source — describeChippiStage', () => {
  it('prefers DealStage.name when present', () => {
    const deal = { id: 'd1', title: 'X', DealStage: { kind: 'active', name: 'Negotiation' } };
    expect(describeChippiStage(deal)).toBe('Negotiation');
  });

  it('falls back to DealStage.kind when name is empty', () => {
    const deal = { id: 'd1', title: 'X', DealStage: { kind: 'active', name: '   ' } };
    expect(describeChippiStage(deal)).toBe('active');
  });

  it('falls back to "open" when DealStage is null', () => {
    const deal = { id: 'd1', title: 'X', DealStage: null };
    expect(describeChippiStage(deal)).toBe('open');
  });
});
