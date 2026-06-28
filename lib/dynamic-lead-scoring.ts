/**
 * Dynamic Lead Scoring — for custom/dynamic intake forms.
 *
 * Hybrid approach:
 *   1. Deterministic rule-based score from explicit answer mappings (instant)
 *   2. AI enhancement via GPT-4o-mini for qualitative assessment
 *   3. Blended final score with tier assignment
 *
 * Falls back gracefully at every step — never blocks form submission.
 */

import {
  buildDynamicScoringPrompt,
  buildDynamicSystemPrompt,
} from '@/lib/scoring/dynamic-prompt-builder';
import type { IntakeFormConfig, LeadScoreDetails } from '@/lib/types';
import type { LeadScoringResult } from '@/lib/lead-scoring';

type DynamicScoringInput = {
  contactId: string;
  formConfig: IntakeFormConfig;
  answers: Record<string, string | string[] | number | boolean>;
  leadType: string;
};

type AIScoreResponse = {
  leadScore: number;
  scoreLabel: string;
  scoreSummary: string;
  scoreDetails: {
    tags: string[];
    strengths: string[];
    weaknesses: string[];
    riskFlags: string[];
  };
};

// ── Tier assignment (same thresholds as existing engine) ─────────────────

function assignTier(score: number): 'hot' | 'warm' | 'cold' {
  if (score >= 75) return 'hot';
  if (score >= 45) return 'warm';
  return 'cold';
}

function tierToLabel(tier: string): 'hot' | 'warm' | 'cold' | 'unscored' {
  if (tier === 'hot') return 'hot';
  if (tier === 'warm') return 'warm';
  if (tier === 'cold') return 'cold';
  return 'unscored';
}

// ── LLM client (OpenRouter-first, via the shared factory) ─────────────────
// Routes through `lib/llm.ts` like every other LLM call in the app, so lead
// scoring runs on OpenRouter when configured (the default provider) instead
// of demanding a separate OpenAI API key. Lazy-imported to keep the openai
// SDK out of bundles that only need the deterministic scorer. Returns the
// provider-correct model slug alongside the client.

async function getScoringClient() {
  const { getLLMClient, openaiModel } = await import('@/lib/llm');
  return { client: getLLMClient(), model: openaiModel('gpt-4.1-mini') };
}

// ── AI scoring call ──────────────────────────────────────────────────────

/**
 * Pull the score object out of a model response and parse it. Tolerant of code
 * fences and surrounding prose (the json_object retry can wrap the JSON), so a
 * cosmetically-imperfect response still yields a score instead of throwing.
 * Returns null only when there's no parseable object with a numeric leadScore.
 *
 * Exported for unit tests — the lenient extraction is the safety net that keeps
 * a single finicky completion from sinking the whole re-score into 'failed'.
 */
export function extractScoreJson(raw: string): AIScoreResponse | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof (parsed as AIScoreResponse).leadScore !== 'number'
  ) {
    return null;
  }
  const result = parsed as AIScoreResponse;
  // Clamp AI score to 0-100.
  result.leadScore = Math.max(0, Math.min(100, Math.round(result.leadScore)));
  return result;
}

