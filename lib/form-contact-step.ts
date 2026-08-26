/**
 * Bundled intake contact step (name + email + phone).
 *
 * The public intake asks these together as one first step when
 * `captureContactStep` is omitted or true. The builder toggle persists
 * the flag and adds/removes the locked system questions.
 */

import type { FormQuestion, FormSection, IntakeFormConfig } from '@/lib/types';
import {
  SYSTEM_CONTACT_FIELD_IDS,
  isCaptureContactStepEnabled,
  isSystemContactFieldId,
} from '@/lib/form-config-schema';

export {
  SYSTEM_CONTACT_FIELD_IDS,
  isCaptureContactStepEnabled,
  isSystemContactFieldId,
};

const SYSTEM_NAME_ID = 'name';
const SYSTEM_EMAIL_ID = 'email';
const SYSTEM_PHONE_ID = 'phone';

export const CONTACT_SECTION_ID = 'contact-step-basics';

/** Returns the three locked system fields (name, email, phone) with system: true */
export function generateSystemFields(): FormQuestion[] {
  return [
    {
      id: SYSTEM_NAME_ID,
      type: 'text',
      label: 'What should I call you?',
      placeholder: 'Alex Johnson',
      required: true,
      position: 0,
      system: true,
      validation: { minLength: 1, maxLength: 120 },
    },
    {
      id: SYSTEM_EMAIL_ID,
      type: 'email',
      label: "What's the best email to reach you?",
      placeholder: 'alex@email.com',
      required: true,
      position: 1,
      system: true,
      validation: { maxLength: 255 },
    },
    {
      id: SYSTEM_PHONE_ID,
      type: 'phone',
      label: 'And a phone number?',
      placeholder: '(555) 123-4567',
      required: true,
      position: 2,
      system: true,
      validation: { maxLength: 40 },
    },
  ];
}

function allQuestionIds(sections: FormSection[]): Set<string> {
  const ids = new Set<string>();
  for (const section of sections) {
    for (const question of section.questions) {
      ids.add(question.id);
    }
  }
  return ids;
}

function stripDanglingVisibleWhen(sections: FormSection[]): FormSection[] {
  const ids = allQuestionIds(sections);
  return sections.map((section, index) => {
    let visibleWhen = section.visibleWhen;
    if (visibleWhen && !ids.has(visibleWhen.questionId)) {
      visibleWhen = undefined;
    }
    // The first section is always shown.
    if (index === 0) {
      visibleWhen = undefined;
    }
    const questions = section.questions.map((question) => {
      if (!question.visibleWhen) return question;
      if (!ids.has(question.visibleWhen.questionId)) {
        const { visibleWhen: _removed, ...rest } = question;
        return rest;
      }
      return question;
    });
    return visibleWhen === section.visibleWhen
      ? { ...section, questions }
      : { ...section, questions, visibleWhen };
  });
}

function removeSystemContactFields(config: IntakeFormConfig): IntakeFormConfig {
  const sections = stripDanglingVisibleWhen(
    config.sections
      .map((section) => ({
        ...section,
        questions: section.questions
          .filter((question) => !isSystemContactFieldId(question.id))
          .map((question, position) => ({ ...question, position })),
      }))
      .filter((section) => section.questions.length > 0)
      .map((section, position) => ({ ...section, position })),
  );
  return { ...config, sections };
}

function hasRequiredSystemContactFields(config: IntakeFormConfig): boolean {
  const questions = config.sections.flatMap((section) => section.questions);
  return SYSTEM_CONTACT_FIELD_IDS.every((id) => {
    const question = questions.find((q) => q.id === id);
    return Boolean(question?.system && question.required);
  });
}

/**
 * Turn the bundled contact step on or off and keep the config consistent.
 *
 * ON: ensure the three locked system questions exist (prepend a Basics
 * section when they are missing). OFF: remove those questions so custom
 * questions start first, and persist `captureContactStep: false`.
 */
export function applyCaptureContactStep(
  config: IntakeFormConfig,
  enabled: boolean,
): IntakeFormConfig {
  if (enabled) {
    if (hasRequiredSystemContactFields(config)) {
      return { ...config, captureContactStep: true };
    }
    const cleaned = removeSystemContactFields(config);
    const contactSection: FormSection = {
      id: CONTACT_SECTION_ID,
      title: "Let's start with the basics",
      description: 'We just need a few details to get going.',
      position: 0,
      questions: generateSystemFields(),
    };
    const sections = stripDanglingVisibleWhen(
      [contactSection, ...cleaned.sections].map((section, position) => ({
        ...section,
        position,
      })),
    );
    return { ...cleaned, captureContactStep: true, sections };
  }

  const next = removeSystemContactFields(config);
  return { ...next, captureContactStep: false };
}
