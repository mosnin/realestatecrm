/**
 * AI-Powered Scoring Model Generator
 *
 * Given an IntakeFormConfig, calls GPT-4o-mini to generate optimal scoring
 * weights that sum to exactly 100, with per-option scores for radio/select
 * fields and range buckets for number fields.
 *
 * Falls back to smart deterministic defaults if the AI call fails.
 */

import type { IntakeFormConfig } from '@/lib/types';
import type { ScoringModel, ScoringModelAIResponse } from './scoring-model-types';

// ── System fields & informational-only fields that should not be scored ─────

const SYSTEM_FIELD_IDS = new Set(['name', 'email', 'phone']);
const SKIP_TYPES = new Set(['textarea']);

function isScorableQuestion(q: {
  id: string;
  type: string;
  system?: boolean;
  label: string;
}): boolean {
  if (q.system) return false;
  if (SYSTEM_FIELD_IDS.has(q.id)) return false;
  if (SKIP_TYPES.has(q.type)) return false;
  // Skip informational-only fields based on common label patterns
  const lower = q.label.toLowerCase();
  if (
    lower.includes('additional info') ||
    lower.includes('anything we should know') ||
    lower.includes('notes') ||
    lower.includes('comments')
  ) {
    return false;
  }
  return true;
}

// ── Lazy OpenAI import ──────────────────────────────────────────────────────

async function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY missing');
  }
  const { default: OpenAIClient } = await import('openai');
  return new OpenAIClient({ apiKey: process.env.OPENAI_API_KEY });
}

// ── Build the input payload for the AI ──────────────────────────────────────

function buildAIInput(formConfig: IntakeFormConfig) {
  const questions: {
    id: string;
    type: string;
    label: string;
    required?: boolean;
    options?: string[];
  }[] = [];

  for (const section of formConfig.sections) {
    for (const q of section.questions) {
      if (!isScorableQuestion(q)) continue;

      const entry: (typeof questions)[number] = {
        id: q.id,
        type: q.type,
        label: q.label,
      };

      if (q.required) entry.required = true;

      if (q.options && q.options.length > 0) {
        entry.options = q.options.map((o) => o.label);
      }

      questions.push(entry);
    }
  }

  return {
    leadType: formConfig.leadType === 'general' ? 'rental' : formConfig.leadType,
    questions,
  };
}

// ── JSON Schema for structured output ───────────────────────────────────────

const SCORING_MODEL_JSON_SCHEMA = {
  name: 'scoring_model',
  strict: true,
  schema: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      weights: {
        type: 'object' as const,
        description:
          'Map of question ID to scoring model. Only include questions that should be scored.',
        additionalProperties: {
          type: 'object' as const,
          additionalProperties: false,
          properties: {
            weight: {
              type: 'number' as const,
              description: 'Importance weight 0-100. All weights must sum to exactly 100.',
            },
            optionScores: {
              type: ['object', 'null'] as const,
              description:
                'For radio/select: map of option value (lowercase, hyphens for spaces) to 0-100 score. Null for non-option fields.',
              additionalProperties: { type: 'number' as const },
            },
            ranges: {
              type: ['array', 'null'] as const,
              description:
                'For number fields (budget, income, price): 3-5 range buckets. Null for non-number fields.',
              items: {
                type: 'object' as const,
                additionalProperties: false,
                properties: {
                  min: { type: 'number' as const },
                  max: { type: ['number', 'null'] as const },
                  points: { type: 'number' as const },
                  label: { type: 'string' as const },
                },
                required: ['min', 'max', 'points', 'label'],
              },
            },
          },
          required: ['weight', 'optionScores', 'ranges'],
        },
      },
      totalWeight: {
        type: 'number' as const,
        description: 'Must be exactly 100.',
      },
      reasoning: {
        type: 'string' as const,
        description:
          'Brief explanation of why weights were distributed this way, referencing lead type and key signals.',
      },
    },
    required: ['weights', 'totalWeight', 'reasoning'],
  },
};

const SYSTEM_PROMPT = `You are a real estate lead scoring expert. Given an intake form's questions, generate an optimal scoring model. Distribute importance weights across ALL questions that should be scored, summing to exactly 100. For radio/select questions, assign point values (0-100) to each option reflecting lead quality. For number fields related to money (budget, income, rent, price), generate 3-5 range buckets with point values. Skip system fields (name, email, phone) and informational-only fields (notes, additional info). Consider the lead type (rental vs buyer) when assigning weights — different signals matter for each.

For RENTAL leads, prioritize: move-in timeline urgency, income stability, employment status, budget-to-income ratio, and readiness to commit.

For BUYER leads, prioritize: pre-approval status, purchase budget, timeline to close, property type clarity, and readiness to commit.

When creating option scores, use the actual option values provided (lowercase with hyphens for multi-word values). When creating number ranges, consider realistic real estate values in USD.

The weights MUST sum to exactly 100. Double-check your arithmetic.`;

