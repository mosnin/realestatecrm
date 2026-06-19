/**
 * Tests for the first-login welcome-tour gating helpers.
 *
 * These lock in the two guarantees that keep the tour ADDITIVE and
 * non-disruptive to the signup funnel:
 *   1. It is only ever shown to a fully-onboarded user (returning users who
 *      have dismissed it, and not-yet-onboarded users, are excluded).
 *   2. Storage failures fail CLOSED — we never nag a user we can't remember.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  WELCOME_TOUR_STORAGE_KEY,
  shouldShowWelcomeTour,
  markWelcomeTourComplete,
} from '@/components/onboarding/welcome-tour';

function memStorage(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    _map: map,
  };
}

describe('shouldShowWelcomeTour', () => {
  it('shows for a fresh, onboarded user with empty storage', () => {
    expect(shouldShowWelcomeTour(true, memStorage())).toBe(true);
  });

  it('never shows for a not-yet-onboarded user (funnel still owns them)', () => {
    expect(shouldShowWelcomeTour(false, memStorage())).toBe(false);
  });

  it('does not show again once completed/dismissed (returning user)', () => {
    const storage = memStorage({
      [WELCOME_TOUR_STORAGE_KEY]: new Date().toISOString(),
    });
    expect(shouldShowWelcomeTour(true, storage)).toBe(false);
  });

  it('fails closed when storage is null (SSR / private mode)', () => {
    expect(shouldShowWelcomeTour(true, null)).toBe(false);
  });

  it('fails closed when storage throws', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
    };
    expect(shouldShowWelcomeTour(true, throwing)).toBe(false);
  });
});

describe('markWelcomeTourComplete', () => {
  it('stamps the storage key with the provided time', () => {
    const storage = memStorage();
    markWelcomeTourComplete(storage, () => '2026-06-19T00:00:00.000Z');
    expect(storage._map.get(WELCOME_TOUR_STORAGE_KEY)).toBe(
      '2026-06-19T00:00:00.000Z',
    );
  });

  it('after marking complete, the tour no longer shows', () => {
    const storage = memStorage();
    markWelcomeTourComplete(storage);
    expect(shouldShowWelcomeTour(true, storage)).toBe(false);
  });

  it('is a no-op (no throw) when storage is null', () => {
    expect(() => markWelcomeTourComplete(null)).not.toThrow();
  });

  it('swallows storage write errors', () => {
    const throwing = {
      setItem: vi.fn(() => {
        throw new Error('quota');
      }),
    };
    expect(() => markWelcomeTourComplete(throwing)).not.toThrow();
    expect(throwing.setItem).toHaveBeenCalled();
  });
});
