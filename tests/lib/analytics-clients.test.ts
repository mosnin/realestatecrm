/**
 * buildClientsAnalyticsData powers the Clients analytics page: the stage
 * breakdown, the qualifying -> tour -> applied funnel, and the lead-to-client
 * rate. The funnel's defining rule is that every downstream rate is measured
 * against the TOP of the funnel (qualifying count) so the bars never increase
 * and rates stay <= 100. Pin that, the stage counts, and the divide-by-zero
 * guards. contactsOverTime is structural only (last6Months reads the clock).
 */

import { describe, it, expect } from 'vitest';
import { buildClientsAnalyticsData } from '@/lib/analytics-data';

type Raw = Parameters<typeof buildClientsAnalyticsData>[0];

const contact = (id: string, type: string, lead = false) => ({
  id,
  type,
  tags: lead ? ['application-link'] : [],
  createdAt: '2026-06-01T00:00:00Z',
});

const raw = (contacts: ReturnType<typeof contact>[]): Raw =>
  ({ contacts, deals: [], stages: [], tours: [] } as unknown as Raw);

describe('buildClientsAnalyticsData', () => {
  const contacts = [
    contact('a', 'QUALIFICATION'),
    contact('b', 'QUALIFICATION'),
    contact('c', 'QUALIFICATION'),
    contact('d', 'QUALIFICATION'),
    contact('e', 'TOUR'),
    contact('f', 'TOUR'),
    contact('g', 'APPLICATION', true),
    contact('h', 'APPLICATION', true),
  ];

  it('counts contacts by stage', () => {
    const d = buildClientsAnalyticsData(raw(contacts));
    expect(d.totalContacts).toBe(8);
    expect(d.contactsByStage).toEqual([
      { label: 'Qualifying', count: 4 },
      { label: 'Tour', count: 2 },
      { label: 'Applied', count: 2 },
    ]);
  });

  it('measures every funnel rate against the qualifying top (bars never increase)', () => {
    const d = buildClientsAnalyticsData(raw(contacts));
    expect(d.contactFunnel).toEqual([
      { label: 'Qualifying', count: 4, rate: 100 },
      { label: 'Tour', count: 2, rate: 50 }, // 2/4
      { label: 'Applied', count: 2, rate: 50 }, // 2/4 — relative to top, NOT to tour
    ]);
  });

  it('caps funnel rates at 100 when a downstream stage exceeds qualifying', () => {
    const skewed = [contact('a', 'QUALIFICATION'), contact('b', 'TOUR'), contact('c', 'TOUR'), contact('d', 'TOUR')];
    const d = buildClientsAnalyticsData(raw(skewed));
    expect(d.contactFunnel[1].rate).toBe(100); // 3/1 -> capped
  });

  it('lead-to-client rate = applications / leads (capped, guarded)', () => {
    const d = buildClientsAnalyticsData(raw(contacts));
    expect(d.totalLeads).toBe(2); // tagged application-link
    expect(d.leadToClientRate).toBe(100); // 2 applications / 2 leads
  });

  it('all rates are 0 (no divide-by-zero) on an empty dataset', () => {
    const d = buildClientsAnalyticsData(raw([]));
    expect(d.contactFunnel.map((f) => f.rate)).toEqual([100, 0, 0]);
    expect(d.leadToClientRate).toBe(0);
    expect(d.contactsOverTime).toHaveLength(6);
  });
});
