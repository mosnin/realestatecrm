/**
 * Onboarding status drives routing, so a wrong answer either re-onboards a
 * finished user or lets an un-onboarded one skip setup. `user.onboard` is the
 * SINGLE source of truth (the timestamp is audit-only), and the legacy-heal
 * backfill must fire on EXACTLY one condition: a user who has a workspace but
 * onboard is still falsy. Pin both pure helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  getOnboardingStatus,
  shouldBackfillOnboardFromSpace,
} from '@/lib/onboarding';

describe('getOnboardingStatus', () => {
  it('reports all-false for a null user', () => {
    expect(getOnboardingStatus(null)).toEqual({
      hasUser: false,
      hasSpace: false,
      isOnboarded: false,
    });
  });

  it('keys isOnboarded off user.onboard only (truthy -> true)', () => {
    expect(getOnboardingStatus({ onboard: true }).isOnboarded).toBe(true);
    expect(getOnboardingStatus({ onboard: false }).isOnboarded).toBe(false);
    expect(getOnboardingStatus({ onboard: null }).isOnboarded).toBe(false);
    expect(getOnboardingStatus({}).isOnboarded).toBe(false); // undefined
  });

  it('reports hasSpace from the presence of a space', () => {
    expect(getOnboardingStatus({ space: { id: 's1' } }).hasSpace).toBe(true);
    expect(getOnboardingStatus({ space: null }).hasSpace).toBe(false);
    expect(getOnboardingStatus({}).hasSpace).toBe(false);
  });
});

describe('shouldBackfillOnboardFromSpace', () => {
  it('fires ONLY when a user has a space but onboard is still falsy', () => {
    expect(shouldBackfillOnboardFromSpace({ id: 'u1', space: { id: 's1' }, onboard: false })).toBe(true);
    expect(shouldBackfillOnboardFromSpace({ id: 'u1', space: { id: 's1' }, onboard: null })).toBe(true);
  });

  it('does NOT fire when already onboarded', () => {
    expect(shouldBackfillOnboardFromSpace({ id: 'u1', space: { id: 's1' }, onboard: true })).toBe(false);
  });

  it('does NOT fire without a space (nothing to backfill from)', () => {
    expect(shouldBackfillOnboardFromSpace({ id: 'u1', space: null, onboard: false })).toBe(false);
    expect(shouldBackfillOnboardFromSpace({ id: 'u1', onboard: false })).toBe(false);
  });

  it('does NOT fire for a null user', () => {
    expect(shouldBackfillOnboardFromSpace(null)).toBe(false);
  });
});
