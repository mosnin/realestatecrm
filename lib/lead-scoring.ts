/**
 * Lead Scoring — public API consumed by API routes and server actions.
 *
 * Every lead is scored DYNAMICALLY against the actual intake form config and
 * the applicant's answers (lib/dynamic-lead-scoring.ts). There is no hardcoded
 * field scoring: the score always reflects the real questions the form asked.
 *
 * When a caller has no stored form config (e.g. a contact captured before a
 * snapshot existed) we fall back to the default intake template the public
 * form renders, so scoring still runs against a coherent question set.
 */

import { scoreDynamicApplication } from '@/lib/dynamic-lead-scoring';
import { getDefaultFormConfig } from '@/lib/form-builder';
import type { IntakeFormConfig, LeadScoreDetails } from '@/lib/types';
import type { ScoringModel } from '@/lib/scoring/scoring-model-types';

export type LeadScoringResult = {
  scoringStatus: 'scored' | 'failed' | 'pending';
  leadScore: number | null;
  scoreLabel: string;
  scoreSummary: string | null;
  scoreDetails: LeadScoreDetails | null;
};

/**
 * Score a lead against a dynamic intake form.
 *
 * `formConfig` should be the config the submission was captured with. If it is
 * null, we resolve the default template for the lead type so scoring always has
 * a real question set to work from.
 */
export async function scoreLeadApplicationDynamic(input: {
  contactId: string;
  formConfig: IntakeFormConfig | null;
  answers?: Record<string, string | string[] | number | boolean>;
  leadType?: 'rental' | 'buyer' | 'general';
  scoringModel?: ScoringModel | null;
}): Promise<LeadScoringResult> {
  const normalizedLeadType: 'rental' | 'buyer' =
    input.leadType === 'buyer'
      ? 'buyer'
      : input.leadType === 'rental'
        ? 'rental'
        : input.formConfig?.leadType === 'buyer'
          ? 'buyer'
          : 'rental';

  // Always score against a real intake form config. When a submission has no
  // stored config, use the default template the public intake renders so the
  // score reflects the actual questions asked — never a hardcoded field set.
  const formConfig = input.formConfig ?? getDefaultFormConfig(normalizedLeadType);
  const answers = input.answers ?? {};

  return scoreDynamicApplication({
    contactId: input.contactId,
    formConfig,
    answers,
    leadType: normalizedLeadType,
    scoringModel: input.scoringModel ?? undefined,
  });
}
