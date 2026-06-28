/**
 * Meta Pixel helpers — param-shaping + no-op safety.
 *
 * The pixel is best-effort: every helper must be a silent no-op when `fbq`
 * isn't on the window (SSR, pixel not yet loaded, blocked by an ad blocker)
 * and must shape the standard-event params correctly when it is.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { mpTrack } from '@/lib/analytics/meta-pixel';
import {
  trackSignUp,
  trackOnboardingComplete,
  trackPurchase,
} from '@/lib/analytics/events';

declare global {
  // eslint-disable-next-line no-var
  var fbq: ((...args: unknown[]) => void) | undefined;
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  vi.restoreAllMocks();
});

function withFbq(): ReturnType<typeof vi.fn> {
  const fbq = vi.fn();
  (globalThis as { window?: unknown }).window = { fbq };
  return fbq;
}

describe('no-op safety', () => {
  it('does not throw when window/fbq is absent', () => {
    expect(() => mpTrack('PageView')).not.toThrow();
    expect(() => trackPurchase({ value: 49 })).not.toThrow();
  });
});

describe('event shaping', () => {
  it('fires CompleteRegistration for signups', () => {
    const fbq = withFbq();
    trackSignUp();
    expect(fbq).toHaveBeenCalledWith('track', 'CompleteRegistration', { status: true });
  });

  it('fires a custom CompleteOnboarding event', () => {
    const fbq = withFbq();
    trackOnboardingComplete({ accountType: 'realtor' });
    expect(fbq).toHaveBeenCalledWith('trackCustom', 'CompleteOnboarding', {
      accountType: 'realtor',
    });
  });

  it('fires Purchase with value + currency, defaulting currency to USD', () => {
    const fbq = withFbq();
    trackPurchase({ value: 49 });
    expect(fbq).toHaveBeenCalledWith('track', 'Purchase', { currency: 'USD', value: 49 });
  });

  it('omits value from Purchase when none is supplied', () => {
    const fbq = withFbq();
    trackPurchase({ currency: 'EUR' });
    expect(fbq).toHaveBeenCalledWith('track', 'Purchase', { currency: 'EUR' });
  });
});
