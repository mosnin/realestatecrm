/**
 * parseAreaResponse is the boundary between untrusted LLM JSON and a stored
 * area report. It must hard-validate: marketTrend falls to null unless it's one
 * of rising/steady/cooling; scores clamp to a rounded 0-100 or null; prices/days
 * coerce to a non-negative number or null; strings trim + length-cap (null when
 * blank); highlights filter non-strings/blanks, trim, cap each to 160 and the
 * list to 20; a field source is recorded ONLY with a value AND a clean http(s)
 * URL. Pin the clamps — a regression lets garbage into the area report.
 */

import { describe, it, expect } from 'vitest';
import { parseAreaResponse } from '@/lib/area-analysis';

const parse = (raw: Record<string, unknown>) =>
  parseAreaResponse(raw as unknown as Parameters<typeof parseAreaResponse>[0]);

describe('parseAreaResponse', () => {
  it('keeps a valid market trend and nulls anything off-list', () => {
    expect(parse({ marketTrend: 'rising' }).fields.marketTrend).toBe('rising');
    expect(parse({ marketTrend: 'booming' }).fields.marketTrend).toBeNull();
    expect(parse({ marketTrend: 42 }).fields.marketTrend).toBeNull();
  });

  it('clamps scores to a rounded 0-100 or null', () => {
    const f = parse({ walkScore: 87.6, transitScore: 150, bikeScore: -3 }).fields;
    expect(f.walkScore).toBe(88); // rounded
    expect(f.transitScore).toBeNull(); // out of range
    expect(f.bikeScore).toBeNull(); // negative
  });

  it('coerces prices/days to non-negative number or null', () => {
    const f = parse({ medianListPrice: 525000, medianDaysOnMarket: -1, medianSalePrice: 'lots' }).fields;
    expect(f.medianListPrice).toBe(525000);
    expect(f.medianDaysOnMarket).toBeNull(); // negative
    expect(f.medianSalePrice).toBeNull(); // non-number
  });

  it('trims + caps strings and nulls blank ones', () => {
    const f = parse({ crimeLevel: '  Low  ', schoolRating: '   ' }).fields;
    expect(f.crimeLevel).toBe('Low');
    expect(f.schoolRating).toBeNull(); // whitespace-only
  });

  it('filters + per-item-caps + list-caps highlights', () => {
    const f = parse({
      highlights: ['  Parks  ', '', 7, 'x'.repeat(200), ...Array.from({ length: 25 }, (_, i) => `h${i}`)],
    }).fields;
    expect(f.highlights[0]).toBe('Parks'); // trimmed
    expect(f.highlights).not.toContain(''); // blank dropped
    expect(f.highlights.every((h) => h.length <= 160)).toBe(true); // each capped
    expect(f.highlights).toHaveLength(20); // list capped
  });

  it('records a field source ONLY with both a value and a clean http(s) URL', () => {
    expect(parse({ walkScore: 80, walkScoreSource: 'https://walk.com' }).fieldSources.walkScore).toBe('https://walk.com');
    // value present but source not a URL -> none
    expect(parse({ walkScore: 80, walkScoreSource: 'see the page' }).fieldSources.walkScore).toBeUndefined();
    // clean source but no value -> none
    expect(parse({ walkScore: null, walkScoreSource: 'https://walk.com' }).fieldSources.walkScore).toBeUndefined();
  });

  it('trims/caps summary + verdict and coerces non-strings to empty', () => {
    expect(parse({ summary: '  hi  ', verdict: '  go  ' })).toMatchObject({ summary: 'hi', verdict: 'go' });
    expect(parse({ summary: 123, verdict: {} })).toMatchObject({ summary: '', verdict: '' });
  });
});
