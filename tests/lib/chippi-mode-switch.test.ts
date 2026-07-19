/**
 * shouldShowModeSwitch — pure gate for whether the composer's Chat/Agent
 * mode switch renders on a given chat surface variant.
 *
 * Track 16: the broker chat surface (`/api/ai/broker-task`) now honors the
 * `mode` field the same way the realtor surface (`/api/ai/task`) does, so
 * the switch must render identically for both — realtor behavior must stay
 * unchanged, and broker must no longer be silently excluded.
 */
import { describe, it, expect } from 'vitest';
import { shouldShowModeSwitch } from '@/components/chippi/chippi-workspace';

describe('shouldShowModeSwitch', () => {
  it('shows the mode switch for the realtor surface (unchanged behavior)', () => {
    expect(shouldShowModeSwitch('realtor')).toBe(true);
  });

  it('shows the mode switch for the broker surface (Track 16 fix)', () => {
    expect(shouldShowModeSwitch('broker')).toBe(true);
  });

  it('agrees for both variants — no surface is silently excluded', () => {
    expect(shouldShowModeSwitch('realtor')).toBe(shouldShowModeSwitch('broker'));
  });
});
