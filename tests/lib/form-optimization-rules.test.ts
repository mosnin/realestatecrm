/**
 * generateDeterministicSuggestions is the pure, rule-based form optimizer: it
 * turns measured form performance into "remove / make optional / add scoring /
 * shorten section" suggestions. The thresholds (and their minimum-sample
 * gates) are the whole product, and easy to nudge by accident. Pin each rule
 * firing, the min-submission gates, and that system questions are skipped.
 */

import { describe, it, expect } from 'vitest';
import {
  generateDeterministicSuggestions,
  type FormPerformance,
  type QuestionStats,
  type SectionStats,
} from '@/lib/form-optimization';
import type { IntakeFormConfig } from '@/lib/types';

const config = (system = false): IntakeFormConfig =>
  ({
    sections: [
      { id: 's1', title: 'Section One', questions: [{ id: 'q1', label: 'Q1', type: 'select', system }] },
    ],
  } as unknown as IntakeFormConfig);

const qstat = (over: Partial<QuestionStats>): QuestionStats => ({
  questionId: 'q1',
  label: 'Q1',
  type: 'select',
  required: false,
  sectionId: 's1',
  answerRate: 1,
  skipRate: 0,
  avgScoreContribution: 0.5,
  commonAnswers: [],
  uniformity: 0,
  ...over,
});

const perf = (over: Partial<FormPerformance>): FormPerformance => ({
  spaceId: 'sp1',
  totalSubmissions: 50,
  avgLeadScore: 50,
  scoreDistribution: { hot: 1, warm: 1, cold: 1 },
  questionStats: [],
  sectionStats: [],
  mostCommonDropOff: null,
  dataCollectedAt: '2026-06-27',
  ...over,
});

const types = (s: ReturnType<typeof generateDeterministicSuggestions>) => s.map((x) => `${x.type}:${x.target}`);

describe('generateDeterministicSuggestions', () => {
  it('suggests REMOVE for a near-unanswered question (>=10 submissions)', () => {
    const s = generateDeterministicSuggestions(
      perf({ totalSubmissions: 10, questionStats: [qstat({ answerRate: 0.05 })] }),
      config(),
    );
    expect(types(s)).toContain('remove:q1');
  });

  it('does NOT fire below the 10-submission gate', () => {
    const s = generateDeterministicSuggestions(
      perf({ totalSubmissions: 9, questionStats: [qstat({ answerRate: 0.05 })] }),
      config(),
    );
    expect(s).toHaveLength(0);
  });

  it('suggests MODIFY (make optional) for a required question under 50% answered', () => {
    const s = generateDeterministicSuggestions(
      perf({ totalSubmissions: 20, questionStats: [qstat({ required: true, answerRate: 0.3 })] }),
      config(),
    );
    expect(types(s)).toContain('modify:q1');
  });

  it('suggests REMOVE for a no-differentiation question (uniformity > 0.9, >=15)', () => {
    const s = generateDeterministicSuggestions(
      perf({
        totalSubmissions: 20,
        questionStats: [qstat({ uniformity: 0.95, answerRate: 0.8, commonAnswers: [{ value: 'yes', count: 19 }] })],
      }),
      config(),
    );
    expect(s.some((x) => x.type === 'remove' && /no differentiation/i.test(x.title))).toBe(true);
  });

  it('suggests SCORING for a high-answer select with zero scoring weight', () => {
    const s = generateDeterministicSuggestions(
      perf({ totalSubmissions: 20, questionStats: [qstat({ answerRate: 0.8, avgScoreContribution: 0, uniformity: 0.2 })] }),
      config(),
    );
    expect(types(s)).toContain('scoring:q1');
  });

  it('skips system questions entirely', () => {
    const s = generateDeterministicSuggestions(
      perf({ totalSubmissions: 50, questionStats: [qstat({ answerRate: 0.01 })] }),
      config(true), // q1 is a system field
    );
    expect(s).toHaveLength(0);
  });

  it('suggests MODIFY for a high drop-off section (>40%, >=10)', () => {
    const ss: SectionStats = {
      sectionId: 's1',
      title: 'Section One',
      completionRate: 0.5,
      questionCount: 4,
      avgAnswerRate: 0.6,
      dropOffRate: 0.5,
    };
    const s = generateDeterministicSuggestions(perf({ totalSubmissions: 30, sectionStats: [ss] }), config());
    expect(types(s)).toContain('modify:s1');
  });
});
