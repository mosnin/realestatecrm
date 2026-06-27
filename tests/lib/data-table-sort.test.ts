/**
 * sortData is the type-aware column sorter behind tool-result tables. It picks a
 * comparison by value type — numbers numerically, Dates chronologically, booleans
 * false<true, arrays by length, numeric-looking strings numerically, ISO date
 * strings chronologically — and pushes nulls to the end regardless of direction.
 * It must NOT mutate the input. Pin each comparison path + the null handling.
 */

import { describe, it, expect } from 'vitest';
import { sortData } from '@/components/tool-ui/data-table/utilities';

const ids = <T extends { id: unknown }>(rows: T[]) => rows.map((r) => r.id);

describe('sortData', () => {
  it('sorts numbers ascending and descending', () => {
    const rows = [{ id: 'a', n: 3 }, { id: 'b', n: 1 }, { id: 'c', n: 2 }];
    expect(ids(sortData(rows, 'n', 'asc'))).toEqual(['b', 'c', 'a']);
    expect(ids(sortData(rows, 'n', 'desc'))).toEqual(['a', 'c', 'b']);
  });

  it('sorts numeric-looking strings numerically (not lexically)', () => {
    const rows = [{ id: 'a', v: '10' }, { id: 'b', v: '2' }, { id: 'c', v: '1' }];
    // lexical would put '10' before '2'; numeric must not
    expect(ids(sortData(rows, 'v', 'asc'))).toEqual(['c', 'b', 'a']);
  });

  it('sorts ISO date strings chronologically', () => {
    const rows = [{ id: 'a', d: '2026-06-27' }, { id: 'b', d: '2026-01-01' }, { id: 'c', d: '2026-03-15' }];
    expect(ids(sortData(rows, 'd', 'asc'))).toEqual(['b', 'c', 'a']);
  });

  it('sorts booleans false < true and arrays by length', () => {
    expect(ids(sortData([{ id: 'a', b: true }, { id: 'b', b: false }], 'b', 'asc'))).toEqual(['b', 'a']);
    expect(ids(sortData([{ id: 'a', t: [1, 2] }, { id: 'b', t: [1] }], 't', 'asc'))).toEqual(['b', 'a']);
  });

  it('pushes nulls to the end regardless of direction', () => {
    const rows = [{ id: 'a', n: 2 }, { id: 'b', n: null }, { id: 'c', n: 1 }];
    expect(ids(sortData(rows, 'n', 'asc')).slice(-1)).toEqual(['b']);
    expect(ids(sortData(rows, 'n', 'desc')).slice(-1)).toEqual(['b']);
  });

  it('does not mutate the input array', () => {
    const rows = [{ id: 'a', n: 2 }, { id: 'b', n: 1 }];
    const before = [...rows];
    sortData(rows, 'n', 'asc');
    expect(rows).toEqual(before);
  });
});
