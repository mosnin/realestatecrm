/**
 * buildLeadsAnalyticsData is the largest analytics aggregation — it backs the
 * Leads page's score buckets, lead-state distribution, risk flags, qualification
 * breakdowns and buyer/rental split. Pin the date-INDEPENDENT slices exactly:
 * score buckets (incl. the Unscored catch-all), avgLeadScore over scored leads
 * only, the 3x affordability rule, screening flags (only fired ones), buyer
 * budget bucketing, and the lead-type split. avgScoreByMonth / leadsOverTime /
 * moveInUrgency lean on the clock and are out of scope here.
 */

import { describe, it, expect } from 'vitest';
import { buildLeadsAnalyticsData } from '@/lib/analytics-data';

type Raw = Parameters<typeof buildLeadsAnalyticsData>[0];

const lead = (over: Record<string, unknown>) => ({
  id: Math.random().toString(36).slice(2),
  tags: ['application-link'],
  leadType: 'rental',
  scoringStatus: null,
  scoreLabel: null,
  leadScore: null,
  scoreDetails: null,
  applicationData: null,
  createdAt: '2026-06-01T00:00:00Z',
  ...over,
});

const raw = (contacts: ReturnType<typeof lead>[]): Raw =>
  ({ contacts, deals: [], stages: [], tours: [] } as unknown as Raw);

describe('buildLeadsAnalyticsData', () => {
  it('buckets scores hot/warm/cold and sweeps the rest into Unscored', () => {
    const d = buildLeadsAnalyticsData(
      raw([
        lead({ scoringStatus: 'scored', scoreLabel: 'hot', leadScore: 90 }),
        lead({ scoringStatus: 'scored', scoreLabel: 'warm', leadScore: 60 }),
        lead({ scoringStatus: 'scored', scoreLabel: 'cold', leadScore: 20 }),
        lead({ scoringStatus: 'pending' }), // unscored
        lead({ scoringStatus: 'scored', scoreLabel: null }), // scored but no label -> Unscored
      ]),
    );
    expect(d.totalLeads).toBe(5);
    expect(d.leadScoreBuckets).toEqual([
      { label: 'Hot', count: 1 },
      { label: 'Warm', count: 1 },
      { label: 'Cold', count: 1 },
      { label: 'Unscored', count: 2 },
    ]);
  });

  it('averages only scored leads with a non-null score', () => {
    const d = buildLeadsAnalyticsData(
      raw([
        lead({ scoringStatus: 'scored', scoreLabel: 'hot', leadScore: 80 }),
        lead({ scoringStatus: 'scored', scoreLabel: 'warm', leadScore: 40 }),
        lead({ scoringStatus: 'pending', leadScore: 999 }), // not scored -> excluded
      ]),
    );
    expect(d.avgLeadScore).toBe(60); // (80 + 40) / 2
    expect(buildLeadsAnalyticsData(raw([lead({})])).avgLeadScore).toBeNull(); // none scored
  });

  it('maps + sorts lead-state distribution descending', () => {
    const d = buildLeadsAnalyticsData(
      raw([
        lead({ scoreDetails: { leadState: 'high_priority_qualified_renter' } }),
        lead({ scoreDetails: { leadState: 'likely_unqualified' } }),
        lead({ scoreDetails: { leadState: 'likely_unqualified' } }),
        lead({ scoreDetails: {} }), // no leadState -> skipped
      ]),
    );
    expect(d.leadStateDistribution).toEqual([
      { label: 'Likely unqualified', count: 2 },
      { label: 'High priority', count: 1 },
    ]);
  });

  it('applies the 3x affordability rule and only fired screening flags', () => {
    const d = buildLeadsAnalyticsData(
      raw([
        lead({ applicationData: { monthlyGrossIncome: 6000, monthlyRent: 2000, priorEvictions: true } }), // 6000 >= 6000 pass
        lead({ applicationData: { monthlyGrossIncome: 5000, monthlyRent: 2000 } }), // 5000 < 6000 fail
      ]),
    );
    expect(d.affordabilityBuckets).toEqual([
      { label: 'Passes 3x rule', count: 1 },
      { label: 'Below 3x rule', count: 1 },
    ]);
    // only the flags that actually fired appear
    expect(d.screeningFlags).toEqual([{ label: 'Prior evictions', count: 1 }]);
  });

  it('splits buyer vs rental and buckets buyer budgets', () => {
    const d = buildLeadsAnalyticsData(
      raw([
        lead({ leadType: 'buyer', applicationData: { buyerBudget: 350000 } }), // 200K-400K
        lead({ leadType: 'buyer', applicationData: { preApprovalAmount: '$1,200,000' } }), // Over $1M (string parsed)
        lead({ leadType: 'rental' }),
      ]),
    );
    expect(d.buyerLeadCount).toBe(2);
    expect(d.rentalLeadCount).toBe(1);
    expect(d.buyerBudgetDistribution).toEqual([
      { label: '$200K-$400K', count: 1 },
      { label: 'Over $1M', count: 1 },
    ]);
  });
});
