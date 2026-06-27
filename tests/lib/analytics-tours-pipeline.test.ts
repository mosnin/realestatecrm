/**
 * buildToursAnalyticsData and buildPipelineAnalyticsData are the pure
 * aggregations behind the Tours and Pipeline analytics pages. The headline
 * rates are easy to get subtly wrong, so pin the definitions exactly:
 *  - tour conversion = unique tours that sourced a deal / completed tours, capped 100
 *  - deal win rate = won / (won + lost) — decided deals only, NOT active/on_hold
 *  - pipeline value + avg deal size count ONLY active deals (value ?? 0)
 *  - status/priority rollups label + sort desc by count
 * leadsOverTime/*OverTime are asserted structurally (last6Months reads the clock).
 */

import { describe, it, expect } from 'vitest';
import { buildToursAnalyticsData, buildPipelineAnalyticsData } from '@/lib/analytics-data';

type Raw = Parameters<typeof buildToursAnalyticsData>[0];

const raw = (over: Partial<Raw> = {}): Raw =>
  ({
    contacts: [],
    deals: [],
    stages: [],
    tours: [],
    ...over,
  } as unknown as Raw);

describe('buildToursAnalyticsData', () => {
  const tours = [
    { id: 't1', status: 'completed', createdAt: '2026-06-01T00:00:00Z' },
    { id: 't2', status: 'completed', createdAt: '2026-06-02T00:00:00Z' },
    { id: 't3', status: 'cancelled', createdAt: '2026-06-03T00:00:00Z' },
    { id: 't4', status: 'no_show', createdAt: '2026-06-04T00:00:00Z' },
    { id: 't5', status: 'scheduled', createdAt: '2026-06-05T00:00:00Z' },
    { id: 't6', status: 'confirmed', createdAt: '2026-06-06T00:00:00Z' },
  ];

  it('counts each status bucket (scheduled folds in confirmed)', () => {
    const d = buildToursAnalyticsData(raw({ tours } as Partial<Raw>));
    expect(d.totalTours).toBe(6);
    expect(d.completedTours).toBe(2);
    expect(d.cancelledTours).toBe(1);
    expect(d.noShowTours).toBe(1);
    expect(d.scheduledTours).toBe(2); // scheduled + confirmed
  });

  it('converts on UNIQUE source tours and caps the rate at 100', () => {
    const deals = [
      { id: 'd1', sourceTourId: 't1', status: 'active', value: 1, stageId: 's', priority: 'high', createdAt: '2026-06-01T00:00:00Z' },
      { id: 'd2', sourceTourId: 't1', status: 'won', value: 1, stageId: 's', priority: 'high', createdAt: '2026-06-01T00:00:00Z' }, // same tour
      { id: 'd3', sourceTourId: null, status: 'active', value: 1, stageId: 's', priority: 'low', createdAt: '2026-06-01T00:00:00Z' },
    ];
    const d = buildToursAnalyticsData(raw({ tours, deals } as Partial<Raw>));
    expect(d.toursConvertedToDeals).toBe(1); // t1 counted once, null ignored
    expect(d.tourConversionRate).toBe(50); // 1 / 2 completed
  });

  it('rate is 0 with no completed tours (no divide-by-zero)', () => {
    const d = buildToursAnalyticsData(raw({ tours: [{ id: 'x', status: 'scheduled', createdAt: '2026-06-01T00:00:00Z' }] } as Partial<Raw>));
    expect(d.tourConversionRate).toBe(0);
  });

  it('labels + sorts toursByStatus descending by count', () => {
    const d = buildToursAnalyticsData(raw({ tours } as Partial<Raw>));
    expect(d.toursByStatus[0]).toEqual({ label: 'Completed', count: 2 });
    expect(d.toursByStatus.map((s) => s.label)).toContain('No-show');
    expect(d.toursOverTime).toHaveLength(6);
  });
});

describe('buildPipelineAnalyticsData', () => {
  const deals = [
    { id: 'd1', status: 'active', value: 100, stageId: 's1', priority: 'high', createdAt: '2026-06-01T00:00:00Z' },
    { id: 'd2', status: 'active', value: null, stageId: 's1', priority: 'high', createdAt: '2026-06-02T00:00:00Z' },
    { id: 'd3', status: 'won', value: 999, stageId: 's2', priority: 'low', createdAt: '2026-06-03T00:00:00Z' },
    { id: 'd4', status: 'lost', value: 50, stageId: 's2', priority: 'low', createdAt: '2026-06-04T00:00:00Z' },
    { id: 'd5', status: 'won', value: 10, stageId: 's2', priority: 'medium', createdAt: '2026-06-05T00:00:00Z' },
  ];
  const stages = [
    { id: 's1', name: 'New', color: '#111' },
    { id: 's2', name: 'Closing', color: '#222' },
  ];

  it('win rate counts only decided deals (won / won+lost)', () => {
    const d = buildPipelineAnalyticsData(raw({ deals, stages } as Partial<Raw>));
    expect(d.wonDeals).toBe(2);
    expect(d.lostDeals).toBe(1);
    expect(d.dealWinRate).toBe(67); // 2 / 3 -> 66.6 -> 67, active deals excluded from denominator
  });

  it('pipeline value + avg size count only active deals with value ?? 0', () => {
    const d = buildPipelineAnalyticsData(raw({ deals, stages } as Partial<Raw>));
    expect(d.activeDeals).toBe(2);
    expect(d.totalPipelineValue).toBe(100); // 100 + (null -> 0)
    expect(d.avgDealSize).toBe(50); // 100 / 2
    expect(d.totalDeals).toBe(5);
  });

  it('win rate is 0 with no decided deals', () => {
    const onlyActive = [{ id: 'a', status: 'active', value: 5, stageId: 's1', priority: 'high', createdAt: '2026-06-01T00:00:00Z' }];
    expect(buildPipelineAnalyticsData(raw({ deals: onlyActive, stages } as Partial<Raw>)).dealWinRate).toBe(0);
  });

  it('rolls up dealsByStage and dealsByPriority (labeled, sorted desc)', () => {
    const d = buildPipelineAnalyticsData(raw({ deals, stages } as Partial<Raw>));
    expect(d.dealsByStage).toEqual([
      { name: 'New', count: 2, value: 100, color: '#111' },
      { name: 'Closing', count: 3, value: 1059, color: '#222' }, // 999 + 50 + 10
    ]);
    expect(d.dealsByPriority[0]).toEqual({ label: 'High', count: 2 }); // capitalized, most common first
    expect(d.dealsOverTime).toHaveLength(6);
  });
});
