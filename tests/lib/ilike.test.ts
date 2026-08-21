import { describe, expect, it } from 'vitest';
import { escapeIlikePattern } from '@/lib/ilike';

describe('escapeIlikePattern', () => {
  it('leaves a plain email unchanged', () => {
    expect(escapeIlikePattern('jane.doe@example.com')).toBe('jane.doe@example.com');
  });

  it('escapes underscore so it cannot match any single character', () => {
    expect(escapeIlikePattern('jane_doe@example.com')).toBe('jane\\_doe@example.com');
  });

  it('escapes percent so it cannot match any run of characters', () => {
    expect(escapeIlikePattern('%@gmail.com')).toBe('\\%@gmail.com');
  });

  it('escapes backslash first so a literal \\% stays literal', () => {
    expect(escapeIlikePattern('a\\b_c%d')).toBe('a\\\\b\\_c\\%d');
  });
});
