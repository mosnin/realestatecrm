import { describe, expect, it, vi } from 'vitest';
import {
  shouldShowFollowUpSuggestions,
  shouldShowInlineWorkActivity,
  shouldShowPlanCard,
  steerQueuedInstruction,
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

  it('names the Work execution posture', () => {
    expect(workExecutionChipLabel('review')).toBe('Review');
    expect(workExecutionChipLabel('autonomous')).toBe('Can act');
  });

  it('keeps a queued instruction when Steer fails', async () => {
    const remove = vi.fn(async () => true);
    const kept = await steerQueuedInstruction({
      steer: async () => false,
      remove,
    });
    expect(kept).toBe(false);
    expect(remove).not.toHaveBeenCalled();
  });

  it('removes the queued instruction only after Steer is accepted', async () => {
    const order: string[] = [];
    const steered = await steerQueuedInstruction({
      steer: async () => {
        order.push('steer');
        return true;
      },
      remove: async () => {
        order.push('remove');
        return true;
      },
    });
    expect(steered).toBe(true);
    expect(order).toEqual(['steer', 'remove']);
  });
});
