/**
 * Fair Housing guardrails on AI lead scoring.
 *
 * The scorer decides who gets called in two hours. If that ranking correlates
 * with a protected class — even via a proxy, even accidentally — it is FHA
 * disparate-impact exposure, and intent is not a defense. These tests pin the
 * structural control (the model never sees the data) and the output screen.
 */

import { describe, it, expect } from 'vitest';
import {
  isProtectedQuestion,
  redactProtectedContent,
  screenScoreRationale,
  FAIR_HOUSING_INSTRUCTION,
} from '@/lib/scoring/fair-housing-guard';
import { buildDynamicScoringPrompt, buildDynamicSystemPrompt } from '@/lib/scoring/dynamic-prompt-builder';

describe('protected question detection', () => {
  it.each([
    ['What is your race?', 'race'],
    ['Do you have any children?', 'familial_status'],
    ['Number of kids moving in', 'familial_status'],
    ['Are you a US citizen?', 'national_origin'],
    ['Do you receive Section 8 assistance?', 'source_of_income'],
    ['Do you have a disability?', 'disability'],
    ['What is your religion?', 'religion'],
    ['Marital status', 'marital_status'],
    ['Date of birth', 'age'],
  ])('flags %s', (label, topic) => {
    expect(isProtectedQuestion(label)).toBe(topic);
  });

  it('leaves legitimate scoring questions alone', () => {
    for (const ok of [
      'What is your budget?',
      'When do you want to move in?',
      'How many bedrooms do you need?',
      'Are you pre-approved for a mortgage?',
      'Which neighborhoods interest you?',
    ]) {
      expect(isProtectedQuestion(ok), ok).toBeNull();
    }
  });
});

describe('free-text redaction', () => {
  it('masks protected content but preserves scoreable context', () => {
    const r = redactProtectedContent(
      'I have a budget of $450k and I am moving with my 3 kids before September.',
    );
    expect(r.text).not.toMatch(/3 kids/i);
    expect(r.text).toContain('$450k');
    expect(r.text).toContain('September');
    expect(r.topics).toContain('familial_status');
  });

  it('masks a housing voucher mention', () => {
    const r = redactProtectedContent('I will be paying with a Section 8 voucher.');
    expect(r.text).not.toMatch(/section\s*8/i);
    expect(r.topics).toContain('source_of_income');
  });

  it('leaves clean text untouched', () => {
    const clean = 'Pre-approved for $600k, need 3 bedrooms, closing in 60 days.';
    const r = redactProtectedContent(clean);
    expect(r.text).toBe(clean);
    expect(r.topics).toEqual([]);
  });
});

describe('output screening', () => {
  it('flags a rationale that cites a protected characteristic', () => {
    const r = screenScoreRationale('Strong buyer, though with 3 kids they may need more space.');
    expect(r.safe).toBe(false);
    expect(r.topics).toContain('familial_status');
  });

  it('passes a rationale grounded in legitimate signals', () => {
    const r = screenScoreRationale('Pre-approved, 30-day timeline, answered every question.');
    expect(r.safe).toBe(true);
  });
});

describe('prompt integration', () => {
  const formConfig = {
    leadType: 'buyer',
    sections: [
      {
        title: 'About you',
        position: 0,
        questions: [
          { id: 'q1', label: 'What is your budget?', position: 0, system: false, required: true },
          { id: 'q2', label: 'How many children will live here?', position: 1, system: false, required: false },
          { id: 'q3', label: 'Anything else?', position: 2, system: false, required: false },
        ],
      },
    ],
  } as never;

  it('a protected question never reaches the model', () => {
    const prompt = buildDynamicScoringPrompt({
      formConfig,
      answers: { q1: '$450,000', q2: '3', q3: 'Flexible on timing' },
      deterministicScore: null,
    } as never);
    expect(prompt).toContain('$450,000');
    expect(prompt).not.toMatch(/how many children/i);
    // The answer to the protected question must not leak either.
    expect(prompt).not.toMatch(/A: 3\b/);
  });

  it('protected free-text in a neutral question is masked', () => {
    const prompt = buildDynamicScoringPrompt({
      formConfig,
      answers: { q1: '$450,000', q3: 'We need a ground floor unit, I use a wheelchair' },
      deterministicScore: null,
    } as never);
    expect(prompt).not.toMatch(/wheelchair/i);
    expect(prompt).toContain('ground floor');
  });

  it('the system prompt carries the binding fair-housing instruction', () => {
    const sys = buildDynamicSystemPrompt({ leadType: 'buyer', hasDeterministicScore: false });
    expect(sys).toContain(FAIR_HOUSING_INSTRUCTION);
    expect(sys).toMatch(/source of income/i);
    expect(sys).toMatch(/do not infer them from names/i);
  });
});
