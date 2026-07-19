/**
 * Unit tests for components/drip/step-editor.tsx's validateStepsClient —
 * the builder's instant client-side pre-check, mirroring lib/drip/schema.ts's
 * parseDripSteps rules (non-negative integer dayOffset, non-decreasing
 * order, non-empty instruction, email|sms channel, step-count/length caps).
 * Behavioral (calls the real function), never a source-grep.
 */
import { describe, it, expect } from 'vitest';
import { validateStepsClient, newStep, MAX_STEPS, MAX_DAY_OFFSET } from '@/components/drip/step-editor';
import type { DripStepUI } from '@/components/drip/types';

function step(overrides: Partial<DripStepUI> = {}): DripStepUI {
  return { dayOffset: 0, channel: 'email', instruction: 'hello', ...overrides };
}

describe('validateStepsClient', () => {
  it('requires at least one step', () => {
    expect(validateStepsClient([])).toContain('Add at least one step.');
  });

  it('accepts a single valid step', () => {
    expect(validateStepsClient([step()])).toEqual([]);
  });

  it('accepts non-decreasing day offsets across multiple steps', () => {
    expect(validateStepsClient([step({ dayOffset: 0 }), step({ dayOffset: 3 }), step({ dayOffset: 3 }), step({ dayOffset: 10 })])).toEqual([]);
  });

  it('rejects a negative dayOffset', () => {
    const issues = validateStepsClient([step({ dayOffset: -1 })]);
    expect(issues.some((i) => i.includes('non-negative'))).toBe(true);
  });

  it('rejects a non-integer dayOffset', () => {
    const issues = validateStepsClient([step({ dayOffset: 1.5 })]);
    expect(issues.some((i) => i.includes('non-negative'))).toBe(true);
  });

  it('rejects a dayOffset over the cap', () => {
    const issues = validateStepsClient([step({ dayOffset: MAX_DAY_OFFSET + 1 })]);
    expect(issues.some((i) => i.includes(`at most ${MAX_DAY_OFFSET}`))).toBe(true);
  });

  it('rejects a step whose dayOffset comes before the previous step', () => {
    const issues = validateStepsClient([step({ dayOffset: 5 }), step({ dayOffset: 1 })]);
    expect(issues.some((i) => i.includes("can't come before"))).toBe(true);
  });

  it('rejects an empty instruction', () => {
    const issues = validateStepsClient([step({ instruction: '   ' })]);
    expect(issues.some((i) => i.includes("can't be empty"))).toBe(true);
  });

  it('rejects more than MAX_STEPS steps', () => {
    const steps = Array.from({ length: MAX_STEPS + 1 }, (_, i) => step({ dayOffset: i }));
    const issues = validateStepsClient(steps);
    expect(issues.some((i) => i.includes(`At most ${MAX_STEPS}`))).toBe(true);
  });

  it('newStep() seeds a step at the given day offset with an email channel', () => {
    expect(newStep(7)).toEqual({ dayOffset: 7, channel: 'email', instruction: '' });
  });
});
