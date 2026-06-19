/**
 * Unit tests for the digest BATCHING engine (lib/notify-digest):
 *   - window math for daily vs weekly
 *   - buildDigestSections gathers the right events, respects event-type prefs,
 *     formats items, and caps long sections with a "+N more" line.
 *
 * Supabase is mocked with a per-table thenable queue (mirrors
 * tests/api/draft-outcomes.test.ts). buildDigestSections issues at most one
 * query per enabled event type, in order: Contact, Tour, Deal.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

type Terminal = { data?: unknown; error?: unknown };
let queueByTable: Record<string, Terminal[]> = {};
const tableReads: string[] = [];

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    tableReads.push(table);
    const terminal = (queueByTable[table] ?? []).shift() ?? { data: [], error: null };
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is', 'contains', 'gte', 'lte', 'order', 'limit']) {
      chain[m] = vi.fn(() => chain);
    }
    chain.then = (resolve: (v: Terminal) => unknown) => Promise.resolve(terminal).then(resolve);
    return chain;
  }
  return { supabase: { from: vi.fn((t: string) => makeChain(t)) } };
});

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  buildDigestSections,
  digestWindow,
  contiguousWindow,
  windowMsForCadence,
} from '@/lib/notify-digest';
import type { EffectiveEventTypes } from '@/lib/notify-prefs';

const ALL_EVENTS: EffectiveEventTypes = {
  newLeads: true,
  tourBookings: true,
  newDeals: true,
  followUps: true,
};

beforeEach(() => {
  queueByTable = {};
  tableReads.length = 0;
  vi.clearAllMocks();
});

describe('window math', () => {
  it('daily = 24h, weekly = 7d', () => {
    expect(windowMsForCadence('daily')).toBe(24 * 60 * 60 * 1000);
    expect(windowMsForCadence('weekly')).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('digestWindow ends at now and reaches back one cadence window', () => {
    const now = new Date('2026-06-18T08:00:00.000Z');
    const daily = digestWindow(now, 'daily');
    expect(daily.until).toBe(now.toISOString());
    expect(daily.since).toBe(new Date('2026-06-17T08:00:00.000Z').toISOString());

    const weekly = digestWindow(now, 'weekly');
    expect(weekly.since).toBe(new Date('2026-06-11T08:00:00.000Z').toISOString());
  });
});

describe('contiguousWindow', () => {
  const now = new Date('2026-06-18T08:00:30.000Z');

  it('first run (no stamp) → falls back to now - window', () => {
    const w = contiguousWindow(now, 'daily', null);
    expect(w.until).toBe(now.toISOString());
    expect(w.since).toBe(new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString());
  });

  it('anchors `since` to the previous stamp so windows are contiguous', () => {
    // Yesterday's run at 08:00:10 → today picks up exactly there, no gap/overlap.
    const last = '2026-06-17T08:00:10.000Z';
    const w = contiguousWindow(now, 'daily', last);
    expect(w.since).toBe(last);
  });

  it('clamps a stale stamp to at most 2× the window (no giant catch-up digest)', () => {
    // Stamp 10 days ago; daily window is 1 day → clamp lookback to 2 days.
    const w = contiguousWindow(now, 'daily', '2026-06-08T08:00:00.000Z');
    expect(w.since).toBe(new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString());
  });

  it('a future stamp never produces a zero/negative window (clamped to now - window)', () => {
    const future = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    const w = contiguousWindow(now, 'daily', future);
    expect(new Date(w.since).getTime()).toBeLessThan(new Date(w.until).getTime());
    expect(w.since).toBe(new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString());
  });
});

describe('buildDigestSections', () => {
  const since = '2026-06-17T08:00:00.000Z';
  const until = '2026-06-18T08:00:00.000Z';

  it('batches new leads, tours, and deals into labeled sections', async () => {
    queueByTable = {
      Contact: [{ data: [{ id: 'c1', name: 'Jane Doe', createdAt: until }], error: null }],
      Tour: [
        {
          data: [
            { id: 't1', guestName: 'Bob', startsAt: '2026-06-20T15:00:00.000Z', propertyAddress: '123 Main St', createdAt: until },
          ],
          error: null,
        },
      ],
      Deal: [{ data: [{ id: 'd1', title: 'Maple St sale', value: 500000, createdAt: until }], error: null }],
    };

    const sections = await buildDigestSections('space_1', ALL_EVENTS, since, until);

    expect(sections).toHaveLength(3);
    const byLabel = Object.fromEntries(sections.map((s) => [s.label, s]));

    expect(byLabel['New leads'].items).toEqual(['Jane Doe']);
    expect(byLabel['New leads'].href).toBe('/leads');

    expect(byLabel['Tour bookings'].items[0]).toContain('Bob');
    expect(byLabel['Tour bookings'].items[0]).toContain('123 Main St');
    expect(byLabel['Tour bookings'].href).toBe('/calendar');

    expect(byLabel['New deals'].items[0]).toContain('Maple St sale');
    expect(byLabel['New deals'].items[0]).toContain('$500,000');
    expect(byLabel['New deals'].href).toBe('/deals');
  });

  it('omits sections for event types the member turned off (no query issued)', async () => {
    queueByTable = {
      Deal: [{ data: [{ id: 'd1', title: 'Only deal', value: null, createdAt: until }], error: null }],
    };
    const onlyDeals: EffectiveEventTypes = {
      newLeads: false,
      tourBookings: false,
      newDeals: true,
      followUps: true,
    };

    const sections = await buildDigestSections('space_1', onlyDeals, since, until);

    expect(sections).toHaveLength(1);
    expect(sections[0].label).toBe('New deals');
    // Deal title with no value renders without a currency suffix.
    expect(sections[0].items).toEqual(['Only deal']);
    // Only the Deal table was read — Contact/Tour were skipped entirely.
    expect(tableReads).toEqual(['Deal']);
  });

  it('drops empty sections (a type with no events this period)', async () => {
    queueByTable = {
      Contact: [{ data: [{ id: 'c1', name: 'Jane', createdAt: until }], error: null }],
      Tour: [{ data: [], error: null }], // no tours
      Deal: [{ data: [], error: null }], // no deals
    };

    const sections = await buildDigestSections('space_1', ALL_EVENTS, since, until);
    expect(sections.map((s) => s.label)).toEqual(['New leads']);
  });

  it('caps a long section and appends a "+N more" line', async () => {
    // 30 leads; cap is 25 (+1 fetched to detect overflow).
    const leads = Array.from({ length: 26 }, (_, i) => ({
      id: `c${i}`,
      name: `Lead ${i}`,
      createdAt: until,
    }));
    queueByTable = { Contact: [{ data: leads, error: null }] };
    const onlyLeads: EffectiveEventTypes = {
      newLeads: true,
      tourBookings: false,
      newDeals: false,
      followUps: false,
    };

    const sections = await buildDigestSections('space_1', onlyLeads, since, until);
    const items = sections[0].items;
    // 25 names + 1 overflow line.
    expect(items).toHaveLength(26);
    expect(items[25]).toBe('+1 more');
  });

  it('a failed table read contributes no section rather than throwing', async () => {
    queueByTable = {
      Contact: [{ data: null, error: { message: 'boom' } }],
      Tour: [{ data: [{ id: 't1', guestName: 'Bob', startsAt: until, propertyAddress: null, createdAt: until }], error: null }],
      Deal: [{ data: [], error: null }],
    };
    const sections = await buildDigestSections('space_1', ALL_EVENTS, since, until);
    // Contact errored → no "New leads"; Tour succeeded.
    expect(sections.map((s) => s.label)).toEqual(['Tour bookings']);
  });
});
