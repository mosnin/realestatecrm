/**
 * parseAnalysisResponse is the boundary between untrusted LLM JSON and stored
 * property data. It must hard-validate: enum fields fall to null when invalid,
 * numbers coerce to a non-negative number or null, features/photoUrls are
 * filtered+capped (photos must be http(s)), strings are trimmed/length-capped,
 * and a field source is recorded ONLY when there's a value AND a clean URL.
 * Pin the clamps; a regression lets garbage into the property table.
 */

import { describe, it, expect } from 'vitest';
import { parseAnalysisResponse } from '@/lib/property-analysis';

const parse = (raw: Record<string, unknown>) =>
  parseAnalysisResponse(raw as unknown as Parameters<typeof parseAnalysisResponse>[0]);

describe('parseAnalysisResponse', () => {
  it('keeps a valid property type / listing status and nulls invalid ones', () => {
    expect(parse({ propertyType: 'condo', listingStatus: 'pending' }).fields.propertyType).toBe('condo');
    expect(parse({ propertyType: 'mansion' }).fields.propertyType).toBeNull();
    expect(parse({ listingStatus: 'whatever' }).fields.listingStatus).toBeNull();
  });

  it('coerces numbers to non-negative or null', () => {
    const f = parse({ beds: 3, baths: -1, squareFeet: 'big', yearBuilt: 1990 }).fields;
    expect(f.beds).toBe(3);
    expect(f.baths).toBeNull(); // negative -> null
    expect(f.squareFeet).toBeNull(); // non-number -> null
    expect(f.yearBuilt).toBe(1990);
  });

  it('filters + caps features and rejects non-http photo URLs', () => {
    const f = parse({
      features: ['  Pool  ', '', 42, 'Garage'],
      photoUrls: ['https://x.com/a.jpg', 'ftp://nope', 'not-a-url', 'http://y.com/b.png'],
    }).fields;
    expect(f.features).toEqual(['Pool', 'Garage']); // trimmed, non-strings/empties dropped
    expect(f.photoUrls).toEqual(['https://x.com/a.jpg', 'http://y.com/b.png']); // http(s) only
  });

  it('caps oversized arrays (features 30, photos 20)', () => {
    const f = parse({
      features: Array.from({ length: 40 }, (_, i) => `f${i}`),
      photoUrls: Array.from({ length: 30 }, (_, i) => `https://x.com/${i}.jpg`),
    }).fields;
    expect(f.features).toHaveLength(30);
    expect(f.photoUrls).toHaveLength(20);
  });

  it('records a field source ONLY with both a value and a clean http(s) URL', () => {
    const ok = parse({ beds: 3, bedsSource: 'https://src.com/p' }).fieldSources;
    expect(ok.beds).toBe('https://src.com/p');

    // value present but source is not a URL -> no source recorded
    expect(parse({ beds: 3, bedsSource: 'see the listing' }).fieldSources.beds).toBeUndefined();
    // clean source but no value -> no source recorded
    expect(parse({ beds: null, bedsSource: 'https://src.com/p' }).fieldSources.beds).toBeUndefined();
  });

  it('coerces a non-string summary to empty and trims/caps a real one', () => {
    expect(parse({ summary: 12345 }).summary).toBe('');
    expect(parse({ summary: '  hi  ' }).summary).toBe('hi');
  });
});
