/**
 * Presentation decisions for the realtor-facing chat thread. Kept out of
 * the workspace component so the rules can be tested without rendering
 * the whole surface.
 */

export function shouldShowPlanCard(stepCount: number): boolean {
  return Number.isFinite(stepCount) && stepCount >= 3;
}

export function shouldShowFollowUpSuggestions(opts: {
  isTail: boolean;
  role: 'user' | 'assistant';
  turnActive: boolean;
  hasError: boolean;
  pendingApproval: boolean;
}): boolean {
  return (
    opts.isTail &&
    opts.role === 'assistant' &&
    !opts.turnActive &&
    !opts.hasError &&
    !opts.pendingApproval
  );
}

/** Work activity stays out of the live turn so ThinkingIndicator owns the line. */
export function shouldShowInlineWorkActivity(opts: {
  chatMode: 'chat' | 'work';
  isTail: boolean;
  turnActive: boolean;
  eventCount: number;
}): boolean {
  return (
    opts.chatMode === 'work' &&
    opts.isTail &&
    !opts.turnActive &&
    opts.eventCount > 0
  );
}

export function chatModeChipLabel(mode: 'chat' | 'work'): string {
  return mode === 'work' ? 'Work · can act' : 'Chat · answers';
}

export function emptyStateSubtitle(mode: 'chat' | 'work'): string {
  return mode === 'work'
    ? 'Tell me the outcome. I will go do it.'
    : 'Ask anything. I will look it up.';
}

export function workExecutionChipLabel(mode: 'review' | 'autonomous'): string {
  return mode === 'review' ? 'Review' : 'Can act';
}
