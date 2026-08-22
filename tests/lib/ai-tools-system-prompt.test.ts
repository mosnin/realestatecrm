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
    // Wording was sharpened — "Never invent CRM data" + "don't fabricate"
    // carry the same contract. Match either phrasing so future small edits
    // don't break the test, but a wholesale removal will.
    expect(prompt).toMatch(/never invent|don'?t fabricate|do not speculate/i);
    expect(prompt).toMatch(/never tell the realtor you have no tools/i);
  });

  it('does not send the model to find_integration_tool when none are attached', () => {
    const prompt = buildSystemPrompt(makeCtx());
    expect(prompt).toMatch(/do not call `find_integration_tool`/i);
    expect(prompt).not.toMatch(/call `find_integration_tool` with a short description/i);
  });

  it('points at find_integration_tool only when connected apps are live this turn', () => {
    const prompt = buildSystemPrompt(makeCtx(), {
      integrations: { liveToolkits: ['gmail'], unavailableToolkits: [] },
    });
    expect(prompt).toContain('call `find_integration_tool` with a short description');
    expect(prompt).not.toMatch(/do not call `find_integration_tool`/i);
  });

  it('mentions that mutating tools prompt for approval', () => {
    const prompt = buildSystemPrompt(makeCtx());
    expect(prompt).toMatch(/approval/i);
  });

  it('routes Work browser goals through the bounded browser tools', () => {
    const ctx = { ...makeCtx(), workMode: true };
    const prompt = buildSystemPrompt(ctx);
    expect(prompt).toContain('browser_task');
    expect(prompt).toContain('control_browser');
    expect(prompt).toContain('paired extension');
    expect(prompt).toMatch(/never claim a browser action ran unless its tool result confirms it/i);
    expect(prompt).toContain('Fully autonomous is selected');
    expect(prompt).toContain('without a separate confirmation pause');
  });

  it('honors Review checkpoints for sensitive browser actions', () => {
    const prompt = buildSystemPrompt({
      ...makeCtx(),
      workMode: true,
      workExecutionMode: 'review',
    });
    expect(prompt).toContain(
      'honor the platform checkpoint before sensitive or externally consequential actions',
    );
    expect(prompt).not.toContain(
      'continue through the exact authorized closed action set without a separate confirmation pause',
    );
  });

  it('makes the persisted Work execution policy explicit while Chat keeps review', () => {
    const workPrompt = buildSystemPrompt({
      ...makeCtx(),
      workMode: true,
      workExecutionMode: 'autonomous',
    });
    const reviewedWorkPrompt = buildSystemPrompt({
      ...makeCtx(),
      workMode: true,
      workExecutionMode: 'review',
    });
    const chatPrompt = buildSystemPrompt(makeCtx());
    expect(workPrompt).toContain("Execute the user's exact requested non-destructive mutations directly");
    expect(workPrompt).toContain('destructive or high-blast-radius actions');
    expect(workPrompt).not.toContain('Mutating tools (send_email, create_deal, etc.) require realtor approval');
    expect(reviewedWorkPrompt).toContain('Review is selected');
    expect(reviewedWorkPrompt).toContain('let the platform pause before mutations');
    expect(reviewedWorkPrompt).not.toContain('Fully autonomous is selected');
    expect(chatPrompt).toContain('Mutating tools (send_email, create_deal, etc.) require realtor approval');
  });

  it('requires a real plan before genuinely multi-step Work execution', () => {
    const prompt = buildSystemPrompt({ ...makeCtx(), workMode: true });
    expect(prompt).toContain('call `create_plan` exactly once BEFORE the first execution tool');
    expect(prompt).toContain('Do not create a plan for a quick lookup or one-step action');
    expect(prompt).toContain('If that plan has five or more steps, call `delegate_task`');
  });

  it('tells the model to wait for a specialist briefing instead of walking away', () => {
    const prompt = buildSystemPrompt(makeCtx());
    expect(prompt).toMatch(/That tool WAITS and returns a briefing/i);
    expect(prompt).toMatch(/Do not redo the specialist's tool work/i);
    expect(prompt).not.toMatch(/tell the realtor you have kicked it off/i);
  });

  it('pins one full-book read and refuses to invent a PDF artifact', () => {
    const prompt = buildSystemPrompt({ ...makeCtx(), workMode: true });
    expect(prompt).toContain('call `list_contacts` once');
    expect(prompt).toContain('Do not split the same read into hot, warm, cold, and unscored calls');
    expect(prompt).toContain('cannot guarantee a PDF artifact');
    expect(prompt).toContain('PDF export is not available');
    expect(prompt).toContain('persisted session or file receipt');
  });

  it('injects the exact versioned conversation goal without silently replacing it', () => {
    const goal = 'Close five more qualified buyer deals before September 30.';
    const prompt = buildSystemPrompt({
      ...makeCtx(),
      workMode: true,
      conversationGoal: goal,
      conversationGoalVersion: 4,
    });
    expect(prompt).toContain('# Active Work goal');
    expect(prompt).toContain('Version: 4');
    expect(prompt).toContain(`Goal (verbatim):\n${goal}`);
    expect(prompt).toContain('never silently replace, rewrite, or clear the goal');
  });

  it('pins the verb-shaped contract for connected-app vs native draft tools', () => {
    const prompt = buildSystemPrompt(makeCtx());
    // Snapshot the exact bullet so any future softening surfaces in CI.
    expect(prompt).toContain('Sending verbs ("send", "email", "schedule", "post") prefer the connected-app tool');
    expect(prompt).toContain('When the verb is ambiguous, draft');
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
    expect(prompt).toMatch(/Never guess which record the user meant/i);
  });

  it('tells the model not to advertise internal tool failures to the realtor', () => {
    const prompt = buildSystemPrompt(makeCtx());
    expect(prompt).toMatch(/Never mention tool names, JSON, schemas/i);
    expect(prompt).toMatch(/Do not loop on the same failed call/i);
    expect(prompt).not.toMatch(/On tool error, surface briefly/i);
  });

  it('stays compact — enough for tone guidance, not a manifesto', () => {
    const prompt = buildSystemPrompt(makeCtx());
    // Sanity upper bound. The cap was raised to 8000 chars when the prompt
    // grew to include personalization, integrations contracts, and the
    // reasoning-before-mutation guard. If a future edit pushes past 8000
    // we should revisit whether each line still earns its keep.
    expect(prompt.length).toBeLessThan(8000);
  });
});
