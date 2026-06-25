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
    bikeScore: null, bikeScoreSource: null,
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

  it('clamps scores to 0-100 and drops out-of-range / negative numbers', () => {
    const { fields } = parseAreaResponse({
      ...rawBase(),
      walkScore: 142, // out of range → null
      transitScore: -5, // negative → null
      bikeScore: 64.7, // rounds to 65
      medianListPrice: -1, // negative → null
    });
    expect(fields.walkScore).toBeNull();
    expect(fields.transitScore).toBeNull();
    expect(fields.bikeScore).toBe(65);
    expect(fields.medianListPrice).toBeNull();
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
