/**
 * formatAnswerValue turns a raw stored answer into the human string shown in
 * the submission view AND written to exported CSVs. The load-bearing bit is
 * mapping a stored option VALUE back to its human LABEL — a regression here
 * dumps raw enum values into a realtor's exported leads. Pin each question
 * type, the label mapping, and the empty/invalid fallbacks.
 */

import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { formatAnswerValue } from '@/lib/form-versioning';
import type { FormQuestion } from '@/lib/types';

const q = (over: Partial<FormQuestion>): FormQuestion =>
  ({ id: 'q1', label: 'Q', type: 'text', ...over } as FormQuestion);

const originalTimezone = process.env.TZ;

beforeAll(() => {
  // Date-only answers are calendar values, not instants. Run in a negative
  // offset zone so an accidental UTC-midnight parse would display June 30.
  process.env.TZ = 'America/Los_Angeles';
});

afterAll(() => {
  process.env.TZ = originalTimezone;
});

describe('formatAnswerValue', () => {
  it('renders empty for null / undefined / empty string', () => {
    expect(formatAnswerValue(null, q({}))).toBe('');
    expect(formatAnswerValue(undefined, q({}))).toBe('');
    expect(formatAnswerValue('', q({}))).toBe('');
  });

  it('checkbox -> Yes/No (accepts boolean or "true")', () => {
    const cb = q({ type: 'checkbox' });
    expect(formatAnswerValue(true, cb)).toBe('Yes');
    expect(formatAnswerValue('true', cb)).toBe('Yes');
    expect(formatAnswerValue(false, cb)).toBe('No');
    expect(formatAnswerValue('whatever', cb)).toBe('No');
  });

  it('select/radio map a stored value to its option label (raw fallback)', () => {
    const sel = q({
      type: 'select',
      options: [
        { value: 'r', label: 'Renting' },
        { value: 'o', label: 'Own' },
      ],
    } as Partial<FormQuestion>);
    expect(formatAnswerValue('r', sel)).toBe('Renting');
    expect(formatAnswerValue('unknown', sel)).toBe('unknown'); // graceful raw fallback
  });

  it('multi_select maps each value to its label and joins with commas', () => {
    const ms = q({
      type: 'multi_select',
      options: [
        { value: 'a', label: 'Parking' },
        { value: 'b', label: 'Pets' },
      ],
    } as Partial<FormQuestion>);
    expect(formatAnswerValue(['a', 'b'], ms)).toBe('Parking, Pets');
    expect(formatAnswerValue('a', ms)).toBe('Parking'); // single value coerced to array
  });

  it('number / text coerce to string', () => {
    expect(formatAnswerValue(42, q({ type: 'number' }))).toBe('42');
    expect(formatAnswerValue('hello', q({ type: 'text' }))).toBe('hello');
  });

  it('date formats nicely and falls back to the raw string when unparseable', () => {
    expect(formatAnswerValue('2026-07-01', q({ type: 'date' }))).toBe('Jul 1, 2026');
    expect(formatAnswerValue('not-a-date', q({ type: 'date' }))).toBe('not-a-date');
  });
});
