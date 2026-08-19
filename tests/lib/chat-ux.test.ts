import { describe, expect, it } from 'vitest';
import {
  chatModeChipLabel,
  emptyStateSubtitle,
  shouldShowFollowUpSuggestions,
  shouldShowInlineWorkActivity,
  shouldShowPlanCard,
  workExecutionChipLabel,
} from '@/lib/chippi/chat-ux';

describe('chat UX presentation rules', () => {
  it('hides one- and two-step plans so lookups do not grow a plan card', () => {
    expect(shouldShowPlanCard(0)).toBe(false);
    expect(shouldShowPlanCard(2)).toBe(false);
    expect(shouldShowPlanCard(3)).toBe(true);
    expect(shouldShowPlanCard(7)).toBe(true);
  });

  it('keeps work activity off the live turn so the thinking line owns progress', () => {
    expect(shouldShowInlineWorkActivity({
      chatMode: 'work',
      isTail: true,
      turnActive: true,
      eventCount: 4,
    })).toBe(false);
    expect(shouldShowInlineWorkActivity({
      chatMode: 'work',
      isTail: true,
      turnActive: false,
      eventCount: 4,
    })).toBe(true);
    expect(shouldShowInlineWorkActivity({
      chatMode: 'chat',
      isTail: true,
      turnActive: false,
      eventCount: 4,
    })).toBe(false);
  });

  it('shows follow-up chips only after a settled assistant turn', () => {
    expect(shouldShowFollowUpSuggestions({
      isTail: true,
      role: 'assistant',
      turnActive: false,
      hasError: false,
      pendingApproval: false,
    })).toBe(true);
    expect(shouldShowFollowUpSuggestions({
      isTail: true,
      role: 'assistant',
      turnActive: true,
      hasError: false,
      pendingApproval: false,
    })).toBe(false);
    expect(shouldShowFollowUpSuggestions({
      isTail: true,
      role: 'assistant',
      turnActive: false,
      hasError: false,
      pendingApproval: true,
    })).toBe(false);
  });

  it('names Chat vs Work without a tooltip', () => {
    expect(chatModeChipLabel('chat')).toBe('Chat · answers');
    expect(chatModeChipLabel('work')).toBe('Work · can act');
    expect(emptyStateSubtitle('chat')).toMatch(/look it up/i);
    expect(emptyStateSubtitle('work')).toMatch(/go do it/i);
    expect(workExecutionChipLabel('review')).toBe('Review');
    expect(workExecutionChipLabel('autonomous')).toBe('Can act');
  });
});
