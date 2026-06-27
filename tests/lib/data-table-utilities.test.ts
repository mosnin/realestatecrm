/**
 * DataTable utilities: parseNumericLike turns the messy numeric strings that
 * show up in tool result tables ($1,234.56 / 2.8T / 50% / (1234) / 1.5KB) into
 * real numbers so columns sort numerically instead of lexically; getRowIdentifier
 * + createDataTableRowKeys produce stable, collision-free React keys so rows don't
 * scramble on re-render. Pin the parser's format coverage and the key stability.
 */

import { describe, it, expect } from 'vitest';
import {
  parseNumericLike,
  getRowIdentifier,
  createDataTableRowKeys,
} from '@/components/tool-ui/data-table/utilities';

describe('parseNumericLike', () => {
  it('parses currency, percent, and accounting negatives', () => {
    expect(parseNumericLike('$1,234.56')).toBe(1234.56);
    expect(parseNumericLike('50%')).toBe(50);
    expect(parseNumericLike('(1234)')).toBe(-1234);
  });

  it('parses grouped thousands and European decimal style', () => {
    expect(parseNumericLike('1,234')).toBe(1234);
    expect(parseNumericLike('1.234,56')).toBe(1234.56); // European: . thousands, , decimal
  });

  it('parses compact notation (K/M/T) and byte suffixes', () => {
    expect(parseNumericLike('2.8T')).toBe(2.8e12);
    expect(parseNumericLike('1.5M')).toBe(1.5e6);
    expect(parseNumericLike('1.5KB')).toBe(1536); // binary KB = 1024
    expect(parseNumericLike('768B')).toBe(768); // small integer "B" -> bytes
  });

  it('returns null for unparseable / empty input', () => {
    expect(parseNumericLike('')).toBeNull();
    expect(parseNumericLike('   ')).toBeNull();
    expect(parseNumericLike('abc')).toBeNull();
  });
});

describe('getRowIdentifier', () => {
  it('prefers the identifierKey, then name/title/id; arrays join; null -> ""', () => {
    expect(getRowIdentifier({ name: 'Ada', id: 1 }, 'id')).toBe('1'); // explicit key wins
    expect(getRowIdentifier({ name: 'Ada', title: 'X', id: 1 })).toBe('Ada'); // name before title/id
    expect(getRowIdentifier({ title: 'Doc', id: 2 })).toBe('Doc');
    expect(getRowIdentifier({ tags: ['a', 'b'] }, 'tags')).toBe('a, b');
    expect(getRowIdentifier({ foo: 'bar' })).toBe(''); // no recognized identifier
  });
});

describe('createDataTableRowKeys', () => {
  it('uses identifier-based keys and keeps them collision-free even with duplicates', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'a', extra: 1 }, { id: 'a', extra: 1 }];
    const keys = createDataTableRowKeys(rows, 'id');
    expect(keys).toHaveLength(4);
    expect(new Set(keys).size).toBe(4); // all unique despite duplicate ids
    expect(keys[1]).toBe('id:b'); // the unique one stays clean
  });

  it('is deterministic — same rows produce the same keys', () => {
    const rows = [{ name: 'X' }, { name: 'Y' }];
    expect(createDataTableRowKeys(rows)).toEqual(createDataTableRowKeys(rows));
  });
});
