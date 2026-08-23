import { describe, expect, it } from 'vitest';

import { hasUsablePlannerContent, parsePlannerOutput } from '@/lib/work-sessions/planner';

describe('WorkSession planner output boundary', () => {
  it('accepts JSON wrapped in short explanatory prose', () => {
    const parsed = parsePlannerOutput(
      'Here is the plan:\n{"steps":[{"title":"Pull recent comps"}],"question":null}\nDone.',
    );

    expect(parsed).toEqual({
      steps: [{ title: 'Pull recent comps' }],
      question: null,
    });
  });

  it('accepts a fenced JSON response and ignores braces inside strings', () => {
    const parsed = parsePlannerOutput(
      '```json\n{"steps":[{"title":"Review {active} deals"}],"question":null}\n```',
    );

    expect(parsed?.steps).toEqual([{ title: 'Review {active} deals' }]);
  });

  it('rejects unstructured prose and malformed JSON instead of inventing steps', () => {
    expect(parsePlannerOutput('Pull comps, review the deal, and prepare a brief.')).toBeNull();
    expect(parsePlannerOutput('{"steps":[{"title":"Pull comps"}]')).toBeNull();
    expect(parsePlannerOutput('```json\n{"steps":[oops]}\n```')).toBeNull();
  });

  it('preserves a structurally valid but unusable shape for the engine to retry', () => {
    expect(parsePlannerOutput('{"steps":[null,{"title":42}]}')).toEqual({
      steps: [null, { title: 42 }],
      question: undefined,
    });
  });

  it('keeps a parseable empty payload distinguishable from unreadable output', () => {
    expect(parsePlannerOutput('{"steps":[]}')).toEqual({ steps: [], question: undefined });
  });

  it('treats a titled step or a real question as usable planner content', () => {
    expect(hasUsablePlannerContent({ steps: [{ title: 'Pull comps' }] })).toBe(true);
    expect(hasUsablePlannerContent({ steps: [], question: 'Which listing?' })).toBe(true);
    expect(hasUsablePlannerContent({ steps: [null, { title: 42 }, { title: '   ' }] })).toBe(false);
    expect(hasUsablePlannerContent({ steps: [], question: 'null' })).toBe(false);
    expect(hasUsablePlannerContent({ steps: [] })).toBe(false);
  });
});
