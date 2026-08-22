import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { shouldShowFollowUpSuggestions } from '@/lib/chippi/chat-ux';
import { getSuggestionsForTurn } from '@/lib/ai-tools/suggestions';

describe('Chippi follow-up suggestion lifecycle', () => {
  it('offers two grounded chips after a settled assistant turn', () => {
    expect(shouldShowFollowUpSuggestions({
      isTail: true,
      role: 'assistant',
      turnActive: false,
      hasError: false,
      pendingApproval: false,
    })).toBe(true);
    expect(getSuggestionsForTurn([
      { type: 'tool_call', name: 'pipeline_summary', status: 'complete' } as never,
    ])).toEqual(['Show stuck deals', 'Find overdue follow-ups']);
  });

  it('keeps the real empty-state first-message surface intact', () => {
    const workspace = readFileSync('components/chippi/chippi-workspace.tsx', 'utf8');
    expect(workspace).toContain('const isEmpty = messages.length === 0');
    expect(workspace).toContain('key="empty-hero"');
    expect(workspace).toContain('<ChippiPromptBox');
    expect(workspace).toContain('<SuggestedActions');
  });

  it('hides chips while the turn is live, failed, or waiting on approval', () => {
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
      hasError: true,
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
});
