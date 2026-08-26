/**
 * Public intake question queue.
 *
 * Name / email / phone are never asked as three sequential chat turns.
 * When the contact step is ON they become one synthetic bundled step
 * (after the optional lead-type question). When OFF they are skipped.
 */

import type { FormQuestion, IntakeFormConfig } from '@/lib/types';
import {
  isCaptureContactStepEnabled,
  isSystemContactFieldId,
} from '@/lib/form-config-schema';

export const LEAD_TYPE_QUESTION_ID = '__leadType__';
export const CONTACT_STEP_ID = '__contact__';

export const LEAD_TYPE_QUESTION: FormQuestion = {
  id: LEAD_TYPE_QUESTION_ID,
  type: 'radio',
  label: 'Are you looking to rent or buy?',
  required: true,
  position: 0,
  options: [
    { value: 'rental', label: 'Renting' },
    { value: 'buyer', label: 'Buying' },
  ],
};

export const CONTACT_BUNDLE_QUESTION: FormQuestion = {
  id: CONTACT_STEP_ID,
  type: 'text',
  label: "Let's start with the basics",
  description: 'Name, email, and a phone number — then we can get into the rest.',
  required: true,
  position: 0,
  system: true,
};

export function flattenQuestions(
  config: IntakeFormConfig | null | undefined,
): FormQuestion[] {
  if (!config) return [];
  const sections = [...config.sections].sort((a, b) => a.position - b.position);
  return sections.flatMap((section) =>
    [...section.questions].sort((a, b) => a.position - b.position),
  );
}

/**
 * Build the applicant-facing question queue.
 *
 * Individual `name` / `email` / `phone` questions are stripped so they are
 * never asked one-at-a-time. When the contact step is enabled and a config
 * is present, a single bundled step is inserted after the optional
 * lead-type question.
 */
export function buildIntakeQuestionList(args: {
  config: IntakeFormConfig | null;
  includeLeadType?: boolean;
}): FormQuestion[] {
  const withoutContactFields = flattenQuestions(args.config).filter(
    (question) => !isSystemContactFieldId(question.id),
  );
  const prefix: FormQuestion[] = [];
  if (args.includeLeadType) {
    prefix.push(LEAD_TYPE_QUESTION);
  }
  if (args.config && isCaptureContactStepEnabled(args.config)) {
    prefix.push(CONTACT_BUNDLE_QUESTION);
  }
  return [...prefix, ...withoutContactFields];
}

export function isSyntheticIntakeQuestionId(id: string): boolean {
  return id === LEAD_TYPE_QUESTION_ID || id === CONTACT_STEP_ID;
}
