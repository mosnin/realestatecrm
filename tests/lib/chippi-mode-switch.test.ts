/**
 * shouldShowModeSwitch — pure gate for whether the top-level Chat/Work
 * mode switch renders on a given chat surface variant.
 *
 * Work is only surfaced where the durable Work tools and lifecycle are
 * actually connected. Broker can add the switch when it reaches parity.
 */
import { describe, it, expect } from 'vitest';
import {
  isConversationModeLocked,
  shouldShowModeSwitch,
} from '@/components/chippi/chippi-workspace';

describe('shouldShowModeSwitch', () => {
  it('shows the mode switch for the realtor surface (unchanged behavior)', () => {
    expect(shouldShowModeSwitch('realtor')).toBe(true);
  });

  it('does not advertise Work on broker before its runtime reaches parity', () => {
    expect(shouldShowModeSwitch('broker')).toBe(false);
  });

  it('keeps the capability boundary explicit', () => {
    expect(shouldShowModeSwitch('realtor')).not.toBe(shouldShowModeSwitch('broker'));
  });
});

describe('conversation mode lock', () => {
  it('allows choosing a mode before the first user message', () => {
    expect(isConversationModeLocked([])).toBe(false);
    expect(isConversationModeLocked([{ role: 'assistant' }])).toBe(false);
  });

  it('locks the mode permanently for a transcript with a user message', () => {
    expect(
      isConversationModeLocked([
        { role: 'assistant' },
        { role: 'user' },
        { role: 'assistant' },
      ]),
    ).toBe(true);
  });
});
