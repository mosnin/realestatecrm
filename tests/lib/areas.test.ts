/**
 * Area normalization tests — the join key that lets Property IQ reuse one
 * report across every property in an area. Two properties in the same ZIP (or
 * the same city+state) MUST resolve to the same areaKey, regardless of casing
 * or whitespace; anything too vague to identify an area returns null.
 */

import { describe, it, expect } from 'vitest';
import { normalizeArea, parseAreaQuery } from '@/lib/areas';

describe('normalizeArea', () => {
  it('prefers ZIP as the key', () => {
    const a = normalizeArea({ city: 'Austin', stateRegion: 'TX', postalCode: '78704' });
    expect(a?.areaKey).toBe('zip:78704');
    expect(a?.label).toBe('Austin, TX 78704');
    expect(a?.postalCode).toBe('78704');
  });

  it('extracts a 5-digit ZIP from a ZIP+4', () => {
    expect(normalizeArea({ postalCode: '78704-1234' })?.areaKey).toBe('zip:78704');
  });

  it('falls back to a city+state slug when there is no ZIP', () => {
    const a = normalizeArea({ city: 'Austin', stateRegion: 'TX' });
    expect(a?.areaKey).toBe('city:austin-tx');
    expect(a?.label).toBe('Austin, TX');
  });

  it('is case- and whitespace-insensitive for the key', () => {
    const a = normalizeArea({ city: '  austin ', stateRegion: 'tx ' });
    const b = normalizeArea({ city: 'AUSTIN', stateRegion: 'Tx' });
    expect(a?.areaKey).toBe('city:austin-tx');
    expect(a?.areaKey).toBe(b?.areaKey);
  });

  it('returns null when neither a ZIP nor city+state is present', () => {
    expect(normalizeArea({ city: 'Austin' })).toBeNull(); // no state
    expect(normalizeArea({ stateRegion: 'TX' })).toBeNull(); // no city
    expect(normalizeArea({})).toBeNull();
  });
});

describe('parseAreaQuery', () => {
  it('parses a bare ZIP', () => {
    expect(parseAreaQuery('78704')?.areaKey).toBe('zip:78704');
  });

  it('parses "City, ST"', () => {
    const a = parseAreaQuery('Austin, TX');
    expect(a?.areaKey).toBe('city:austin-tx');
  });

  it('parses "City ST ZIP" and keys on the ZIP', () => {
    const a = parseAreaQuery('Austin TX 78704');
    expect(a?.areaKey).toBe('zip:78704');
    expect(a?.city).toBe('Austin');
    expect(a?.stateRegion).toBe('TX');
  });

  it('drops the street from a full address but keeps city/state', () => {
    const a = parseAreaQuery('412 Elm St, Austin, TX');
    expect(a?.areaKey).toBe('city:austin-tx');
    expect(a?.city).toBe('Austin');
  });

  it('a full address with a ZIP keys on the ZIP', () => {
    const a = parseAreaQuery('412 Elm St, Austin, TX 78704');
    expect(a?.areaKey).toBe('zip:78704');
  });

  it('returns null on empty / unidentifiable input', () => {
    expect(parseAreaQuery('')).toBeNull();
    expect(parseAreaQuery('   ')).toBeNull();
  });
});
