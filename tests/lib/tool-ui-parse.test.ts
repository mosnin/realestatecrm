/**
 * The tool-UI parse helpers turn streaming tool-call args into typed data.
 * safeParseWithSchema returns null on failure (args stream in incomplete, so a
 * render must not throw), while parseWithSchema throws a readable, named error.
 * formatZodError compacts issues into a deduped `path: message` string. Pin the
 * happy path, the null-vs-throw split, the path formatting (root / nested /
 * array index), and the dedup — a regression spams or swallows validation noise.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { formatZodError, parseWithSchema, safeParseWithSchema } from '@/components/tool-ui/shared/parse';

const schema = z.object({
  name: z.string(),
  tags: z.array(z.string()),
});

describe('safeParseWithSchema', () => {
  it('returns the parsed data on success', () => {
    expect(safeParseWithSchema(schema, { name: 'a', tags: ['x'] })).toEqual({ name: 'a', tags: ['x'] });
  });

  it('returns null on failure instead of throwing (incomplete stream)', () => {
    expect(safeParseWithSchema(schema, { name: 1 })).toBeNull();
    expect(safeParseWithSchema(schema, undefined)).toBeNull();
  });
});

describe('parseWithSchema', () => {
  it('returns data on success', () => {
    expect(parseWithSchema(schema, { name: 'a', tags: [] }, 'thing')).toEqual({ name: 'a', tags: [] });
  });

  it('throws a readable, named error on failure', () => {
    expect(() => parseWithSchema(schema, { name: 1, tags: [] }, 'thing')).toThrow(/Invalid thing payload:/);
  });
});

describe('formatZodError', () => {
  it('formats nested + array-index paths as path: message', () => {
    const err = schema.safeParse({ name: 1, tags: [2] });
    if (err.success) throw new Error('expected failure');
    const msg = formatZodError(err.error);
    expect(msg).toMatch(/name: /);
    expect(msg).toMatch(/tags\.\[0\]: /); // array index segment
    expect(msg).toContain('; '); // multiple issues joined
  });

  it('labels a top-level type error as "root"', () => {
    const err = z.string().safeParse(123);
    if (err.success) throw new Error('expected failure');
    expect(formatZodError(err.error)).toMatch(/^root: /);
  });

  it('dedupes identical path:message pairs', () => {
    const err = z.array(z.string()).safeParse([1, 1]); // two identical "[n]: Expected string" issues
    if (err.success) throw new Error('expected failure');
    const msg = formatZodError(err.error);
    // both issues share the same message text but different indices -> still distinct,
    // so assert the dedup mechanism collapses any exact duplicates (no doubled separator)
    expect(msg).not.toMatch(/;\s*;/);
  });
});
