/**
 * normalizeDealRows / normalizePropertyRows flatten the two shapes the deal and
 * property tools emit — a single `{ deal }`/`{ property }` or a shortlist
 * `{ deals: [] }`/`{ properties: [] }` — into the one flat array tool-ui dispatch
 * renders. The array form wins when present; a lone object becomes a one-item
 * array; anything malformed degrades to []. Pin those branches so neither a
 * missing card (dropped single) nor a render crash (non-array fed to map) slips in.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeDealRows,
  normalizePropertyRows,
} from '@/components/ai/blocks/tool-results/normalize';

describe('normalizeDealRows', () => {
  it('returns the array form when `deals` is present', () => {
    expect(normalizeDealRows({ deals: [{ id: 'd1' }, { id: 'd2' }] })).toEqual([
      { id: 'd1' },
      { id: 'd2' },
    ]);
  });

  it('wraps a single `deal` object into a one-item array', () => {
    expect(normalizeDealRows({ match: 0.9, deal: { id: 'd1' } })).toEqual([{ id: 'd1' }]);
  });

  it('degrades to [] for nullish / non-object / shapeless input', () => {
    expect(normalizeDealRows(null)).toEqual([]);
    expect(normalizeDealRows('nope')).toEqual([]);
    expect(normalizeDealRows({})).toEqual([]);
    expect(normalizeDealRows({ deal: 'not-an-object' })).toEqual([]);
  });
});

describe('normalizePropertyRows', () => {
  it('returns the array form when `properties` is present', () => {
    expect(normalizePropertyRows({ properties: [{ id: 'p1' }] })).toEqual([{ id: 'p1' }]);
  });

  it('wraps a single `property` object into a one-item array', () => {
    expect(normalizePropertyRows({ match: 1, property: { id: 'p1' } })).toEqual([{ id: 'p1' }]);
  });

  it('degrades to [] for nullish / non-object / shapeless input', () => {
    expect(normalizePropertyRows(undefined)).toEqual([]);
    expect(normalizePropertyRows(42)).toEqual([]);
    expect(normalizePropertyRows({})).toEqual([]);
  });
});
