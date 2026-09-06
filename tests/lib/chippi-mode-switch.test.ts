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
  readStoredChatMode,
} from '@/components/chippi/chippi-workspace';

describe('New task defaults', () => {
  it('starts a fresh task with work capability without reclassifying old conversations', () => {
    expect(readStoredChatMode(null)).toBe('work');
    expect(readStoredChatMode('legacy-conversation')).toBe('chat');
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
