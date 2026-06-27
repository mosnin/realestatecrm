/**
 * The option-list selection helpers turn a tool's declared selection (a string
 * or array) into the Set the UI tracks, and prune any selected id that isn't a
 * real option. single mode keeps at most one; multi mode honors maxSelections.
 * Pin those — a leaked extra selection in single mode or a stale id that no
 * longer maps to an option corrupts what the realtor confirms back to the tool.
 */

import { describe, it, expect } from 'vitest';
import { parseSelectionToIdSet, normalizeSelectionForOptions } from '@/components/tool-ui/option-list/selection';

describe('parseSelectionToIdSet — single mode', () => {
  it('keeps at most one id (string or first of an array)', () => {
    expect(parseSelectionToIdSet('a', 'single')).toEqual(new Set(['a']));
    expect(parseSelectionToIdSet(['a', 'b'], 'single')).toEqual(new Set(['a'])); // first only
    expect(parseSelectionToIdSet(undefined, 'single')).toEqual(new Set());
    expect(parseSelectionToIdSet([], 'single')).toEqual(new Set());
  });
});

describe('parseSelectionToIdSet — multi mode', () => {
  it('collects all ids from a string or array', () => {
    expect(parseSelectionToIdSet('a', 'multi')).toEqual(new Set(['a']));
    expect(parseSelectionToIdSet(['a', 'b', 'c'], 'multi')).toEqual(new Set(['a', 'b', 'c']));
    expect(parseSelectionToIdSet(undefined, 'multi')).toEqual(new Set());
  });

  it('caps at maxSelections', () => {
    expect(parseSelectionToIdSet(['a', 'b', 'c', 'd'], 'multi', 2)).toEqual(new Set(['a', 'b']));
  });
});

describe('normalizeSelectionForOptions', () => {
  it('drops selected ids that are not real options', () => {
    const out = normalizeSelectionForOptions(new Set(['a', 'ghost', 'b']), new Set(['a', 'b', 'c']));
    expect(out).toEqual(new Set(['a', 'b'])); // ghost pruned
  });

  it('returns empty when nothing matches', () => {
    expect(normalizeSelectionForOptions(new Set(['x']), new Set(['a']))).toEqual(new Set());
    expect(normalizeSelectionForOptions(new Set(), new Set(['a']))).toEqual(new Set());
  });
});
