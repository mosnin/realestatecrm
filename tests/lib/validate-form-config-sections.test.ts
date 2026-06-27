/**
 * Section-level visibleWhen has stricter rules than question-level: a section
 * holding any system field (name/email/phone) must NEVER be conditional, and a
 * section can only reveal based on a question from an EARLIER section (no forward
 * references, no cycles). These guard the multi-step form engine — a forward or
 * system-field condition could hide the fields the applicant must fill. Pin them
 * (the question-level rules are covered in validate-form-config.test.ts).
 */

import { describe, it, expect } from 'vitest';
import { validateFormConfig } from '@/lib/form-builder';

// Section 0 carries the system fields; sections 1+ carry normal questions.
const baseConfig = () => ({
  version: 1,
  leadType: 'rental' as const,
  sections: [
    {
      id: 's0',
      title: 'Basics',
      position: 0,
      questions: [
        { id: 'name', type: 'text', label: 'Name', required: true, position: 0, system: true },
        { id: 'email', type: 'email', label: 'Email', required: true, position: 1, system: true },
        { id: 'phone', type: 'phone', label: 'Phone', required: true, position: 2, system: true },
        { id: 'hasPets', type: 'checkbox', label: 'Pets?', required: false, position: 3 },
      ],
    },
    {
      id: 's1',
      title: 'About you',
      position: 1,
      questions: [{ id: 'note', type: 'text', label: 'Note', required: false, position: 0 }],
    },
    {
      id: 's2',
      title: 'Pet details',
      position: 2,
      questions: [{ id: 'petName', type: 'text', label: 'Pet name', required: false, position: 0 }],
    },
  ],
});

const clone = () => JSON.parse(JSON.stringify(baseConfig()));
const visibleWhen = (questionId: string) => ({ questionId, operator: 'equals' as const, value: 'yes' });

describe('validateFormConfig — section visibleWhen', () => {
  it('accepts a section that reveals based on an EARLIER-section question', () => {
    const cfg = clone();
    cfg.sections[2].visibleWhen = visibleWhen('hasPets'); // s2 depends on s0's question
    expect(validateFormConfig(cfg).success).toBe(true);
  });

  it('rejects a conditional section that contains system fields', () => {
    const cfg = clone();
    cfg.sections[0].visibleWhen = visibleWhen('note'); // s0 holds name/email/phone
    expect(validateFormConfig(cfg).success).toBe(false);
  });

  it('rejects a section visibleWhen referencing an unknown question', () => {
    const cfg = clone();
    cfg.sections[2].visibleWhen = visibleWhen('ghost');
    expect(validateFormConfig(cfg).success).toBe(false);
  });

  it('rejects a forward reference to a LATER section', () => {
    const cfg = clone();
    cfg.sections[1].visibleWhen = visibleWhen('petName'); // s1 depends on s2 (later) -> cycle risk
    expect(validateFormConfig(cfg).success).toBe(false);
  });

  it('rejects a self reference (same-section question)', () => {
    const cfg = clone();
    cfg.sections[2].visibleWhen = visibleWhen('petName'); // petName lives in s2 itself, not earlier
    expect(validateFormConfig(cfg).success).toBe(false);
  });
});