async function getAIScore(input: {
  formConfig: IntakeFormConfig;
  answers: Record<string, string | string[] | number | boolean>;
  leadType: string;
  deterministicScore: number | null;
}): Promise<AIScoreResponse | null> {
  const { client: openai, model } = await getScoringClient();

  const userPrompt = buildDynamicScoringPrompt({
    formConfig: input.formConfig,
    answers: input.answers,
    deterministicScore: input.deterministicScore,
  });

  const systemPrompt = buildDynamicSystemPrompt({
    leadType: input.leadType,
    hasDeterministicScore: input.deterministicScore !== null,
  });

  // Two attempts. The strict json_schema is the happy path; if the active
  // provider/model rejects strict structured output OR the response doesn't
  // parse, fall back to plain json_object mode + a lenient extract. A single
  // finicky completion must not collapse the whole re-score into a dead
  // 'failed' with no score (the bug this guards against). max_tokens is 900 —
  // 400 truncated the summary + four arrays mid-JSON, which then failed to
  // parse and returned null.
  for (const useSchema of [true, false] as const) {
    try {
      const response = await openai.chat.completions.create({
        model,
        temperature: 0,
        max_tokens: 900,
        response_format: useSchema
          ? {
              type: 'json_schema',
              json_schema: {
                name: 'dynamic_lead_score',
                strict: true,
                schema: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    leadScore: { type: 'number' },
                    scoreLabel: { type: 'string', enum: ['hot', 'warm', 'cold'] },
                    scoreSummary: { type: 'string' },
                    scoreDetails: {
                      type: 'object',
                      additionalProperties: false,
                      properties: {
                        tags: { type: 'array', items: { type: 'string' } },
                        strengths: { type: 'array', items: { type: 'string' } },
                        weaknesses: { type: 'array', items: { type: 'string' } },
                        riskFlags: { type: 'array', items: { type: 'string' } },
                      },
                      required: ['tags', 'strengths', 'weaknesses', 'riskFlags'],
                    },
                  },
                  required: ['leadScore', 'scoreLabel', 'scoreSummary', 'scoreDetails'],
                },
              },
            }
          : { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });

      const raw = response.choices?.[0]?.message?.content;
      if (!raw) continue;
      const parsed = extractScoreJson(raw);
      if (parsed) return parsed;
    } catch (error) {
      console.warn('[dynamic-lead-scoring] AI scoring attempt failed', {
        useSchema,
        error,
      });
    }
  }

  console.warn('[dynamic-lead-scoring] AI scoring unavailable after retries');
  return null;
}

// ── Data completeness from form config ───────────────────────────────────

function computeFormCompleteness(
  formConfig: IntakeFormConfig,
  answers: Record<string, string | string[] | number | boolean>,
): number {
  let totalQuestions = 0;
  let answeredQuestions = 0;

  for (const section of formConfig.sections) {
    for (const question of section.questions) {
      totalQuestions++;
      const answer = answers[question.id];
      if (answer !== undefined && answer !== null && answer !== '') {
        answeredQuestions++;
      }
    }
  }

  if (totalQuestions === 0) return 0;
  return Math.round((answeredQuestions / totalQuestions) * 100) / 100;
}

// ── Missing required fields ──────────────────────────────────────────────

function collectMissingRequired(
  formConfig: IntakeFormConfig,
  answers: Record<string, string | string[] | number | boolean>,
): string[] {
  const missing: string[] = [];
  for (const section of formConfig.sections) {
    for (const question of section.questions) {
      if (!question.required) continue;
      const answer = answers[question.id];
      if (answer === undefined || answer === null || answer === '') {
        missing.push(question.label);
      }
    }
  }
  return missing.slice(0, 5);
}

// ── Derive recommended next action ──────────────────────────────────────

function deriveNextAction(tier: string, leadType: string): string {
  if (leadType === 'buyer') {
    if (tier === 'hot') return 'Schedule showing or buyer consultation within 2 hours';
    if (tier === 'warm') return 'Send property listings and follow up within 24 hours';
    return 'Add to nurture campaign with market updates';
  }
  // rental / general
  if (tier === 'hot') return 'Schedule tour or call within 2 hours';
  if (tier === 'warm') return 'Send follow-up within 24 hours';
  return 'Add to weekly follow-up queue';
}

// ── Derive lead state ────────────────────────────────────────────────────

function deriveLeadState(
  tier: string,
  leadType: string,
  completeness: number,
  missingCount: number,
): string {
  if (completeness < 0.3) return 'incomplete_application';
  if (missingCount >= 3) return 'needs_additional_info';

  if (leadType === 'buyer') {
    if (tier === 'hot') return 'high_priority_qualified_buyer';
    if (tier === 'warm') return 'qualified_buyer_low_urgency';
    return 'likely_unqualified';
  }

  if (tier === 'hot') return 'high_priority_qualified_renter';
  if (tier === 'warm') return 'qualified_low_urgency';
  return 'likely_unqualified';
}

