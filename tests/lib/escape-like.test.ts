import { describe, it, expect } from 'vitest';
import { escapeLike } from '@/lib/escape-like';

describe('escapeLike', () => {
  it('leaves a normal email unchanged', () => {
    expect(escapeLike('buyer@example.com')).toBe('buyer@example.com');
  });

  it('escapes % _ and backslash so they cannot act as ILIKE wildcards', () => {
    expect(escapeLike('%@gmail.com')).toBe('\\%@gmail.com');
    expect(escapeLike('a_%@mail.com')).toBe('a\\_\\%@mail.com');
    expect(escapeLike('foo\\bar@x.com')).toBe('foo\\\\bar@x.com');
  });
});
