import { describe, expect, it } from 'vitest';
import {
  INLINE_WORK_GOAL_PREFIX,
  parseInlineWorkGoal,
  parseWorkExecutionMode,
} from '@/lib/chat/work-execution-mode';

describe('Work execution policy', () => {
  it('defaults old or malformed conversations to the existing autonomous behavior', () => {
    expect(parseWorkExecutionMode(undefined)).toBe('autonomous');
    expect(parseWorkExecutionMode('anything')).toBe('autonomous');
  });

  it('preserves both supported server values', () => {
    expect(parseWorkExecutionMode('review')).toBe('review');
    expect(parseWorkExecutionMode('autonomous')).toBe('autonomous');
  });

  it('persists only the exact inline goal command, never ordinary goal language', () => {
    expect(parseInlineWorkGoal(`${INLINE_WORK_GOAL_PREFIX} Close every overdue follow-up`)).toBe(
      'Close every overdue follow-up',
    );
    expect(parseInlineWorkGoal('My goal is to close more deals')).toBeNull();
    expect(parseInlineWorkGoal(INLINE_WORK_GOAL_PREFIX)).toBeNull();
  });
});

