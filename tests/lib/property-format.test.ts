/**
 * Pure property display formatters. Untested before; these pin the happy path
 * and the robustness gaps (blank street, stray whitespace) that otherwise leak
 * ", City, ST" garbage into the UI.
 */

import { describe, it, expect } from 'vitest';
import { formatPropertyAddress, formatPropertyFacts } from '@/lib/properties';

describe('formatPropertyAddress', () => {
  it('joins street, unit, and city/state', () => {
    expect(
      formatPropertyAddress({ address: '412 Elm St', unitNumber: '4B', city: 'Austin', stateRegion: 'TX' }),
    ).toBe('412 Elm St #4B, Austin, TX');
  });

  it('omits an absent unit and partial city/state cleanly', () => {
    expect(
      formatPropertyAddress({ address: '412 Elm St', unitNumber: null, city: 'Austin', stateRegion: null }),
    ).toBe('412 Elm St, Austin');
    expect(
      formatPropertyAddress({ address: '412 Elm St', unitNumber: null, city: null, stateRegion: null }),
    ).toBe('412 Elm St');
  });

  it('falls back to city/state when the street is blank (no leading comma)', () => {
    expect(
      formatPropertyAddress({ address: '   ', unitNumber: null, city: 'Austin', stateRegion: 'TX' }),
    ).toBe('Austin, TX');
  });

  it('trims stray whitespace in every part', () => {
    expect(
      formatPropertyAddress({ address: '  412 Elm St ', unitNumber: ' 4B ', city: ' Austin ', stateRegion: ' TX ' }),
    ).toBe('412 Elm St #4B, Austin, TX');
  });
});

describe('formatPropertyFacts', () => {
  it('builds bed/bath/sqft chips, skipping nulls', () => {
    expect(formatPropertyFacts({ beds: 3, baths: 2, squareFeet: 1450 })).toBe('3bd · 2ba · 1,450 sqft');
    expect(formatPropertyFacts({ beds: 2, baths: null, squareFeet: null })).toBe('2bd');
    expect(formatPropertyFacts({ beds: null, baths: null, squareFeet: null })).toBe('');
  });
});