// ═══════════════════════════════════════════════════════════════════════════
// Main entry point
// ═══════════════════════════════════════════════════════════════════════════

export async function scoreDynamicApplication(
  input: DynamicScoringInput,
): Promise<LeadScoringResult> {
  const { contactId, formConfig, answers, leadType } = input;

  console.info('[dynamic-lead-scoring] start', { contactId, leadType });

  try {
    // Score purely on the AI's qualitative assessment of the real answers.
    //
    // The previous hybrid blended an AI-generated deterministic "model" score
    // at up to 80% weight. That model was keyed on the form-builder's question
    // ids while live submissions are keyed on the rendered form's ids, so the
    // model matched nothing, scored 0, and dragged genuinely strong applicants
    // down to ~17/cold (0×0.8 + ai×0.2). The deterministic path is removed:
    // the AI reads the actual questions + answers and returns the score. One
    // source of truth, no silent override.
    const aiResult = await getAIScore({
      formConfig,
      answers,
      leadType,
      deterministicScore: null,
    });

    console.info('[dynamic-lead-scoring] AI score', {
      contactId,
      aiScore: aiResult?.leadScore ?? null,
      aiAvailable: aiResult !== null,
    });

    if (!aiResult) {
      console.warn('[dynamic-lead-scoring] AI scoring unavailable', { contactId });
      return failedResult();
    }

    const finalScore = Math.max(0, Math.min(100, aiResult.leadScore));
    const scoreSource = 'ai';
    const tier = assignTier(finalScore);

    // ── Assemble LeadScoreDetails ───────────────────────────────────────
    const completeness = computeFormCompleteness(formConfig, answers);
    const missingRequired = collectMissingRequired(formConfig, answers);

    const summary =
      aiResult?.scoreSummary?.slice(0, 200) ??
      `Lead scored ${finalScore}/100 (${tier}) via ${scoreSource} scoring.`;

    const explanationTags = aiResult?.scoreDetails?.tags?.slice(0, 5) ?? [];
    const strengths = aiResult?.scoreDetails?.strengths?.slice(0, 5) ?? [];
    const weaknesses = aiResult?.scoreDetails?.weaknesses?.slice(0, 5) ?? [];
    const riskFlags = aiResult?.scoreDetails?.riskFlags?.slice(0, 5) ?? [];

    const qualificationStatus =
      tier === 'hot' || tier === 'warm' ? 'qualified' : 'needs_review';
    const readinessStatus =
      tier === 'hot' ? 'ready_now' : 'not_immediate';

    const details: LeadScoreDetails = {
      score: finalScore,
      priorityTier: tier === 'hot' ? 'hot' : tier === 'warm' ? 'warm' : 'cold',
      qualificationStatus,
      readinessStatus,
      confidence: completeness,
      summary,
      explanationTags,
      strengths,
      weaknesses,
      riskFlags,
      missingInformation: missingRequired,
      recommendedNextAction: aiResult?.scoreDetails
        ? deriveNextAction(tier, leadType)
        : deriveNextAction(tier, leadType),
      leadState: deriveLeadState(tier, leadType, completeness, missingRequired.length),
    };

    console.info('[dynamic-lead-scoring] complete', {
      contactId,
      finalScore,
      tier,
      scoreSource,
      completeness,
    });

    return {
      scoringStatus: 'scored',
      leadScore: finalScore,
      scoreLabel: tierToLabel(tier),
      scoreSummary: summary.slice(0, 300),
      scoreDetails: details,
    };
  } catch (error) {
    console.error('[dynamic-lead-scoring] failed', { contactId, error });
    return failedResult();
  }
}

function failedResult(): LeadScoringResult {
  return {
    scoringStatus: 'failed',
    leadScore: null,
    scoreLabel: 'unscored',
    scoreSummary: 'Scoring unavailable right now. Lead saved.',
    scoreDetails: null,
  };
}
