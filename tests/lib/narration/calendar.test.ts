import { describe, it, expect } from 'vitest';
import {
  composeCalendarNarration,
  type CalendarNarrationInput,
} from '@/lib/narration/calendar';

// Anchor "now" mid-day so today/tomorrow boundaries are unambiguous.
const NOW = new Date('2026-05-01T15:00:00');

const todayAt    = (h: number) => new Date(`2026-05-01T${String(h).padStart(2, '0')}:00:00`).toISOString();
const yesterday  = new Date('2026-04-30T09:00:00').toISOString();
const inThreeDays = new Date('2026-05-04T10:00:00').toISOString();
const inTenDays   = new Date('2026-05-11T10:00:00').toISOString();

const make = (overrides: Partial<CalendarNarrationInput> = {}): CalendarNarrationInput => ({
  tours: [],
  contactFollowUps: [],
  dealFollowUps: [],
  ...overrides,
});

describe('composeCalendarNarration', () => {
  // ── Overdue branch ──────────────────────────────────────────────────────

  it('names a single overdue follow-up', () => {
    const out = composeCalendarNarration(
      make({ contactFollowUps: [{ followUpAt: yesterday }] }),
      NOW,
    );
    expect(out.text).toBe('1 follow-up slipped past its date. Catch up.');
    expect(out.action).toBe('goto-day');
  });

  it('pluralises overdue follow-ups', () => {
    const out = composeCalendarNarration(
      make({
        contactFollowUps: [
          { followUpAt: yesterday },
          { followUpAt: yesterday },
        ],
        dealFollowUps: [{ followUpAt: yesterday }],
      }),
      NOW,
    );
    expect(out.text).toBe('3 follow-ups slipped past their date. Catch up.');
    expect(out.action).toBe('goto-day');
  });

  it('mixes contact + deal follow-ups in the overdue count', () => {
    const out = composeCalendarNarration(
      make({
        contactFollowUps: [{ followUpAt: yesterday }],
        dealFollowUps: [{ followUpAt: yesterday }],
      }),
      NOW,
    );
    expect(out.text).toBe('2 follow-ups slipped past their date. Catch up.');
    expect(out.action).toBe('goto-day');
  });

  // ── Today branch ────────────────────────────────────────────────────────

  it('names a single thing today', () => {
    const out = composeCalendarNarration(
      make({ tours: [{ startsAt: todayAt(16) }] }),
      NOW,
    );
    expect(out.text).toBe('1 thing on your calendar today.');
    expect(out.action).toBe('goto-day');
  });

  it('pluralises a busy today', () => {
    const out = composeCalendarNarration(
      make({
        tours: [{ startsAt: todayAt(10) }, { startsAt: todayAt(14) }],
        contactFollowUps: [{ followUpAt: todayAt(18) }],
      }),
      NOW,
    );
    expect(out.text).toBe('3 things on your calendar today.');
    expect(out.action).toBe('goto-day');
  });

  // ── This-week branch ────────────────────────────────────────────────────

  it('names a single tour this week', () => {
    const out = composeCalendarNarration(
      make({ tours: [{ startsAt: inThreeDays }] }),
      NOW,
    );
    expect(out.text).toBe('1 tour scheduled this week.');
    expect(out.action).toBe('goto-week');
  });

  it('pluralises tours this week', () => {
    const out = composeCalendarNarration(
      make({
        tours: [
          { startsAt: inThreeDays },
          { startsAt: inThreeDays },
          { startsAt: inThreeDays },
        ],
      }),
      NOW,
    );
    expect(out.text).toBe('3 tours scheduled this week.');
    expect(out.action).toBe('goto-week');
  });

  it('does not count a tour beyond the 7-day window', () => {
    const out = composeCalendarNarration(
      make({ tours: [{ startsAt: inTenDays }] }),
      NOW,
    );
    expect(out.text).toBe('Calendar’s quiet this week. Schedule a tour to fill it in.');
    expect(out.action).toBeNull();
  });

  // ── Empty / quiet ───────────────────────────────────────────────────────

  it('lands on the quiet sentence when nothing is scheduled', () => {
    const out = composeCalendarNarration(make(), NOW);
    expect(out.text).toBe('Calendar’s quiet this week. Schedule a tour to fill it in.');
    expect(out.action).toBeNull();
  });

  // ── Priority ladder ─────────────────────────────────────────────────────

  it('prefers overdue over today and this-week', () => {
    const out = composeCalendarNarration(
      make({
        contactFollowUps: [{ followUpAt: yesterday }, { followUpAt: todayAt(11) }],
        tours: [{ startsAt: todayAt(15) }, { startsAt: inThreeDays }],
      }),
      NOW,
    );
    expect(out.text).toBe('1 follow-up slipped past its date. Catch up.');
    expect(out.action).toBe('goto-day');
  });

  it('prefers today over this-week when no overdue', () => {
    const out = composeCalendarNarration(
      make({
        tours: [{ startsAt: todayAt(11) }, { startsAt: todayAt(15) }, { startsAt: inThreeDays }],
      }),
      NOW,
    );
    expect(out.text).toBe('2 things on your calendar today.');
    expect(out.action).toBe('goto-day');
  });
});
