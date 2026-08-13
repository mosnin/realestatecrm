import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workspace = readFileSync('components/chippi/chippi-workspace.tsx', 'utf8');

describe('Chippi Work execution controls', () => {
  it('derives and forwards the persisted execution mode', () => {
    expect(workspace).toContain('activeConversationExecutionMode');
    expect(workspace).toContain('workExecutionMode,');
    expect(workspace).toContain('executionMode: workExecutionMode');
  });

  it('keeps the Work execution menu available after conversation type locks', () => {
    expect(workspace).toContain("chatMode === 'work' && (");
    expect(workspace).toContain('<WorkExecutionModeMenu');
    expect(workspace).toContain('disabled={executionModeChangeDisabled}');
    expect(workspace).not.toMatch(
      /!conversationModeLocked[\s\S]{0,120}<WorkExecutionModeMenu/,
    );
  });

  it('optimistically persists policy and rolls back on failure', () => {
    expect(workspace).toContain(
      '`/api/ai/conversations/${encodeURIComponent(activeConversationId)}`',
    );
    expect(workspace).toContain('body: JSON.stringify({ executionMode: nextMode })');
    expect(workspace).toContain('executionMode: previousMode');
    expect(workspace).toContain("Couldn't change how Chippi works. Try again.");
  });

  it('renders real permission checkpoints in Chat, Review, and destructive Autonomous work', () => {
    expect(workspace).toContain('const pendingConfirmation = pendingApproval');
    expect(workspace).toContain('isTail && pendingConfirmation && !isStreaming');
    expect(workspace).toContain("workExecutionMode === 'review'");
  });

  it('does not infer Modal warmup state or timer copy', () => {
    expect(workspace).not.toContain('warmupPhraseFor');
    expect(workspace).not.toContain('isFirstWorkTurn');
    expect(workspace).not.toContain('warmupElapsedMs');
    expect(workspace).not.toContain('isWarmingUp');
    expect(workspace).not.toContain('Getting things ready…');
    expect(workspace).not.toContain('Warming up…');
    expect(workspace).toContain("fetch('/api/ai/warmup', { method: 'POST' })");
    expect(workspace).toContain('<ThinkingIndicator');
    expect(workspace).toContain('<ThinkingOrb');
  });
});
