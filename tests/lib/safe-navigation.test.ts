/**
 * resolveSafeNavigationHref is the fallback picker behind tool-result links: it
 * walks candidate hrefs and returns the FIRST that survives sanitizeHref —
 * skipping nulls and anything unsafe (javascript:, protocol-relative, control
 * chars) — so a dangerous primary URL can't shadow a safe fallback. It must
 * never return an unsafe href just because it came first. openSafeNavigationHref
 * is the noopener/noreferrer guard around window.open; pin its no-window/no-href
 * fail-closed. A regression here is an open-redirect / tabnabbing vector.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  resolveSafeNavigationHref,
  openSafeNavigationHref,
} from '@/components/tool-ui/shared/media/safe-navigation';

describe('resolveSafeNavigationHref', () => {
  it('returns the first candidate that sanitizes safe, skipping nullish ones', () => {
    expect(resolveSafeNavigationHref(undefined, null, '/listings/42')).toBe('/listings/42');
  });

  it('skips an unsafe leading candidate and falls through to a safe one', () => {
    // javascript: is rejected by sanitizeHref → must not shadow the safe fallback
    expect(resolveSafeNavigationHref('javascript:alert(1)', '/safe')).toBe('/safe');
    // protocol-relative // is rejected too
    expect(resolveSafeNavigationHref('//evil.com', '#anchor')).toBe('#anchor');
  });

  it('returns undefined when no candidate is safe (or none given)', () => {
    expect(resolveSafeNavigationHref('javascript:void(0)', 'data:text/html,x', null)).toBeUndefined();
    expect(resolveSafeNavigationHref()).toBeUndefined();
  });
});

describe('openSafeNavigationHref', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fails closed when href is missing or window is unavailable', () => {
    expect(openSafeNavigationHref(undefined)).toBe(false); // no href
    expect(openSafeNavigationHref('/x')).toBe(false); // node env: window undefined
  });

  it('opens with noopener,noreferrer in a new tab when a window exists', () => {
    const open = vi.fn();
    vi.stubGlobal('window', { open });
    expect(openSafeNavigationHref('/listings/42')).toBe(true);
    expect(open).toHaveBeenCalledWith('/listings/42', '_blank', 'noopener,noreferrer');
  });
});
