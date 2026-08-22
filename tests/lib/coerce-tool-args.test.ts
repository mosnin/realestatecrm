import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { coerceBooleanValue, coerceToolArguments } from '@/lib/ai-tools/coerce-tool-args';

describe('coerceBooleanValue', () => {
  it('accepts the loose scalars models emit for required booleans', () => {
    expect(coerceBooleanValue(true)).toBe(true);
    expect(coerceBooleanValue(false)).toBe(false);
    expect(coerceBooleanValue('false')).toBe(false);
    expect(coerceBooleanValue('True')).toBe(true);
    expect(coerceBooleanValue('no')).toBe(false);
    expect(coerceBooleanValue('YES')).toBe(true);
    expect(coerceBooleanValue('0')).toBe(false);
    expect(coerceBooleanValue('1')).toBe(true);
    expect(coerceBooleanValue(0)).toBe(false);
    expect(coerceBooleanValue(1)).toBe(true);
  });

  it('leaves unrelated values alone', () => {
    expect(coerceBooleanValue('maybe')).toBeUndefined();
    expect(coerceBooleanValue(2)).toBeUndefined();
    expect(coerceBooleanValue(null)).toBeUndefined();
  });
});

describe('coerceToolArguments', () => {
  const schema = z.object({
    includeLostWon: z.boolean().optional().default(false),
    query: z.string(),
    limit: z.number().optional(),
  });

  it('coerces only boolean fields so a string id of "1" stays a string', () => {
    expect(
      coerceToolArguments(
        { includeLostWon: 'false', query: '1', limit: 5 },
        schema,
      ),
    ).toEqual({ includeLostWon: false, query: '1', limit: 5 });
  });

  it('walks nested objects and arrays for boolean fields', () => {
    const nested = z.object({
      flags: z.array(z.object({ on: z.boolean() })),
    });
    expect(coerceToolArguments({ flags: [{ on: 'true' }] }, nested)).toEqual({
      flags: [{ on: true }],
    });
  });

  it('returns the input unchanged when no schema is provided', () => {
    const input = { includeLostWon: 'false', query: '1' };
    expect(coerceToolArguments(input)).toEqual(input);
  });
});
