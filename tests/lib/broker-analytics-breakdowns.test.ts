/**
 * Unit tests for the additive broker-analytics aggregations:
 *   - buildLeadSourceBreakdown — leads grouped by source + per-source conversion.
 *   - buildWinLossByReason     — closed deals grouped by close-reason taxonomy.
 *
 * Pure functions, so no Supabase mock — assert directly on hand-built input
 * (mirrors tests/lib/broker-funnel.test.ts).
 */
import { describe, it, expect } from 'vitest';
import {
  buildLeadSourceBreakdown,
  buildWinLossByReason,
} from '@/lib/broker-analytics-breakdowns';

describe('buildLeadSourceBreakdown', () => {
  it('returns an empty list when there are no contacts', () => {
    expect(buildLeadSourceBreakdown([])).toEqual([]);
  });

  it('groups leads by source and sorts by volume descending', () => {
    const rows = buildLeadSourceBreakdown([
      { source: 'web_form', type: 'QUALIFICATION' },
      { source: 'web_form', type: 'APPLICATION' },
      { source: 'import', type: 'TOUR' },
      { source: 'web_form', type: 'TOUR' },
    ]);
    expect(rows.map((r) => r.key)).toEqual(['web_form', 'import']);
    expect(rows[0]).toMatchObject({ key: 'web_form', label: 'Web form', leads: 3 });
    expect(rows[1]).toMatchObject({ key: 'import', label: 'Import', leads: 1 });
  });

  it('computes per-source conversion rate as % reaching APPLICATION', () => {
    const rows = buildLeadSourceBreakdown([
      { source: 'referral', type: 'APPLICATION' },
      { source: 'referral', type: 'APPLICATION' },
      { source: 'referral', type: 'QUALIFICATION' },
      { source: 'referral', type: 'TOUR' },
    ]);
    expect(rows[0]).toMatchObject({ leads: 4, converted: 2, conversionRate: 50 });
  });

  it('buckets null / blank source as Unknown', () => {
    const rows = buildLeadSourceBreakdown([
      { source: null, type: 'QUALIFICATION' },
      { source: '', type: 'APPLICATION' },
      { source: '   ', type: 'TOUR' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: 'unknown', label: 'Unknown', leads: 3, converted: 1 });
  });

  it('labels an unrecognized source value as Unknown but keeps it grouped by raw key', () => {
    const rows = buildLeadSourceBreakdown([
      { source: 'totally_made_up', type: 'APPLICATION' },
    ]);
    expect(rows[0].key).toBe('totally_made_up');
    expect(rows[0].label).toBe('Unknown');
    expect(rows[0].conversionRate).toBe(100);
  });

  it('reports 0% conversion when a source has leads but none reached APPLICATION', () => {
    const rows = buildLeadSourceBreakdown([
      { source: 'manual', type: 'QUALIFICATION' },
      { source: 'manual', type: 'TOUR' },
    ]);
    expect(rows[0]).toMatchObject({ leads: 2, converted: 0, conversionRate: 0 });
  });
});

describe('buildWinLossByReason', () => {
  it('returns empty buckets and zero totals when there are no deals', () => {
    expect(buildWinLossByReason([])).toEqual({ won: [], lost: [], totalWon: 0, totalLost: 0 });
  });

  it('ignores active and on_hold deals', () => {
    const out = buildWinLossByReason([
      { status: 'active', closeReason: null },
      { status: 'on_hold', closeReason: null },
    ]);
    expect(out.totalWon).toBe(0);
    expect(out.totalLost).toBe(0);
    expect(out.won).toEqual([]);
    expect(out.lost).toEqual([]);
  });

  it('groups won deals by close reason with human labels', () => {
    const out = buildWinLossByReason([
      { status: 'won', closeReason: 'price' },
      { status: 'won', closeReason: 'price' },
      { status: 'won', closeReason: 'relationship' },
    ]);
    expect(out.totalWon).toBe(3);
    expect(out.won).toEqual([
      { key: 'price', label: 'Price', count: 2 },
      { key: 'relationship', label: 'Relationship', count: 1 },
    ]);
  });

  it('groups lost deals separately and labels the lost taxonomy', () => {
    const out = buildWinLossByReason([
      { status: 'lost', closeReason: 'went_with_other_agent' },
      { status: 'lost', closeReason: 'financing_fell_through' },
      { status: 'lost', closeReason: 'went_with_other_agent' },
      { status: 'won', closeReason: 'speed' },
    ]);
    expect(out.totalLost).toBe(3);
    expect(out.lost[0]).toEqual({ key: 'went_with_other_agent', label: 'Went with another agent', count: 2 });
    expect(out.totalWon).toBe(1);
    expect(out.won[0]).toEqual({ key: 'speed', label: 'Speed', count: 1 });
  });

  it('buckets won/lost deals with no recorded reason as Unspecified', () => {
    const out = buildWinLossByReason([
      { status: 'won', closeReason: null },
      { status: 'won', closeReason: '' },
      { status: 'lost', closeReason: null },
    ]);
    expect(out.won).toEqual([{ key: 'unspecified', label: 'Unspecified', count: 2 }]);
    expect(out.lost).toEqual([{ key: 'unspecified', label: 'Unspecified', count: 1 }]);
  });
});
