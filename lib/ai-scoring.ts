/**
 * AI-powered rental lead scoring service.
 *
 * Uses OpenAI Responses API with structured JSON output to score
 * rental applications for follow-up priority.
 *
 * Privacy contract:
 * - ONLY non-sensitive derived fields are sent to OpenAI.
 * - Raw names, email, phone, DOB, SSN fragments, addresses, landlord
 *   contact info, employer names, signatures, and freeform notes are
 *   NEVER included in the payload.
 * - Income is rounded to the nearest $500 bucket.
 * - Move reason is categorized, not sent as raw text.
 */

import OpenAI from 'openai';
import { db } from '@/lib/db';

const SCORING_VERSION = 'v1';
const MODEL = 'gpt-4o-mini';

// ─── OpenAI client (reuses existing pattern from lib/embeddings.ts) ──────────

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

// ─── Sanitized payload type (safe to send to external APIs) ──────────────────

export interface SanitizedScoringPayload {
  // Property context — no raw addresses
  rent_bucket: string | null;
  unit_type: string | null;
  move_in_proximity: string | null;
  lease_term: string | null;

  // Household
  adults_count: number | null;
  dependents_count: number | null;
  total_occupants: number | null;

  // Income & affordability — income rounded, not exact
  employment_status: string | null;
  gross_income_rounded: number | null;
  has_additional_income: boolean | null;
  rent_to_income_ratio: number | null;
  affordability_band: 'high' | 'moderate' | 'low' | 'insufficient' | null;

  // Rental readiness — no raw address text
  housing_status: string | null;
  residence_duration_bucket: string | null;
  move_reason_category: string | null; // categorized, NOT raw text

  // Rental history signals — boolean flags only
  has_late_payments: boolean | null;
  has_lease_violations: boolean | null;
  has_landlord_balances: boolean | null;
  has_prior_evictions: boolean | null;

  // Screening & logistics
  has_pets: boolean | null;
  is_smoker: boolean | null;
  background_consent: boolean | null;
  doc_completeness_pct: number; // 0–100

  // Meta
  lead_source: 'rental_application';
  application_completion_pct: number;
  completed_steps_count: number;
  total_steps: 7;
  application_status: string;
}

// ─── Scoring result shape (from OpenAI) ──────────────────────────────────────

export interface AIScoringResult {
  score: number;
  priority_label: 'hot' | 'warm' | 'cold' | 'review';
  summary: string;
  reason_tags: string[];
  watchouts: string[];
  confidence: 'low' | 'medium' | 'high';
}

// ─── Payload builder (sanitizer) ─────────────────────────────────────────────

function bucketRent(rent: number | null): string | null {
  if (!rent) return null;
  if (rent < 1000) return 'under_1000';
  if (rent < 1500) return '1000_to_1500';
  if (rent < 2000) return '1500_to_2000';
  if (rent < 3000) return '2000_to_3000';
  return 'over_3000';
}

