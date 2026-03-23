/**
 * AI Enhancement Layer for Chippi Lead Scoring
 *
 * Adds qualitative analysis on top of the deterministic engine score.
 * The AI does NOT determine the score — it explains it and recommends actions.
 * If the AI call fails, the deterministic score is still returned in full.
 */

import OpenAI from 'openai';
import type { ScoringEngineResult } from './engine';
import type { ApplicationData } from '@/lib/types';

export type AIEnhancement = {
  summary: string; // ≤200 chars
  explanationTags: string[];
  recommendedNextAction: string;
  leadState: string;
};

const LEAD_STATES = [
  'high_priority_qualified_renter',
  'qualified_low_urgency',
  'incomplete_application',
  'needs_additional_info',
  'likely_unqualified',
] as const;

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY missing');
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function enhanceWithAI(
  engineResult: ScoringEngineResult,
  input: { name: string; applicationData: ApplicationData | null },
): Promise<AIEnhancement | null> {
  try {
    const openai = getOpenAIClient();

    // Build a compact context from the engine's deterministic analysis
    const categoryBreakdown = engineResult.categories
      .map((c) => `${c.category}: ${Math.round(c.rawScore * 100)}/100 (weight ${Math.round(c.weight * 100)}%) — ${c.signals[0] ?? 'no signal'}`)
      .join('\n');

    const prompt = [
      `Deterministic score: ${engineResult.score}/100 (${engineResult.priorityTier})`,
      `Confidence: ${Math.round(engineResult.confidence * 100)}%`,
      '',
      'Category breakdown:',
      categoryBreakdown,
      '',
      engineResult.strengths.length > 0 ? `Strengths: ${engineResult.strengths.join('; ')}` : '',
      engineResult.weaknesses.length > 0 ? `Weaknesses: ${engineResult.weaknesses.join('; ')}` : '',
      engineResult.riskFlags.length > 0 ? `Risk flags: ${engineResult.riskFlags.join('; ')}` : '',
      engineResult.missingInformation.length > 0 ? `Missing: ${engineResult.missingInformation.join('; ')}` : '',
      '',
      `Applicant: ${input.name}`,
    ].filter(Boolean).join('\n');

    const response = await openai.chat.completions.create({
      model: 'gpt-5.4-mini',
      temperature: 0,
      max_tokens: 300,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'lead_enhancement',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              summary: { type: 'string' },
              explanationTags: { type: 'array', items: { type: 'string' } },
              recommendedNextAction: { type: 'string' },
              leadState: {
                type: 'string',
                enum: [...LEAD_STATES],
              },
            },
            required: ['summary', 'explanationTags', 'recommendedNextAction', 'leadState'],
          },
        },
      },
      messages: [
        {
          role: 'system',
          content: [
            'You summarize pre-computed lead scoring results for a real estate rental CRM.',
            'You do NOT compute scores. The score is already determined.',
            'Your job: write a concise summary (under 200 chars), 2-4 explanation tags,',
            'a specific recommended next action, and classify the lead state.',
            'Be direct and actionable. Tags should be 2-3 words each (e.g., "Strong income", "Eviction risk").',
          ].join(' '),
        },
        { role: 'user', content: prompt },
      ],
    });

    const raw = response.choices?.[0]?.message?.content;
    if (!raw) return null;

    const parsed = JSON.parse(raw) as AIEnhancement;

    return {
      summary: (parsed.summary ?? '').slice(0, 200),
      explanationTags: (parsed.explanationTags ?? []).slice(0, 5),
      recommendedNextAction: parsed.recommendedNextAction ?? 'Review application details',
      leadState: LEAD_STATES.includes(parsed.leadState as typeof LEAD_STATES[number])
        ? parsed.leadState
        : deriveLeadState(engineResult),
    };
  } catch (error) {
    console.warn('[scoring/enhance] AI enhancement failed, using deterministic fallback', { error });
    return null;
  }
}

/**
 * Deterministic fallback for lead state when AI is unavailable
 */
export function deriveLeadState(result: ScoringEngineResult): string {
  if (result.dataCompleteness < 0.3) return 'incomplete_application';
  if (result.missingInformation.length >= 3) return 'needs_additional_info';
  if (result.priorityTier === 'hot') return 'high_priority_qualified_renter';
  if (result.priorityTier === 'warm') return 'qualified_low_urgency';
  return 'likely_unqualified';
}

/**
 * Deterministic fallback summary when AI is unavailable
 */
export function deriveSummary(result: ScoringEngineResult, name: string): string {
  const tier = result.priorityTier;
  const topStrength = result.strengths[0] ?? '';
  const topWeakness = result.weaknesses[0] ?? '';

  if (tier === 'hot') {
    return `${name} scores ${result.score}/100 — strong lead. ${topStrength}`.slice(0, 200);
  }
  if (tier === 'warm') {
    const qualifier = topWeakness ? ` Note: ${topWeakness}` : '';
    return `${name} scores ${result.score}/100 — moderate lead.${qualifier}`.slice(0, 200);
  }
  if (tier === 'cold') {
    return `${name} scores ${result.score}/100 — low priority. ${topWeakness || 'Needs further review.'}`.slice(0, 200);
  }
  return `${name} scores ${result.score}/100 — likely unqualified. ${topWeakness || 'Multiple risk factors.'}`.slice(0, 200);
}

/**
 * Deterministic fallback for explanation tags
 */
export function deriveExplanationTags(result: ScoringEngineResult): string[] {
  const tags: string[] = [];

  for (const cat of result.categories) {
    if (cat.rawScore >= 0.8) {
      tags.push(`Strong ${formatCategoryName(cat.category)}`);
    } else if (cat.rawScore <= 0.3) {
      tags.push(`Weak ${formatCategoryName(cat.category)}`);
    }
  }

  if (result.riskPenalties.length > 0) tags.push('Risk flags present');
  if (result.dataCompleteness < 0.5) tags.push('Incomplete data');

  return tags.slice(0, 5);
}

function formatCategoryName(category: string): string {
  return category.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
}
