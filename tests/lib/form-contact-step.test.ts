/**
 * applyCaptureContactStep is what the builder toggle calls. Pin ON → locked
 * system fields present as the first step, OFF → those questions removed and
 * captureContactStep: false persisted. Existing configs without the flag
 * behave as ON.
 */

import { describe, it, expect } from 'vitest';
import { validateFormConfig } from '@/lib/form-builder';
import {
  applyCaptureContactStep,
  generateSystemFields,
  isCaptureContactStepEnabled,
} from '@/lib/form-contact-step';
import type { IntakeFormConfig } from '@/lib/types';

const withContact: IntakeFormConfig = {
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
      questions: [
        { id: 'when', type: 'text', label: 'When are you moving?', required: true, position: 0 },
      ],
    },
  ],
};

function questionIds(config: IntakeFormConfig): string[] {
  return config.sections.flatMap((s) => s.questions.map((q) => q.id));
}

describe('isCaptureContactStepEnabled', () => {
  it('treats omit / undefined / true as ON and only explicit false as OFF', () => {
    expect(isCaptureContactStepEnabled(undefined)).toBe(true);
    expect(isCaptureContactStepEnabled(null)).toBe(true);
    expect(isCaptureContactStepEnabled({})).toBe(true);
    expect(isCaptureContactStepEnabled({ captureContactStep: true })).toBe(true);
    expect(isCaptureContactStepEnabled({ captureContactStep: false })).toBe(false);
  });
});

describe('applyCaptureContactStep', () => {
  it('turns the step OFF: removes name/email/phone, persists false, keeps custom questions first', () => {
    const next = applyCaptureContactStep(withContact, false);
    expect(next.captureContactStep).toBe(false);
    expect(questionIds(next)).toEqual(['when']);
    expect(next.sections[0].id).toBe('timing');
    expect(validateFormConfig(next).success).toBe(true);
    expect(isCaptureContactStepEnabled(next)).toBe(false);
  });

  it('turns the step ON: restores locked system fields as the first step', () => {
    const off = applyCaptureContactStep(withContact, false);
    const on = applyCaptureContactStep(off, true);
    expect(on.captureContactStep).toBe(true);
    expect(questionIds(on)).toEqual(expect.arrayContaining(['name', 'email', 'phone', 'when']));
    expect(on.sections[0].questions.map((q) => q.id)).toEqual(['name', 'email', 'phone']);
    expect(on.sections[0].questions.every((q) => q.system && q.required)).toBe(true);
    expect(validateFormConfig(on).success).toBe(true);
  });

  it('is a no-op for fields when they already exist and the flag is turned ON', () => {
    const next = applyCaptureContactStep(withContact, true);
    expect(next.captureContactStep).toBe(true);
    expect(questionIds(next)).toEqual(questionIds(withContact));
    expect(next.sections[0].id).toBe('basics');
  });

  it('leaves other questions in a mixed first section when turning OFF', () => {
    const mixed: IntakeFormConfig = {
      version: 1,
      leadType: 'rental',
      sections: [
        {
          id: 'contact-info',
          title: 'Contact',
          position: 0,
          questions: [
            ...generateSystemFields(),
            { id: 'dob', type: 'date', label: 'Date of birth', required: false, position: 3 },
          ],
        },
      ],
    };
    const next = applyCaptureContactStep(mixed, false);
    expect(questionIds(next)).toEqual(['dob']);
    expect(next.sections).toHaveLength(1);
    expect(validateFormConfig(next).success).toBe(true);
  });
});
