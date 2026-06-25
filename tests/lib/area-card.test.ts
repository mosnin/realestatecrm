/**
 * Area card model tests — the flattening that feeds all three Area IQ surfaces.
 * Pins the chip-overflow guard (sentence-length values must not become chips)
 * and that sections carry their source URLs.
 */

import { describe, it, expect } from 'vitest';
import { toAreaCardData, summariseArea } from '@/lib/area-card';
import type { AreaReport, AreaFields } from '@/lib/types';

function fields(over: Partial<AreaFields> = {}): AreaFields {
  return {
    schoolsSummary: null,
    schoolRating: null,
    safetySummary: null,
    crimeLevel: null,
    walkScore: null,
    transitScore: null,
    bikeScore: null,
    walkabilitySummary: null,
    marketSummary: null,
    medianListPrice: null,
    medianSalePrice: null,
    marketTrend: null,
    medianDaysOnMarket: null,
    marketAsOf: null,
    amenitiesSummary: null,
    highlights: [],
    lifestyleSummary: null,
    commuteSummary: null,
    ...over,
  };
}

function report(over: Partial<AreaFields> = {}): AreaReport {
  return {
    id: 'ar_1',
    spaceId: 'sp1',
    areaKey: 'zip:78704',
    label: 'Austin, TX 78704',
    city: 'Austin',
    stateRegion: 'TX',
    postalCode: '78704',
    generatedAt: '2026-06-25T00:00:00Z',
    expiresAt: null,
    intelligence: {
      fields: fields(over),
      fieldSources: { safetySummary: 'https://niche.com/x', schoolsSummary: 'https://greatschools.org/y' },
      verdict: 'A solid all-rounder.',
      summary: 'A solid area.',
      sources: [{ url: 'https://niche.com/x', title: 'Niche' }],
      stats: { searchResults: 4, scraped: 3 },
      generatedAt: '2026-06-25T00:00:00Z',
    },
  };
}

describe('toAreaCardData — metric chips', () => {
  it('keeps short scannable values as chips', () => {
    const card = toAreaCardData(report({ schoolRating: '8/10', walkScore: 87, medianListPrice: 625000 }), false);
    const labels = card.metrics.map((m) => m.label);
    expect(labels).toContain('Schools');
    expect(labels).toContain('Walk Score');
    expect(labels).toContain('Median list');
    expect(card.metrics.find((m) => m.label === 'Median list')?.value).toBe('$625,000');
  });

  it('drops a sentence-length value from the chip row (covered by its section)', () => {
    const card = toAreaCardData(
      report({ crimeLevel: 'Lower than the national average across most categories' }),
      false,
    );
    expect(card.metrics.find((m) => m.label === 'Safety')).toBeUndefined();
  });

  it('keeps a short crime level as a Safety chip', () => {
    const card = toAreaCardData(report({ crimeLevel: 'Low' }), false);
    expect(card.metrics.find((m) => m.label === 'Safety')?.value).toBe('Low');
  });
});

describe('toAreaCardData — sections + passthrough', () => {
  it('builds sections from the summaries and attaches their source', () => {
    const card = toAreaCardData(report({ safetySummary: 'Quiet, low crime.', schoolsSummary: 'Strong schools.' }), true);
    const safety = card.sections.find((s) => s.title === 'Safety');
    expect(safety?.body).toBe('Quiet, low crime.');
    expect(safety?.source).toBe('https://niche.com/x');
    expect(card.cached).toBe(true);
    expect(card.generatedAt).toBe('2026-06-25T00:00:00Z');
  });

  it('carries the neutral verdict and the market as-of date', () => {
    const card = toAreaCardData(report({ marketAsOf: 'Apr 2026' }), false);
    expect(card.verdict).toBe('A solid all-rounder.');
    expect(card.marketAsOf).toBe('Apr 2026');
  });

  it('swaps in a buyer-tailored verdict override without touching the report', () => {
    const r = report();
    const card = toAreaCardData(r, false, 'Great for the Chens: top schools, but over budget.');
    expect(card.verdict).toBe('Great for the Chens: top schools, but over budget.');
    // The shared report is untouched.
    expect(r.intelligence.verdict).toBe('A solid all-rounder.');
  });
});

describe('summariseArea', () => {
  it('leads with the verdict when present', () => {
    const s = summariseArea(report({ schoolRating: '8/10' }));
    expect(s).toContain('Austin, TX 78704');
    expect(s).toContain('A solid all-rounder.');
  });

  it('uses a buyer-tailored verdict override when given', () => {
    const s = summariseArea(report(), 'Perfect for the Chens.');
    expect(s).toContain('Perfect for the Chens.');
  });

  it('falls back to headline facts when there is no verdict', () => {
    const r = report({ schoolRating: '8/10', walkScore: 90, marketTrend: 'rising' });
    r.intelligence.verdict = '';
    const s = summariseArea(r);
    expect(s).toMatch(/schools 8\/10/);
    expect(s).toMatch(/Walk Score 90/);
    expect(s).toMatch(/Rising market/);
  });
});
