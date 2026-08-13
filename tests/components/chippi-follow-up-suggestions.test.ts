import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workspace = readFileSync('components/chippi/chippi-workspace.tsx', 'utf8');

describe('Chippi follow-up suggestion lifecycle', () => {
  it('never mounts suggestion chips in an active conversation', () => {
    expect(workspace).not.toContain('@/components/ai/blocks/suggested-actions');
    expect(workspace).not.toContain('@/lib/ai-tools/suggestions');
    expect(workspace).not.toContain('<SuggestedActions');
    expect(workspace).not.toContain('getSuggestionsForTurn');
  });

  it('keeps the real empty-state first-message surface intact', () => {
    expect(workspace).toContain('const isEmpty = messages.length === 0');
    expect(workspace).toContain('key="empty-hero"');
    expect(workspace).toContain('<ChippiPromptBox');
  });
});