// ── Main function ───────────────────────────────────────────────────────────

export async function generateScoringModel(
  formConfig: IntakeFormConfig,
): Promise<ScoringModel> {
  const input = buildAIInput(formConfig);

  // If no scorable questions, return empty model
  if (input.questions.length === 0) {
    return {
      weights: {},
      totalWeight: 100,
      reasoning: 'No scorable questions found in the form configuration.',
      generatedAt: new Date().toISOString(),
      leadType: (formConfig.leadType === 'general' ? 'rental' : formConfig.leadType) as
        | 'rental'
        | 'buyer',
    };
  }

  try {
    const openai = await getOpenAIClient();

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 2000,
      response_format: {
        type: 'json_schema',
        json_schema: SCORING_MODEL_JSON_SCHEMA,
      },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify(input, null, 2),
        },
      ],
    });

    const raw = response.choices?.[0]?.message?.content;
    if (!raw) {
      console.warn('[generate-scoring-model] Empty AI response, using fallback');
      return generateFallbackModel(formConfig);
    }

    const parsed = JSON.parse(raw) as ScoringModelAIResponse;

    // Validate and normalize weights to ensure they sum to 100
    const normalizedWeights = normalizeWeights(parsed.weights);

    const leadType = (
      formConfig.leadType === 'general' ? 'rental' : formConfig.leadType
    ) as 'rental' | 'buyer';

    return {
      weights: normalizedWeights,
      totalWeight: 100,
      reasoning: parsed.reasoning?.slice(0, 500) || 'AI-generated scoring model.',
      generatedAt: new Date().toISOString(),
      leadType,
    };
  } catch (error) {
    console.warn('[generate-scoring-model] AI call failed, using fallback', { error });
    return generateFallbackModel(formConfig);
  }
}

// ── Normalize weights to sum to exactly 100 ─────────────────────────────────

function normalizeWeights(
  weights: ScoringModelAIResponse['weights'],
): ScoringModel['weights'] {
  const entries = Object.entries(weights);
  if (entries.length === 0) return {};

  const totalRaw = entries.reduce((sum, [, v]) => sum + (v.weight || 0), 0);

  if (totalRaw === 0) {
    // Equal distribution if AI returned all zeros
    const equalWeight = Math.floor(100 / entries.length);
    const remainder = 100 - equalWeight * entries.length;
    return Object.fromEntries(
      entries.map(([id, v], i) => [
        id,
        {
          weight: equalWeight + (i < remainder ? 1 : 0),
          ...(v.optionScores ? { optionScores: v.optionScores } : {}),
          ...(v.ranges ? { ranges: v.ranges } : {}),
        },
      ]),
    );
  }

  // Scale weights to sum to 100, using integer rounding
  const scaled = entries.map(([id, v]) => ({
    id,
    weight: (v.weight / totalRaw) * 100,
    optionScores: v.optionScores ?? undefined,
    ranges: v.ranges ?? undefined,
  }));

  // Floor all, then distribute remainder to largest fractional parts
  const floored = scaled.map((s) => ({
    ...s,
    intWeight: Math.floor(s.weight),
    fraction: s.weight - Math.floor(s.weight),
  }));

  let remainder = 100 - floored.reduce((sum, s) => sum + s.intWeight, 0);

  // Sort by fractional part descending and distribute remainder
  const sorted = [...floored].sort((a, b) => b.fraction - a.fraction);
  for (const item of sorted) {
    if (remainder <= 0) break;
    item.intWeight += 1;
    remainder -= 1;
  }

  const result: ScoringModel['weights'] = {};
  for (const item of floored) {
    result[item.id] = {
      weight: item.intWeight,
      ...(item.optionScores ? { optionScores: item.optionScores } : {}),
      ...(item.ranges ? { ranges: item.ranges } : {}),
    };
  }

  return result;
}

// ── Smart fallback when AI is unavailable ───────────────────────────────────

