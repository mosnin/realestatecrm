/**
 * brandOrange — the wrapper every allowlisted brand-orange call site routes
 * through so the no-stray-orange lint rule can see it. Its whole job is to be
 * runtime-equivalent to `cn(...classes)` while the context arg exists purely
 * for the lint allowlist. Pin that contract: the context never leaks into the
 * output, classes merge like cn, and falsy entries drop. If someone
 * "optimizes" this to return the context or stops merging, these fail.
 */

import { describe, it, expect } from 'vitest';
import { brandOrange, BRAND_ORANGE_CONTEXTS } from '@/lib/colors';
import { cn } from '@/lib/utils';

describe('brandOrange', () => {
  it('is runtime-equivalent to cn — the context arg never leaks into output', () => {
    expect(brandOrange('CHIPPI_AVATAR', 'text-orange-500', 'bg-orange-50/40')).toBe(
      cn('text-orange-500', 'bg-orange-50/40'),
    );
    // The context string itself must not appear in the className.
    expect(brandOrange('LOGO', 'text-orange-500')).not.toContain('LOGO');
  });

  it('merges conflicting tailwind classes (last wins, via cn/twMerge)', () => {
    expect(brandOrange('ACTIVITY_BAR', 'p-2', 'p-4')).toBe('p-4');
  });

  it('drops falsy class entries like clsx does', () => {
    expect(brandOrange('AGENT_BADGE', 'text-orange-500', '', 'bg-orange-50')).toBe(
      'text-orange-500 bg-orange-50',
    );
  });

  it('returns an empty string when given no classes', () => {
    expect(brandOrange('LEAD_WARM')).toBe('');
  });

  it('produces identical output regardless of which context is named', () => {
    const outputs = BRAND_ORANGE_CONTEXTS.map((ctx) => brandOrange(ctx, 'text-orange-500'));
    expect(new Set(outputs).size).toBe(1);
    expect(outputs[0]).toBe('text-orange-500');
  });
});
