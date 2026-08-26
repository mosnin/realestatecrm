/**
 * Public intake question queue: the bundled contact step is one visible step
 * when the flag is ON (default), and is skipped when the flag is OFF.
 * Individual name/email/phone questions never appear as sequential turns.
 */

import { describe, it, expect } from 'vitest';
import {
  buildIntakeQuestionList,
  CONTACT_STEP_ID,
  LEAD_TYPE_QUESTION_ID,
} from '@/lib/intake-question-list';
import { generateSystemFields } from '@/lib/form-contact-step';
import type { IntakeFormConfig } from '@/lib/types';

const customQuestion = {
  id: 'when',
  type: 'text' as const,
  label: 'When are you moving?',
  required: true,
  position: 0,
};

function config(overrides: Partial<IntakeFormConfig> = {}): IntakeFormConfig {
  return {
    version: 1,
    leadType: 'rental',
    sections: [
      {
        id: 'basics',
        title: 'Basics',
        position: 0,
        questions: generateSystemFields(),
      },
      {
        id: 'timing',
        title: 'Timing',
        position: 1,
        questions: [customQuestion],
      },
    ],
    ...overrides,
  };
}

describe('buildIntakeQuestionList', () => {
  it('includes one bundled contact step (not three turns) when the flag is omitted or true', () => {
    for (const captureContactStep of [undefined, true] as const) {
      const list = buildIntakeQuestionList({
        config: config(captureContactStep === undefined ? {} : { captureContactStep }),
      });
      const ids = list.map((q) => q.id);
      expect(ids).toEqual([CONTACT_STEP_ID, 'when']);
      expect(ids).not.toContain('name');
      expect(ids).not.toContain('email');
      expect(ids).not.toContain('phone');
    }
  });

  it('skips the bundled contact step when captureContactStep is false', () => {
    const list = buildIntakeQuestionList({
      config: {
        version: 1,
        leadType: 'rental',
        captureContactStep: false,
        sections: [
          {
            id: 'timing',
            title: 'Timing',
            position: 0,
            questions: [customQuestion],
          },
        ],
      },
    });
    expect(list.map((q) => q.id)).toEqual(['when']);
    expect(list.some((q) => q.id === CONTACT_STEP_ID)).toBe(false);
  });

  it('skips leftover name/email/phone questions when the step is off', () => {
    const list = buildIntakeQuestionList({
      config: config({ captureContactStep: false }),
    });
    expect(list.map((q) => q.id)).toEqual(['when']);
  });

  it('places the lead-type question first, then the bundled contact step', () => {
    const list = buildIntakeQuestionList({
      config: config(),
      includeLeadType: true,
    });
    expect(list.map((q) => q.id)).toEqual([
      LEAD_TYPE_QUESTION_ID,
      CONTACT_STEP_ID,
      'when',
    ]);
  });

  it('does not inject a contact step while the config is still unknown', () => {
    const list = buildIntakeQuestionList({
      config: null,
      includeLeadType: true,
    });
    expect(list.map((q) => q.id)).toEqual([LEAD_TYPE_QUESTION_ID]);
  });
});
