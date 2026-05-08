import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '@/lib/ai-tools/system-prompt';
import type { ToolContext } from '@/lib/ai-tools/types';

function makeCtx(): ToolContext {
  return {
    userId: 'user_123',
    space: { id: 'space_abc', slug: 'jane-realty', name: 'Jane Realty', ownerId: 'u1' },
    signal: new AbortController().signal,
  };
}

describe('buildSystemPrompt', () => {
  it('bakes in the workspace name', () => {
    const prompt = buildSystemPrompt(makeCtx());
    expect(prompt).toContain('Jane Realty');
  });

  it('bakes in a deterministic date when `now` is provided', () => {
    const prompt = buildSystemPrompt(makeCtx(), { now: new Date('2026-04-22T12:00:00Z') });
    // Locale formatting varies; just check a recognisable slice.
    expect(prompt).toMatch(/2026/);
    expect(prompt).toMatch(/April/i);
  });

  it('tells the model to use tools instead of speculating', () => {
    const prompt = buildSystemPrompt(makeCtx());
    // Prompt was expanded to "Never invent CRM data … don't fabricate."
    expect(prompt).toMatch(/don't fabricate|do not speculate|never invent/i);
  });

  it('mentions that mutating tools prompt for approval', () => {
    const prompt = buildSystemPrompt(makeCtx());
    expect(prompt).toMatch(/approval/i);
  });

  it('pins the verb-shaped contract for connected-app vs native draft tools', () => {
    const prompt = buildSystemPrompt(makeCtx());
    // Snapshot the exact bullet so any future softening surfaces in CI.
    expect(prompt).toContain(
      `- Sending verbs ("send", "email", "schedule", "post") prefer the connected-app tool — it acts through the realtor's account. Drafting verbs ("draft", "compose", "write me") use the native draft tools. When the verb is ambiguous, draft.`,
    );
  });

  it('pins the reasoning-before-mutation contract so the realtor sees a why before tapping Approve', () => {
    const prompt = buildSystemPrompt(makeCtx());
    expect(prompt).toMatch(/BEFORE calling a mutating tool/);
    expect(prompt).toMatch(/WHO you're acting on and WHY/);
  });

  it('pins the subject-disambiguation guard — the agent must not pick when there are multiple candidates', () => {
    const prompt = buildSystemPrompt(makeCtx());
    expect(prompt).toMatch(/subject must be unambiguous/);
    expect(prompt).toMatch(/do NOT pick/);
    // The "approval covers the verb, not the subject" reasoning is the load-bearing
    // sentence — pin its presence so a future edit can't quietly soften the contract.
    expect(prompt).toMatch(/approval covers the verb, not the subject/i);
  });

  it('stays compact — enough for tone guidance, not a manifesto', () => {
    const prompt = buildSystemPrompt(makeCtx());
    // Upper bound updated when the prompt was expanded to cover multi-step
    // execution, planning mode, and subject-disambiguation guidance.
    expect(prompt.length).toBeLessThan(7000);
  });
});
