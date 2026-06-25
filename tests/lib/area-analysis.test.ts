/**
 * Area-analysis pure-logic tests: the response parser (clamping, enum
 * validation, source attribution) and the strict-JSON schema's integrity.
 *
 * The network steps (Tavily/Firecrawl/LLM) are NOT exercised here — these pin
 * the deterministic guardrails the orchestrator depends on.
 */

import { describe, it, expect, vi } from 'vitest';

// lib/area-analysis (and its research-client imports) are server-only modules;
// `server-only` is stubbed globally via vitest.config.mts.
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  parseAreaResponse,
  computeConfidence,
  AREA_ANALYSIS_JSON_SCHEMA,
  type RawAreaResponse,
} from '@/lib/area-analysis';

function rawBase(): RawAreaResponse {
  return {
    schoolsSummary: null, schoolsSummarySource: null,
    schoolRating: null, schoolRatingSource: null,
    safetySummary: null, safetySummarySource: null,
    crimeLevel: null, crimeLevelSource: null,
    walkScore: null, walkScoreSource: null,
    transitScore: null, transitScoreSource: null,
    walkabilitySummary: null, walkabilitySummarySource: null,
    marketSummary: null, marketSummarySource: null,
    medianListPrice: null, medianListPriceSource: null,
    medianSalePrice: null, medianSalePriceSource: null,
    marketTrend: null, marketTrendSource: null,
    medianDaysOnMarket: null, medianDaysOnMarketSource: null,
    marketAsOf: null, marketAsOfSource: null,
    amenitiesSummary: null, amenitiesSummarySource: null,
    highlights: [],
    lifestyleSummary: null, lifestyleSummarySource: null,
    commuteSummary: null, commuteSummarySource: null,
    verdict: '',
    summary: '',
  };
}

describe('parseAreaResponse', () => {
  it('keeps populated fields and records their sources', () => {
    const raw: RawAreaResponse = {
      ...rawBase(),
      schoolRating: '8/10',
      schoolRatingSource: 'https://greatschools.org/x',
      walkScore: 87,
      walkScoreSource: 'https://walkscore.com/x',
      marketTrend: 'rising',
      marketTrendSource: 'https://redfin.com/x',
      marketAsOf: 'Apr 2026',
      marketAsOfSource: 'https://redfin.com/x',
      verdict: 'Strong for young professionals: very walkable, but prices are climbing.',
      summary: 'A walkable, well-rated area.',
    };
    const { fields, fieldSources, summary, verdict } = parseAreaResponse(raw);
    expect(fields.schoolRating).toBe('8/10');
    expect(fields.walkScore).toBe(87);
    expect(fields.marketTrend).toBe('rising');
    expect(fields.marketAsOf).toBe('Apr 2026');
    expect(fieldSources.schoolRating).toBe('https://greatschools.org/x');
    expect(fieldSources.walkScore).toBe('https://walkscore.com/x');
    expect(fieldSources.marketAsOf).toBe('https://redfin.com/x');
    expect(summary).toBe('A walkable, well-rated area.');
    expect(verdict).toBe('Strong for young professionals: very walkable, but prices are climbing.');
  });

  it('clamps scores to 0-100 and drops out-of-range numbers', () => {
    const { fields } = parseAreaResponse({
      ...rawBase(),
      walkScore: 142, // out of range → null
      transitScore: -5, // negative → null
      medianListPrice: -1, // negative → null
    });
    expect(fields.walkScore).toBeNull();
    expect(fields.transitScore).toBeNull();
    expect(fields.medianListPrice).toBeNull();
  });

  it('rejects implausible market figures (physics-first guard)', () => {
    const tooSmall = parseAreaResponse({ ...rawBase(), medianListPrice: 40 }).fields;
    const tooBig = parseAreaResponse({ ...rawBase(), medianSalePrice: 4_000_000_000 }).fields;
    const absurdDom = parseAreaResponse({ ...rawBase(), medianDaysOnMarket: 5000 }).fields;
    expect(tooSmall.medianListPrice).toBeNull();
    expect(tooBig.medianSalePrice).toBeNull();
    expect(absurdDom.medianDaysOnMarket).toBeNull();

    const ok = parseAreaResponse({
      ...rawBase(),
      medianListPrice: 625_000,
      medianSalePrice: 610_000,
      medianDaysOnMarket: 28,
    }).fields;
    expect(ok.medianListPrice).toBe(625_000);
    expect(ok.medianSalePrice).toBe(610_000);
    expect(ok.medianDaysOnMarket).toBe(28);
  });

  it('rejects an invalid marketTrend', () => {
    expect(parseAreaResponse({ ...rawBase(), marketTrend: 'exploding' }).fields.marketTrend).toBeNull();
    expect(parseAreaResponse({ ...rawBase(), marketTrend: 'cooling' }).fields.marketTrend).toBe('cooling');
  });

  it('does not record a source when its field is null or the URL is junk', () => {
    const { fieldSources } = parseAreaResponse({
      ...rawBase(),
      schoolRating: null,
      schoolRatingSource: 'https://x.com', // field null → no source
      walkScore: 50,
      walkScoreSource: 'not-a-url', // junk → no source
    });
    expect(fieldSources.schoolRating).toBeUndefined();
    expect(fieldSources.walkScore).toBeUndefined();
  });

  it('caps highlights at 20 and trims junk', () => {
    const many = Array.from({ length: 40 }, (_, i) => `Place ${i}`);
    const { fields } = parseAreaResponse({ ...rawBase(), highlights: [...many, '', '  '] as string[] });
    expect(fields.highlights).toHaveLength(20);
    expect(fields.highlights.every((h) => h.trim().length > 0)).toBe(true);
  });
});

describe('computeConfidence', () => {
  const rich = parseAreaResponse({
    ...rawBase(),
    schoolRating: '8/10',
    crimeLevel: 'Low',
    walkScore: 80,
    marketSummary: 'Hot market.',
    lifestyleSummary: 'Lively.',
  }).fields;

  it('is high when several pages were scraped and key dimensions are populated', () => {
    expect(computeConfidence(rich, { scraped: 4, searchResults: 5 })).toBe('high');
  });

  it('is low when nothing was scraped', () => {
    expect(computeConfidence(rich, { scraped: 0, searchResults: 3 })).toBe('low');
  });

  it('is low when barely any field came back', () => {
    const thin = parseAreaResponse({ ...rawBase(), walkScore: 50 }).fields;
    expect(computeConfidence(thin, { scraped: 2, searchResults: 3 })).toBe('low');
  });

  it('is medium in between', () => {
    expect(computeConfidence(rich, { scraped: 1, searchResults: 3 })).toBe('medium');
  });
});

describe('AREA_ANALYSIS_JSON_SCHEMA integrity', () => {
  it('is strict with additionalProperties:false', () => {
    expect(AREA_ANALYSIS_JSON_SCHEMA.strict).toBe(true);
    expect(AREA_ANALYSIS_JSON_SCHEMA.schema.additionalProperties).toBe(false);
  });

  it('lists every property in required (OpenAI strict mode demands it)', () => {
    const props = Object.keys(AREA_ANALYSIS_JSON_SCHEMA.schema.properties);
    const required = AREA_ANALYSIS_JSON_SCHEMA.schema.required;
    expect([...required].sort()).toEqual([...props].sort());
  });
});
