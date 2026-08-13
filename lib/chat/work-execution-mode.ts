/**
 * Server-authoritative execution policy for a Work conversation.
 *
 * `review` keeps the normal SDK approval interruption for mutations.
 * `autonomous` may execute only the exact, server-derived mutation grant for
 * the current user message. Destructive tools still require confirmation at
 * the SDK boundary even in autonomous mode.
 */
export type WorkExecutionMode = 'review' | 'autonomous';

export const DEFAULT_WORK_EXECUTION_MODE: WorkExecutionMode = 'autonomous';
export const INLINE_WORK_GOAL_PREFIX = 'Set this as the active Work goal:';

export function parseWorkExecutionMode(value: unknown): WorkExecutionMode {
  return value === 'review' || value === 'autonomous'
    ? value
    : DEFAULT_WORK_EXECUTION_MODE;
}

/** The composer owns this exact prefix; ordinary goal language is not inferred. */
export function parseInlineWorkGoal(message: string): string | null {
  if (!message.startsWith(INLINE_WORK_GOAL_PREFIX)) return null;
  const goal = message.slice(INLINE_WORK_GOAL_PREFIX.length).trim();
  return goal.length > 0 && goal.length <= 5000 ? goal : null;
}
