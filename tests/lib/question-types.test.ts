/**
 * QUESTION_TYPES is the palette the form builder renders to add a question, and
 * getQuestionTypeConfig is the lookup the editor uses to seed a new question's
 * defaults. The registry must cover EVERY question type the schema accepts — a
 * missing entry means a type the schema validates but the builder can't add.
 * Pin the lookup, the registry well-formedness, and full schema coverage.
 */

import { describe, it, expect } from 'vitest';
import { QUESTION_TYPES, getQuestionTypeConfig } from '@/components/form-builder/question-types';

// The canonical question types formConfigSchema accepts (lib/form-config-schema.ts).
const SCHEMA_QUESTION_TYPES = [
  'text', 'textarea', 'email', 'phone', 'number',
  'select', 'multi_select', 'radio', 'checkbox', 'date',
] as const;

describe('getQuestionTypeConfig', () => {
  it('returns the matching config for a known type', () => {
    const cfg = getQuestionTypeConfig('select');
    expect(cfg?.type).toBe('select');
    expect(cfg?.label.trim().length).toBeGreaterThan(0);
    expect(cfg?.icon).toBeTruthy();
  });

  it('returns undefined for an unknown type', () => {
    expect(getQuestionTypeConfig('signature' as Parameters<typeof getQuestionTypeConfig>[0])).toBeUndefined();
  });
});

describe('QUESTION_TYPES registry', () => {
  it('has a unique, well-formed entry per type', () => {
    const types = QUESTION_TYPES.map((q) => q.type);
    expect(new Set(types).size).toBe(types.length); // no dup types
    for (const q of QUESTION_TYPES) {
      expect(q.label.trim().length).toBeGreaterThan(0);
      expect(q.icon).toBeTruthy();
      expect(q.defaultConfig).toBeTruthy();
      expect(typeof q.defaultConfig.required).toBe('boolean'); // seeds a required flag
    }
  });

  it('covers every question type the schema accepts (builder can add any valid type)', () => {
    for (const t of SCHEMA_QUESTION_TYPES) {
      expect(getQuestionTypeConfig(t)).toBeDefined();
    }
  });
});
