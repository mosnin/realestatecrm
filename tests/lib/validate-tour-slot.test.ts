/**
 * Server-side tour-slot write-path validation — the security guard that stops a
 * crafted POST /api/tours/book from booking a tour the public /available
 * endpoint would never have offered.
 *
 * What these lock in (the real hole this closes):
 *   - An OFF-HOURS time (outside the configured start/end window) is rejected.
 *   - A WRONG-WEEKDAY time (a day not in tourDaysAvailable) is rejected.
 *   - A BLOCKED-DATE time (in tourBlockedDates) is rejected.
 *   - A MISALIGNED time (a real day/window but not a duration-aligned slot
 *     start) is rejected — the write path must mirror the slot grid, not just
 *     the open/closed window.
 *   - A genuinely-valid slot (in-window, right weekday, aligned) is accepted.
 *   - A recurring "blocked" override that lands on the requested date wins over
 *     the otherwise-open weekday.
 *
 * supabase is a scripted mock: each `from(table)` returns the configured
 * payload for that table so a test can dial in any availability config.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

type Settings = {
  tourDuration: number;
  tourStartHour: number;
  tourEndHour: number;
  tourDaysAvailable: number[];
  timezone: string;
  tourBufferMinutes: number;
  tourBlockedDates: string[];
} | null;

// Scripted state the mock reads, reset per-test in beforeEach.
let settingsRow: Settings;
let profileRow: Record<string, unknown> | null;
let overrideRows: Array<Record<string, unknown>>;

vi.mock('@/lib/supabase', () => {
  // validateTourSlot issues, in order:
  //   1. SpaceSetting select ... .maybeSingle()
  //   2. (optional) TourPropertyProfile select ... .maybeSingle()
  //   3. TourAvailabilityOverride select ... awaited (.then)
  function makeChain(table: string): Record<string, unknown> {
    const chain: Record<string, unknown> = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      maybeSingle: vi.fn(() => {
        if (table === 'SpaceSetting') return Promise.resolve({ data: settingsRow, error: null });
        if (table === 'TourPropertyProfile') return Promise.resolve({ data: profileRow, error: null });
        return Promise.resolve({ data: null, error: null });
      }),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
        // The only awaited (non-maybeSingle) query is the overrides fetch.
        const payload =
          table === 'TourAvailabilityOverride'
            ? { data: overrideRows, error: null }
            : { data: null, error: null };
        return Promise.resolve(payload).then(resolve, reject);
      },
    };
    return chain;
  }
  return { supabase: { from: vi.fn((t: string) => makeChain(t)) } };
});

import { validateTourSlot } from '@/lib/tours/validate-slot';

// Defaults mirror available/route.ts fallbacks: ET, Mon–Fri, 07:00–17:00, 30-min slots.
const DEFAULT_SETTINGS: Settings = {
  tourDuration: 30,
  tourStartHour: 7,
  tourEndHour: 17,
  tourDaysAvailable: [1, 2, 3, 4, 5],
  timezone: 'America/New_York',
  tourBufferMinutes: 0,
  tourBlockedDates: [],
};

// Concrete instants computed against America/New_York for fixed July 2026 dates.
// Wed 2026-07-15 (dow=3, a weekday); Sun 2026-07-19 (dow=0, a weekend).
const WED_0900_ET = new Date('2026-07-15T13:00:00.000Z'); // valid: in-window, aligned
const WED_1900_ET = new Date('2026-07-15T23:00:00.000Z'); // off-hours (after 17:00)
const WED_0913_ET = new Date('2026-07-15T13:13:00.000Z'); // misaligned (not a slot start)
const SUN_0900_ET = new Date('2026-07-19T13:00:00.000Z'); // wrong weekday (Sunday)

beforeEach(() => {
  settingsRow = { ...DEFAULT_SETTINGS };
  profileRow = null;
  overrideRows = [];
  vi.clearAllMocks();
});

describe('validateTourSlot — write-path availability guard', () => {
  it('accepts a genuinely valid slot (in-window weekday, duration-aligned)', async () => {
    const res = await validateTourSlot('space_1', WED_0900_ET, null);
    expect(res.ok).toBe(true);
  });

  it('rejects an off-hours time (outside the configured window)', async () => {
    const res = await validateTourSlot('space_1', WED_1900_ET, null);
    expect(res.ok).toBe(false);
    expect(res.reason).toBeTruthy();
  });

  it('rejects a wrong-weekday time (day not in tourDaysAvailable)', async () => {
    const res = await validateTourSlot('space_1', SUN_0900_ET, null);
    expect(res.ok).toBe(false);
    expect(res.reason).toBeTruthy();
  });

  it('rejects a blocked-date time even when the weekday/window are otherwise open', async () => {
    settingsRow = { ...DEFAULT_SETTINGS, tourBlockedDates: ['2026-07-15'] };
    const res = await validateTourSlot('space_1', WED_0900_ET, null);
    expect(res.ok).toBe(false);
  });

  it('rejects a misaligned time (real day + window but not a slot start)', async () => {
    const res = await validateTourSlot('space_1', WED_0913_ET, null);
    expect(res.ok).toBe(false);
  });

  it('rejects when a recurring "blocked" override lands on the requested date', async () => {
    // Weekly block starting on the same Wednesday → that Wed is closed.
    overrideRows = [
      {
        date: '2026-07-15',
        isBlocked: true,
        startHour: null,
        endHour: null,
        recurrence: 'weekly',
        endDate: '2026-08-31',
        propertyProfileId: null,
      },
    ];
    const res = await validateTourSlot('space_1', WED_0900_ET, null);
    expect(res.ok).toBe(false);
  });

  it('accepts a slot opened by a single-date override on an otherwise-closed weekday', async () => {
    // Sunday is normally closed (dow 0 not in [1..5]); a single-date override
    // opens 08:00–12:00 ET for that exact date, so an aligned 09:00 slot is valid.
    overrideRows = [
      {
        date: '2026-07-19',
        isBlocked: false,
        startHour: 8,
        endHour: 12,
        recurrence: 'none',
        endDate: null,
        propertyProfileId: null,
      },
    ];
    const res = await validateTourSlot('space_1', SUN_0900_ET, null);
    expect(res.ok).toBe(true);
  });
});
