import { describe, it, expect } from 'vitest';
import { dmKeyFor } from '@/lib/messaging';

describe('dmKeyFor', () => {
  it('is order-independent (both participants derive the same key)', () => {
    expect(dmKeyFor(['a', 'b'])).toBe(dmKeyFor(['b', 'a']));
  });

  it('sorts deterministically', () => {
    expect(dmKeyFor(['zeta', 'alpha'])).toBe('alpha:zeta');
  });

  it('dedupes repeated ids (self-key collapses to one)', () => {
    expect(dmKeyFor(['a', 'a'])).toBe('a');
  });

  it('produces distinct keys for distinct pairs', () => {
    expect(dmKeyFor(['a', 'b'])).not.toBe(dmKeyFor(['a', 'c']));
  });
});
