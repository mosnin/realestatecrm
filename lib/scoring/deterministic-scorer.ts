/**
 * Deterministic Rule-Based Scorer for Dynamic Forms
 *
 * Pure function that evaluates form answers against explicitly configured
 * scoring mappings. No AI/LLM dependency — instant, consistent results.
 *
 * How it works:
 *   1. Iterate through all questions that have `scoring.mappings`
 *   2. Match each answer to its configured point mapping
 *   3. Return a weighted 0-100 score with per-question breakdown
 */

import type { IntakeFormConfig, FormQuestion } from '@/lib/types';

export type DeterministicBreakdownItem = {
  questionId: string;
  label: string;
  points: number;
  maxPoints: number;
  weight: number;
  matched: boolean;
};

export type DeterministicScoringResult = {
  score: number; // 0-100
  maxPossible: number;
  breakdown: DeterministicBreakdownItem[];
  hasRules: boolean; // true if any question had scoring mappings
};

type Answers = Record<string, string | string[] | number | boolean>;

/**
 * Compute a deterministic score from form config scoring rules + answers.
 *
 * For each question with `scoring.mappings`, we try to match the answer:
 *   - select / radio: exact value match
 *   - multi_select: sum points for all selected values
 *   - checkbox: match "true" / "false" string
 *   - text / textarea / email / phone: case-insensitive contains match
 *   - number: exact string match against the numeric value
 *   - date: exact match
 *
 * Each question's matched points are weighted by `scoring.weight`.
 * Final score = sum(matched * weight) / sum(maxPossible * weight) * 100.
 */
export function computeDeterministicScore(
  formConfig: IntakeFormConfig,
  answers: Answers,
): DeterministicScoringResult {
  const breakdown: DeterministicBreakdownItem[] = [];
  let weightedPointsEarned = 0;
  let weightedMaxPossible = 0;
  let hasRules = false;

  for (const section of formConfig.sections) {
    for (const question of section.questions) {
      const scoring = question.scoring;
      if (!scoring) continue;
      if (!scoring.mappings || scoring.mappings.length === 0) continue;

      const weight = scoring.weight;
      if (weight <= 0) continue;

      hasRules = true;

      const maxPoints = getMaxPoints(scoring.mappings);
      const answer = answers[question.id];
      const points = matchAnswer(question, answer, scoring.mappings);

      breakdown.push({
        questionId: question.id,
        label: question.label,
        points,
        maxPoints,
        weight,
        matched: points > 0,
      });

      weightedPointsEarned += points * weight;
      weightedMaxPossible += maxPoints * weight;
    }
  }

  if (!hasRules || weightedMaxPossible === 0) {
    return {
      score: 0,
      maxPossible: 0,
      breakdown: [],
      hasRules: false,
    };
  }

  const score = Math.round((weightedPointsEarned / weightedMaxPossible) * 100);

  return {
    score: Math.max(0, Math.min(100, score)),
    maxPossible: weightedMaxPossible,
    breakdown,
    hasRules: true,
  };
}

/**
 * Get the maximum possible points from a set of mappings.
 */
function getMaxPoints(mappings: { value: string; points: number }[]): number {
  if (mappings.length === 0) return 0;
  return Math.max(...mappings.map((m) => m.points));
}

/**
 * Match an answer against scoring mappings and return earned points.
 */
function matchAnswer(
  question: FormQuestion,
  answer: string | string[] | number | boolean | undefined,
  mappings: { value: string; points: number }[],
): number {
  // Unanswered questions get 0 points
  if (answer === undefined || answer === null || answer === '') {
    return 0;
  }

  const questionType = question.type;

  switch (questionType) {
    case 'select':
    case 'radio': {
      // Exact value match
      const answerStr = String(answer).trim().toLowerCase();
      for (const mapping of mappings) {
        if (mapping.value.trim().toLowerCase() === answerStr) {
          return mapping.points;
        }
      }
      return 0;
    }

    case 'multi_select': {
      // Sum points for all selected values
      const selected = Array.isArray(answer) ? answer : [String(answer)];
      let total = 0;
      for (const val of selected) {
        const valLower = val.trim().toLowerCase();
        for (const mapping of mappings) {
          if (mapping.value.trim().toLowerCase() === valLower) {
            total += mapping.points;
          }
        }
      }
      // Cap at the max single mapping value to keep scoring proportional
      const maxPoints = getMaxPoints(mappings);
      return Math.min(total, maxPoints);
    }

    case 'checkbox': {
      // Boolean: match "true" or "false" mapping
      const boolStr = String(Boolean(answer)).toLowerCase();
      for (const mapping of mappings) {
        if (mapping.value.trim().toLowerCase() === boolStr) {
          return mapping.points;
        }
      }
      return 0;
    }

    case 'number': {
      // Try exact string match first, then numeric comparison
      const numStr = String(answer).trim();
      for (const mapping of mappings) {
        if (mapping.value.trim() === numStr) {
          return mapping.points;
        }
      }
      // Also try numeric equality for cases like "5000" matching "5000"
      const numVal = Number(answer);
      if (!isNaN(numVal)) {
        for (const mapping of mappings) {
          const mappingNum = Number(mapping.value.trim());
          if (!isNaN(mappingNum) && mappingNum === numVal) {
            return mapping.points;
          }
        }
      }
      return 0;
    }

    case 'text':
    case 'textarea':
    case 'email':
    case 'phone': {
      // Case-insensitive contains match
      const answerStr = String(answer).trim().toLowerCase();
      let bestPoints = 0;
      for (const mapping of mappings) {
        const mappingVal = mapping.value.trim().toLowerCase();
        if (answerStr === mappingVal || answerStr.includes(mappingVal)) {
          bestPoints = Math.max(bestPoints, mapping.points);
        }
      }
      return bestPoints;
    }

    case 'date': {
      // Exact match for date values
      const answerStr = String(answer).trim();
      for (const mapping of mappings) {
        if (mapping.value.trim() === answerStr) {
          return mapping.points;
        }
      }
      return 0;
    }

    default:
      return 0;
  }
}