function bucketMoveInProximity(targetMoveIn: Date | string | null): string | null {
  if (!targetMoveIn) return null;
  const days = Math.ceil(
    (new Date(targetMoveIn).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  if (days <= 0) return 'overdue_or_immediate';
  if (days <= 15) return 'within_15_days';
  if (days <= 30) return 'within_30_days';
  if (days <= 60) return '1_to_2_months';
  if (days <= 90) return '2_to_3_months';
  return '3_plus_months';
}

function bucketResidenceDuration(lengthAtAddress: string | null): string | null {
  if (!lengthAtAddress) return null;
  const lower = lengthAtAddress.toLowerCase();
  if (lower.includes('less') || lower.includes('<')) return 'under_6_months';
  if (lower.includes('6') && lower.includes('12')) return '6_to_12_months';
  if (lower.includes('1') && lower.includes('2') && lower.includes('year')) return '1_to_2_years';
  if (lower.includes('2') && lower.includes('5')) return '2_to_5_years';
  if (lower.includes('5+') || lower.includes('5 +') || lower.includes('over 5')) return '5_plus_years';
  return null;
}

function categorizeMovingReason(reasonForMoving: string | null): string | null {
  if (!reasonForMoving) return null;
  const lower = reasonForMoving.toLowerCase();
  if (/\b(job|work|relocat|transfer|career)\b/.test(lower)) return 'relocation';
  if (/\b(space|room|size|bigger|smaller|crowd)\b/.test(lower)) return 'space';
  if (/\b(cost|afford|price|rent|expensive|cheap)\b/.test(lower)) return 'affordability';
  if (/\b(family|children|school|kid|parent)\b/.test(lower)) return 'family';
  if (/\b(neighbor|area|location|commute|safe)\b/.test(lower)) return 'location';
  if (/\b(evict|end|expir|lease|terminat)\b/.test(lower)) return 'lease_ending';
  return 'other';
}

function roundIncome(income: number | null): number | null {
  if (!income || income <= 0) return null;
  return Math.round(income / 500) * 500;
}

function affordabilityBand(
  income: number | null,
  rent: number | null
): 'high' | 'moderate' | 'low' | 'insufficient' | null {
  if (!income || !rent) return null;
  const ratio = income / rent;
  if (ratio >= 4) return 'high';
  if (ratio >= 3) return 'moderate';
  if (ratio >= 2) return 'low';
  return 'insufficient';
}

/**
 * Builds a sanitized scoring payload from application data.
 * NO personally identifiable information is included.
 */
export function buildSanitizedPayload(
  application: {
    monthlyRent: number | null;
    unitType: string | null;
    targetMoveIn: Date | string | null;
    leaseTerm: string | null;
    occupantCount: number | null;
    status: string;
    completedSteps: string[];
  },
  applicant: {
    monthlyGrossIncome: number | null;
    additionalIncome: number | null;
    employmentStatus: string | null;
    housingStatus: string | null;
    lengthAtAddress: string | null;
    reasonForMoving: string | null;
    adultsOnApp: number | null;
    children: number | null;
    roommates: number | null;
    latePayments: number | null;
    leaseViolations: boolean | null;
    outstandingBalances: boolean | null;
    priorEvictions: boolean | null;
    hasPets: boolean | null;
    smokingDeclaration: boolean | null;
    backgroundConsent: boolean | null;
    // Document checklist confirmations (from wizard step 7)
    hasGovId?: boolean | null;
    hasPayStubs?: boolean | null;
    hasBankStatements?: boolean | null;
    screeningConsent?: boolean | null;
    truthCertification?: boolean | null;
  } | null
): SanitizedScoringPayload {
  const totalIncome =
    (applicant?.monthlyGrossIncome ?? 0) + (applicant?.additionalIncome ?? 0);

  // Document completeness: step 7 checklist (3 items)
  let docCount = 0;
  if (applicant?.hasGovId) docCount++;
  if (applicant?.hasPayStubs) docCount++;
  if (applicant?.hasBankStatements) docCount++;
  const docPct = Math.round((docCount / 3) * 100);

  // Application step completion
  const completedCount = application.completedSteps.length;
  const completionPct = Math.round((completedCount / 7) * 100);

  const rentToIncomeRatio =
    application.monthlyRent && totalIncome > 0
      ? Math.round((totalIncome / application.monthlyRent) * 100) / 100
      : null;

  return {
    // Property — no raw address
    rent_bucket: bucketRent(application.monthlyRent),
    unit_type: application.unitType,
    move_in_proximity: bucketMoveInProximity(application.targetMoveIn),
    lease_term: application.leaseTerm,

    // Household
    adults_count: applicant?.adultsOnApp ?? null,
    dependents_count: applicant?.children ?? null,
    total_occupants: application.occupantCount,

    // Income — rounded, not exact
    employment_status: applicant?.employmentStatus ?? null,
    gross_income_rounded: roundIncome(totalIncome || null),
    has_additional_income:
      applicant?.additionalIncome != null ? applicant.additionalIncome > 0 : null,
    rent_to_income_ratio: rentToIncomeRatio,
    affordability_band: affordabilityBand(totalIncome || null, application.monthlyRent),

    // Rental readiness — no raw addresses
    housing_status: applicant?.housingStatus ?? null,
    residence_duration_bucket: bucketResidenceDuration(applicant?.lengthAtAddress ?? null),
    move_reason_category: categorizeMovingReason(applicant?.reasonForMoving ?? null),

    // History signals — flags only
    has_late_payments:
      applicant?.latePayments != null ? applicant.latePayments > 0 : null,
    has_lease_violations: applicant?.leaseViolations ?? null,
    has_landlord_balances: applicant?.outstandingBalances ?? null,
    has_prior_evictions: applicant?.priorEvictions ?? null,

    // Screening
    has_pets: applicant?.hasPets ?? null,
    is_smoker: applicant?.smokingDeclaration ?? null,
    background_consent: applicant?.backgroundConsent ?? null,
    doc_completeness_pct: docPct,

    // Meta
    lead_source: 'rental_application',
    application_completion_pct: completionPct,
    completed_steps_count: completedCount,
    total_steps: 7,
    application_status: application.status,
  };
}

// ─── OpenAI Responses API call ────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a rental lead triage assistant for independent realtors. Score follow-up priority for a renter lead using only the structured, non-sensitive data provided.

You are NOT making a legal decision, tenant approval decision, credit decision, or fair housing determination. This score is for internal workflow prioritization only.

Score based on practical sales and workflow signals:
1. Affordability relative to rent (rent-to-income ratio and affordability band)
2. Move timing and urgency
3. Application completeness and document readiness
4. Income and housing stability signals
5. Presence of friction flags (evictions, balances, violations)
6. Follow-up conversion readiness

Rules:
- Be conservative and explainable
- Do not infer or mention protected class characteristics
- Do not make claims of certainty
- Keep summary to 1-3 concise, practical sentences a realtor can scan quickly
- Reason tags should be short actionable phrases (3-5 words max each)
- Watchouts should flag items that need realtor follow-up before committing effort
- If data is missing or incomplete, lower confidence and note it in summary
- Score 0-100 where 80+ is hot, 60-79 is warm, 40-59 is cold, below 40 is review`;

async function callOpenAIScoring(
  payload: SanitizedScoringPayload
): Promise<AIScoringResult> {
  const openai = getOpenAI();

  const response = await openai.responses.create({
    model: MODEL,
    instructions: SYSTEM_PROMPT,
    input: `Here is the sanitized lead payload:\n${JSON.stringify(payload, null, 2)}`,
    text: {
      format: {
        type: 'json_schema',
        name: 'lead_score',
        strict: true,
        schema: {
          type: 'object' as const,
          properties: {
            score: {
              type: 'integer' as const,
              description: 'Priority score 0-100',
            },
            priority_label: {
              type: 'string' as const,
              enum: ['hot', 'warm', 'cold', 'review'],
            },
            summary: {
              type: 'string' as const,
              description: '1-3 sentences, concise, practical, no legal claims',
            },
            reason_tags: {
              type: 'array' as const,
              items: { type: 'string' as const },
              description: 'Short positive signal phrases',
            },
            watchouts: {
              type: 'array' as const,
              items: { type: 'string' as const },
              description: 'Items requiring realtor follow-up',
            },
            confidence: {
              type: 'string' as const,
              enum: ['low', 'medium', 'high'],
            },
          },
          required: [
            'score',
            'priority_label',
            'summary',
            'reason_tags',
            'watchouts',
            'confidence',
          ],
          additionalProperties: false,
        },
      },
    },
  });

  const parsed = JSON.parse(response.output_text) as AIScoringResult;

  // Clamp score to valid range
  parsed.score = Math.max(0, Math.min(100, Math.round(parsed.score)));

  return parsed;
}

// ─── Retry helper ─────────────────────────────────────────────────────────────

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 1000
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, baseDelayMs * attempt));
      }
    }
  }
  throw lastError;
}

// ─── Main scoring entry point ─────────────────────────────────────────────────

/**
 * Score a rental application with AI and persist the results.
 * Safe to call fire-and-forget (catches and logs all errors).
 *
 * Does NOT block submission — call without await after the DB finalization.
 */
export async function scoreApplicationWithAI(applicationId: string): Promise<void> {
  console.log('[analytics]', 'scoring_requested', { applicationId });

  try {
    // Fetch just what we need (no PII exposure in this function's scope)
    const application = await db.rentalApplication.findUnique({
      where: { id: applicationId },
      include: {
        applicants: { where: { isPrimary: true }, take: 1 },
      },
    });

    if (!application) {
      console.error('[ai-scoring] Application not found:', applicationId);
      return;
    }

    const applicant = application.applicants[0] ?? null;

    // Build sanitized payload (no PII)
    const payload = buildSanitizedPayload(application, applicant);

    // Call OpenAI with retry
    const result = await withRetry(() => callOpenAIScoring(payload));

    // Persist results
    await db.rentalApplication.update({
      where: { id: applicationId },
      data: {
        aiScore: result.score,
        aiPriorityLabel: result.priority_label,
        aiSummary: result.summary,
        aiReasonTags: result.reason_tags,
        aiWatchouts: result.watchouts,
        aiConfidence: result.confidence,
        aiScoredAt: new Date(),
        aiScoringVersion: SCORING_VERSION,
        aiScoringPayload: payload as never,
      },
    });

    console.log('[analytics]', 'scoring_succeeded', {
      applicationId,
      score: result.score,
      priority_label: result.priority_label,
      confidence: result.confidence,
    });
  } catch (err) {
    console.error('[ai-scoring] Scoring failed for', applicationId, err);
    console.log('[analytics]', 'scoring_failed', {
      applicationId,
      error: err instanceof Error ? err.message : String(err),
    });
    // Do not rethrow — scoring failure must never break the submission flow
  }
}
