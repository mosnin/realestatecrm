/**
 * buildOverviewData is the pure aggregation behind the analytics Overview page.
 * It feeds the headline KPI cards and the pipeline-by-stage bars, so the counts
 * have to be exact: leads are contacts tagged 'application-link', deals/value
 * count only status==='active' (with value ?? 0), and each stage bar sums the
 * deals routed to it. Pin those date-INDEPENDENT aggregations precisely; assert
 * leadsOverTime only structurally because last6Months() depends on the wall clock.
 */

import { describe, it, expect } from 'vitest';
import { buildOverviewData } from '@/lib/analytics-data';

type Raw = Parameters<typeof buildOverviewData>[0];

const raw = (over: Partial<Raw> = {}): Raw =>
  ({
    contacts: [
      { id: 'c1', tags: ['application-link'], createdAt: '2026-06-01T00:00:00Z' },
      { id: 'c2', tags: ['application-link', 'vip'], createdAt: '2026-06-02T00:00:00Z' },
      { id: 'c3', tags: ['client'], createdAt: '2026-06-03T00:00:00Z' },
      { id: 'c4', tags: [], createdAt: '2026-06-04T00:00:00Z' },
    ],
    deals: [
      { id: 'd1', value: 100, stageId: 's1', status: 'active' },
      { id: 'd2', value: 200, stageId: 's1', status: 'active' },
      { id: 'd3', value: null, stageId: 's2', status: 'active' },
      { id: 'd4', value: 999, stageId: 's2', status: 'won' },
    ],
    stages: [
      { id: 's1', name: 'New', color: '#111' },
      { id: 's2', name: 'Touring', color: '#222' },
      { id: 's3', name: 'Empty', color: '#333' },
    ],
    tours: [],
    ...over,
  } as unknown as Raw);

describe('buildOverviewData', () => {
  it('counts leads as contacts tagged application-link', () => {
    const d = buildOverviewData(raw());
    expect(d.totalLeads).toBe(2);
    expect(d.totalContacts).toBe(4);
  });

  it('counts and sums only active deals (value ?? 0)', () => {
    const d = buildOverviewData(raw());
    expect(d.totalDeals).toBe(3); // d1, d2, d3 — not the won d4
    expect(d.totalPipelineValue).toBe(300); // 100 + 200 + (null -> 0)
  });

  it('builds one stage bar per stage with per-stage count, value, and passthrough', () => {
    const { dealsByStage } = buildOverviewData(raw());
    expect(dealsByStage).toEqual([
      { name: 'New', count: 2, value: 300, color: '#111' },
      { name: 'Touring', count: 2, value: 999, color: '#222' }, // won deal still counts toward its stage
      { name: 'Empty', count: 0, value: 0, color: '#333' },
    ]);
  });

  it('returns 6 month buckets shaped {month,count} regardless of the clock', () => {
    const { leadsOverTime } = buildOverviewData(raw());
    expect(leadsOverTime).toHaveLength(6);
    for (const b of leadsOverTime) {
      expect(typeof b.month).toBe('string');
      expect(typeof b.count).toBe('number');
    }
  });

  it('handles an empty dataset without throwing', () => {
    const d = buildOverviewData(raw({ contacts: [], deals: [], stages: [] }));
    expect(d).toMatchObject({ totalLeads: 0, totalContacts: 0, totalDeals: 0, totalPipelineValue: 0, dealsByStage: [] });
    expect(d.leadsOverTime).toHaveLength(6);
  });
});
