import { describe, it, expect } from 'vitest';
import {
  computeDeterministicScore,
  computeModelBasedScore,
} from '@/lib/scoring/deterministic-scorer';
import {
  RENTAL_APPLICATION_TEMPLATE,
} from '@/lib/form-config-templates';
import type { IntakeFormConfig } from '@/lib/types';
import type { ScoringModel } from '@/lib/scoring/scoring-model-types';

// Tier bands (must match assignTier in engine.ts / dynamic-lead-scoring.ts):
//   hot >= 75, warm >= 45, else cold/unqualified.
// These tests feed representative strong / middling / weak leads through the
// real scoring functions and assert the scores land in the right 0-100 band.

describe('computeDeterministicScore — default rental template', () => {
  const strong = {
    name: 'S', email: 's@x.com', phone: '5551',
    monthlyRent: '1500_2000', numberOfOccupants: 2,
    employmentStatus: 'employed', monthlyGrossIncome: '7500_plus',
    priorEvictions: 'no', hasPets: 'no',
  };
  const middling = {
    name: 'M', email: 'm@x.com', phone: '5552',
    monthlyRent: '2000_2500', numberOfOccupants: 3,
    employmentStatus: 'part-time', monthlyGrossIncome: '3000_4000',
    priorEvictions: 'no', hasPets: 'no',
  };
  const weak = {
    name: 'W', email: 'w@x.com', phone: '5553',
    monthlyRent: 'under_1000', numberOfOccupants: 6,
    employmentStatus: 'unemployed', monthlyGrossIncome: 'under_2000',
    priorEvictions: 'yes', hasPets: 'yes',
  };

  it('produces a 0-100 score for a strong lead', () => {
    const r = computeDeterministicScore(RENTAL_APPLICATION_TEMPLATE, strong);
    expect(r.hasRules).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(75);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it('ranks strong > middling > weak monotonically', () => {
    const s = computeDeterministicScore(RENTAL_APPLICATION_TEMPLATE, strong).score;
    const m = computeDeterministicScore(RENTAL_APPLICATION_TEMPLATE, middling).score;
    const w = computeDeterministicScore(RENTAL_APPLICATION_TEMPLATE, weak).score;
    expect(s).toBeGreaterThan(m);
    expect(m).toBeGreaterThan(w);
  });
});

describe('computeDeterministicScore — weight, not point magnitude, controls influence', () => {
  // Regression lock for the scale-distortion defect: two questions with EQUAL
  // weight but different point scales (one tops out at 10, one at 100) must
  // contribute equally. Before the fix the score normalized Σ(pts·w)/Σ(maxPts·w),
  // which let the 0-100 question dominate the equally-weighted 0-10 question:
  // acing the small-scale half scored 9/100 and acing the big-scale half scored
  // 91/100 — wildly off for an equal-weight split.
  const config: IntakeFormConfig = {
    version: 1,
    leadType: 'rental',
    sections: [
      {
        id: 's1',
        title: 'Mixed scales',
        position: 0,
        questions: [
          {
            id: 'q_small',
            type: 'radio',
            label: 'Ready to commit?',
            position: 0,
            required: false,
            options: [
              { value: 'yes', label: 'Yes', scoreValue: 10 },
              { value: 'no', label: 'No', scoreValue: 0 },
            ],
            scoring: { weight: 50 },
          },
          {
            id: 'q_big',
            type: 'select',
            label: 'Income band',
            position: 1,
            required: false,
            options: [
              { value: 'high', label: 'High' },
              { value: 'low', label: 'Low' },
            ],
            scoring: {
              weight: 50,
              mappings: [
                { value: 'high', points: 100 },
                { value: 'low', points: 0 },
              ],
            },
          },
        ],
      },
    ],
  } as unknown as IntakeFormConfig;

  it('acing the small-scale question equals acing the big-scale one (~50 each)', () => {
    const acesSmall = computeDeterministicScore(config, { q_small: 'yes', q_big: 'low' }).score;
    const acesBig = computeDeterministicScore(config, { q_small: 'no', q_big: 'high' }).score;
    expect(acesSmall).toBe(50);
    expect(acesBig).toBe(50);
  });

  it('acing both = 100, failing both = 0', () => {
    expect(computeDeterministicScore(config, { q_small: 'yes', q_big: 'high' }).score).toBe(100);
    expect(computeDeterministicScore(config, { q_small: 'no', q_big: 'low' }).score).toBe(0);
  });
});

describe('computeModelBasedScore — AI scoring model path', () => {
  const model: ScoringModel = {
    totalWeight: 100,
    reasoning: 'test',
    generatedAt: '2026-01-01T00:00:00.000Z',
    leadType: 'rental',
    weights: {
      monthlyRent: {
        weight: 20,
        optionScores: { under_1000: 30, '1000_1500': 50, '1500_2000': 70, '2000_2500': 85, '2500_3000': 95, '3000_plus': 100 },
      },
      monthlyGrossIncome: {
        weight: 25,
        optionScores: { under_2000: 10, '2000_3000': 30, '3000_4000': 50, '4000_5000': 70, '5000_7500': 90, '7500_plus': 100 },
      },
      employmentStatus: {
        weight: 20,
        optionScores: { employed: 100, 'self-employed': 80, 'part-time': 60, student: 40, retired: 70, unemployed: 10 },
      },
      priorEvictions: { weight: 20, optionScores: { no: 100, yes: 0 } },
      numberOfOccupants: {
        weight: 15,
        ranges: [
          { min: 1, max: 3, points: 100 },
          { min: 3, max: 5, points: 70 },
          { min: 5, max: null, points: 40 },
        ],
      },
    },
  };

  it('scores a strong lead hot (>=75)', () => {
    const r = computeModelBasedScore(RENTAL_APPLICATION_TEMPLATE, {
      monthlyRent: '3000_plus', monthlyGrossIncome: '7500_plus',
      employmentStatus: 'employed', priorEvictions: 'no', numberOfOccupants: 2,
    }, model);
    expect(r.score).toBeGreaterThanOrEqual(75);
  });

  it('scores a middling lead warm (45-74)', () => {
    const r = computeModelBasedScore(RENTAL_APPLICATION_TEMPLATE, {
      monthlyRent: '2000_2500', monthlyGrossIncome: '3000_4000',
      employmentStatus: 'part-time', priorEvictions: 'no', numberOfOccupants: 3,
    }, model);
    expect(r.score).toBeGreaterThanOrEqual(45);
    expect(r.score).toBeLessThan(75);
  });

  it('scores a weak lead cold (<45)', () => {
    const r = computeModelBasedScore(RENTAL_APPLICATION_TEMPLATE, {
      monthlyRent: 'under_1000', monthlyGrossIncome: 'under_2000',
      employmentStatus: 'unemployed', priorEvictions: 'yes', numberOfOccupants: 6,
    }, model);
    expect(r.score).toBeLessThan(45);
  });
});

describe('computeModelBasedScore — dead weight on unscoreable questions', () => {
  // Regression lock: a ScoringModel can carry weight on questions it has no
  // mechanism to score (a date or free-text field with neither optionScores
  // nor ranges). That "dead weight" must NOT sit in the denominator, otherwise
  // it silently caps every lead's score below 100 — a perfect applicant on a
  // form whose model wasted 37% of its weight maxes out at 63/100.
  const config: IntakeFormConfig = {
    version: 1,
    leadType: 'rental',
    sections: [
      {
        id: 's1',
        title: 'Mixed',
        position: 0,
        questions: [
          {
            id: 'income',
            type: 'select',
            label: 'Income',
            position: 0,
            required: false,
            options: [
              { value: 'high', label: 'High' },
              { value: 'low', label: 'Low' },
            ],
          },
          { id: 'movein', type: 'date', label: 'Move-in date', position: 1, required: false },
          { id: 'employer', type: 'text', label: 'Employer', position: 2, required: false },
        ],
      },
    ],
  } as unknown as IntakeFormConfig;

  const model: ScoringModel = {
    totalWeight: 100,
    reasoning: '',
    generatedAt: '2026-01-01T00:00:00.000Z',
    leadType: 'rental',
    weights: {
      income: { weight: 63, optionScores: { high: 100, low: 0 } },
      movein: { weight: 25 }, // date — no way to score
      employer: { weight: 12 }, // text — no way to score
    },
  };

  it('a perfect answer on the only scoreable question reaches 100, not 63', () => {
    const r = computeModelBasedScore(config, { income: 'high', movein: '2026-07-01', employer: 'Acme' }, model);
    expect(r.score).toBe(100);
  });

  it('the worst answer on the only scoreable question reaches 0', () => {
    const r = computeModelBasedScore(config, { income: 'low' }, model);
    expect(r.score).toBe(0);
  });

  it('excludes dead-weight questions from the breakdown entirely', () => {
    const r = computeModelBasedScore(config, { income: 'high' }, model);
    expect(r.breakdown.map((b) => b.questionId)).toEqual(['income']);
    expect(r.hasModel).toBe(true);
  });

  it('a model made up entirely of dead weight reports hasModel=false', () => {
    const deadModel: ScoringModel = {
      totalWeight: 100,
      reasoning: '',
      generatedAt: '2026-01-01T00:00:00.000Z',
      leadType: 'rental',
      weights: {
        movein: { weight: 50 },
        employer: { weight: 50 },
      },
    };
    const r = computeModelBasedScore(config, { movein: '2026-07-01', employer: 'Acme' }, deadModel);
    expect(r.hasModel).toBe(false);
    expect(r.score).toBe(0);
  });
});