export function generateFallbackModel(
  formConfig: IntakeFormConfig,
): ScoringModel {
  const leadType = (
    formConfig.leadType === 'general' ? 'rental' : formConfig.leadType
  ) as 'rental' | 'buyer';

  const scorableQuestions: {
    id: string;
    type: string;
    label: string;
    options?: { value: string; label: string }[];
    required: boolean;
  }[] = [];

  for (const section of formConfig.sections) {
    for (const q of section.questions) {
      if (!isScorableQuestion(q)) continue;
      scorableQuestions.push({
        id: q.id,
        type: q.type,
        label: q.label,
        options: q.options,
        required: q.required,
      });
    }
  }

  if (scorableQuestions.length === 0) {
    return {
      weights: {},
      totalWeight: 100,
      reasoning: 'No scorable questions found.',
      generatedAt: new Date().toISOString(),
      leadType,
    };
  }

  // Heuristic weight assignment based on label keywords
  const rawWeights: { id: string; weight: number }[] = scorableQuestions.map((q) => {
    const lower = q.label.toLowerCase();

    // High-signal keywords
    if (/ready|commit|move forward/i.test(lower)) return { id: q.id, weight: 20 };
    if (/budget|rent.*budget|purchase.*budget|price/i.test(lower)) return { id: q.id, weight: 18 };
    if (/income|salary|earn/i.test(lower)) return { id: q.id, weight: 16 };
    if (/when.*mov|timeline|move.*date|when.*close/i.test(lower)) return { id: q.id, weight: 15 };
    if (/employ|work|job|occupation/i.test(lower)) return { id: q.id, weight: 12 };
    if (/pre.?approv/i.test(lower)) return { id: q.id, weight: 18 };

    // Medium-signal
    if (/location|area|neighborhood|where/i.test(lower)) return { id: q.id, weight: 8 };
    if (/property.*type|bedroom|bathroom/i.test(lower)) return { id: q.id, weight: 6 };
    if (/pet|household|occupant/i.test(lower)) return { id: q.id, weight: 5 };
    if (/first.?time|housing.*situation/i.test(lower)) return { id: q.id, weight: 5 };

    // Default
    return { id: q.id, weight: 5 };
  });

  // Normalize to 100
  const totalRaw = rawWeights.reduce((s, w) => s + w.weight, 0);
  const scaled = rawWeights.map((w) => ({
    ...w,
    scaledWeight: (w.weight / totalRaw) * 100,
  }));

  const floored = scaled.map((s) => ({
    ...s,
    intWeight: Math.floor(s.scaledWeight),
    fraction: s.scaledWeight - Math.floor(s.scaledWeight),
  }));

  let remainder = 100 - floored.reduce((s, f) => s + f.intWeight, 0);
  const sorted = [...floored].sort((a, b) => b.fraction - a.fraction);
  for (const item of sorted) {
    if (remainder <= 0) break;
    item.intWeight += 1;
    remainder -= 1;
  }

  const weights: ScoringModel['weights'] = {};

  for (const item of floored) {
    const q = scorableQuestions.find((sq) => sq.id === item.id)!;
    const entry: ScoringModel['weights'][string] = { weight: item.intWeight };

    // Generate option scores for radio/select
    if (
      (q.type === 'radio' || q.type === 'select') &&
      q.options &&
      q.options.length > 0
    ) {
      const optScores: Record<string, number> = {};
      const count = q.options.length;
      q.options.forEach((opt, i) => {
        // Distribute scores linearly from high to low
        optScores[opt.value] = Math.round(((count - i) / count) * 100);
      });
      entry.optionScores = optScores;
    }

    // Generate range buckets for number fields (money-related)
    if (q.type === 'number') {
      const lower = q.label.toLowerCase();
      const isMoney = /budget|income|rent|salary|payment|price|amount|cost/i.test(lower);

      if (isMoney) {
        if (/income|salary/i.test(lower)) {
          entry.ranges = [
            { min: 0, max: 2000, points: 15, label: 'Under $2,000' },
            { min: 2000, max: 4000, points: 40, label: '$2,000-$4,000' },
            { min: 4000, max: 6000, points: 70, label: '$4,000-$6,000' },
            { min: 6000, max: 10000, points: 90, label: '$6,000-$10,000' },
            { min: 10000, max: null, points: 100, label: '$10,000+' },
          ];
        } else if (/purchase|price/i.test(lower)) {
          entry.ranges = [
            { min: 0, max: 200000, points: 20, label: 'Under $200K' },
            { min: 200000, max: 400000, points: 50, label: '$200K-$400K' },
            { min: 400000, max: 700000, points: 75, label: '$400K-$700K' },
            { min: 700000, max: 1000000, points: 90, label: '$700K-$1M' },
            { min: 1000000, max: null, points: 100, label: '$1M+' },
          ];
        } else {
          // Default rent/budget ranges
          entry.ranges = [
            { min: 0, max: 1500, points: 20, label: 'Under $1,500' },
            { min: 1500, max: 2500, points: 50, label: '$1,500-$2,500' },
            { min: 2500, max: 3500, points: 80, label: '$2,500-$3,500' },
            { min: 3500, max: 5000, points: 95, label: '$3,500-$5,000' },
            { min: 5000, max: null, points: 100, label: '$5,000+' },
          ];
        }
      }
    }

    weights[item.id] = entry;
  }

  return {
    weights,
    totalWeight: 100,
    reasoning: `Fallback scoring model generated using label-based heuristics for ${leadType} leads. Budget, income, timeline, and readiness are weighted highest.`,
    generatedAt: new Date().toISOString(),
    leadType,
  };
}
