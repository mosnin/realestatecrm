/**
 * validateFormConfig is the gate every custom/brokerage intake form passes
 * through before it's stored or rendered (getFormConfig* reject anything it
 * fails). Beyond the per-field Zod types, its superRefine encodes the structural
 * invariants the form engine relies on: the three system fields present + required,
 * unique question IDs, option-bearing question types actually carry options, and
 * visibleWhen only references real, non-self questions. Pin each — a regression
 * here lets a broken form reach a live applicant.
 */

import { describe, it, expect } from 'vitest';
import { validateFormConfig } from '@/lib/form-builder';

// Minimal VALID baseline: one section carrying the three required system fields.
const baseConfig = () => ({
  version: 1,
  leadType: 'rental' as const,
  sections: [
    {
      id: 's1',
      title: 'Basics',
      position: 0,
      questions: [
        { id: 'name', type: 'text', label: 'Name', required: true, position: 0, system: true },
        { id: 'email', type: 'email', label: 'Email', required: true, position: 1, system: true },
        { id: 'phone', type: 'phone', label: 'Phone', required: true, position: 2, system: true },
      ],
    },
  ],
});

// deep clone so each mutation starts from a clean valid config
const clone = () => JSON.parse(JSON.stringify(baseConfig()));

describe('validateFormConfig', () => {
  it('accepts a well-formed config', () => {
    expect(validateFormConfig(baseConfig()).success).toBe(true);
  });

  it('rejects an empty sections array and non-objects', () => {
    expect(validateFormConfig({ version: 1, leadType: 'rental', sections: [] }).success).toBe(false);
    expect(validateFormConfig(null).success).toBe(false);
    expect(validateFormConfig('nope').success).toBe(false);
  });

  it('requires the three system fields present + required when the contact step is on (default)', () => {
    const noPhone = clone();
    noPhone.sections[0].questions = noPhone.sections[0].questions.filter((q: { id: string }) => q.id !== 'phone');
    expect(validateFormConfig(noPhone).success).toBe(false);

    const optionalEmail = clone();
    optionalEmail.sections[0].questions.find((q: { id: string }) => q.id === 'email').required = false;
    expect(validateFormConfig(optionalEmail).success).toBe(false);

    const explicitOn = clone();
    explicitOn.captureContactStep = true;
    expect(validateFormConfig(explicitOn).success).toBe(true);

    const explicitOnMissing = clone();
    explicitOnMissing.captureContactStep = true;
    explicitOnMissing.sections[0].questions = explicitOnMissing.sections[0].questions.filter(
      (q: { id: string }) => q.id !== 'name',
    );
    expect(validateFormConfig(explicitOnMissing).success).toBe(false);
  });

  it('allows configs without the three system questions when captureContactStep is false', () => {
    const off = {
      version: 1,
      leadType: 'rental' as const,
      captureContactStep: false,
      sections: [
        {
          id: 's1',
          title: 'Timing',
          position: 0,
          questions: [
            { id: 'when', type: 'text', label: 'When are you moving?', required: true, position: 0 },
          ],
        },
      ],
    };
    expect(validateFormConfig(off).success).toBe(true);

    const omittedStillRequires = clone();
    omittedStillRequires.sections[0].questions = omittedStillRequires.sections[0].questions.filter(
      (q: { id: string }) => q.id !== 'phone',
    );
    expect(validateFormConfig(omittedStillRequires).success).toBe(false);
  });

  it('rejects duplicate question IDs across sections', () => {
    const dup = clone();
    dup.sections[0].questions.push({ id: 'name', type: 'text', label: 'Dup', required: false, position: 3 });
    expect(validateFormConfig(dup).success).toBe(false);
  });

  it('requires options for select/radio/multi_select questions', () => {
    const noOpts = clone();
    noOpts.sections[0].questions.push({ id: 'pets', type: 'select', label: 'Pets?', required: false, position: 3 });
    expect(validateFormConfig(noOpts).success).toBe(false);

    const withOpts = clone();
    withOpts.sections[0].questions.push({
      id: 'pets', type: 'select', label: 'Pets?', required: false, position: 3,
      options: [{ value: 'y', label: 'Yes' }, { value: 'n', label: 'No' }],
    });
    expect(validateFormConfig(withOpts).success).toBe(true);
  });

  it('rejects visibleWhen pointing at an unknown or self question', () => {
    const unknownRef = clone();
    unknownRef.sections[0].questions.push({
      id: 'q4', type: 'text', label: 'Why', required: false, position: 3,
      visibleWhen: { questionId: 'ghost', operator: 'equals', value: 'x' },
    });
    expect(validateFormConfig(unknownRef).success).toBe(false);

    const selfRef = clone();
    selfRef.sections[0].questions.push({
      id: 'q4', type: 'text', label: 'Why', required: false, position: 3,
      visibleWhen: { questionId: 'q4', operator: 'equals', value: 'x' },
    });
    expect(validateFormConfig(selfRef).success).toBe(false);
  });
});
