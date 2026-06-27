/**
 * The swarm config option arrays are the single source of truth for the
 * swarm-launch dropdowns (business focus, working style, comm tone, agent
 * model). A stray edit — a dup value, a blank label, a typo'd value — silently
 * breaks the dropdown or stores an unselectable value. Pin each array's
 * well-formedness (unique values, non-empty labels, stable value vocab).
 */

import { describe, it, expect } from 'vitest';
import {
  BUSINESS_FOCUS_OPTIONS,
  WORKING_STYLE_OPTIONS,
  COMMUNICATION_TONE_OPTIONS,
  AGENT_MODEL_OPTIONS,
} from '@/lib/swarm-types';

const ARRAYS = {
  BUSINESS_FOCUS_OPTIONS,
  WORKING_STYLE_OPTIONS,
  COMMUNICATION_TONE_OPTIONS,
  AGENT_MODEL_OPTIONS,
};

describe('swarm option arrays', () => {
  for (const [name, arr] of Object.entries(ARRAYS)) {
    describe(name, () => {
      it('has unique values and non-empty labels', () => {
        const values = arr.map((o) => o.value);
        expect(new Set(values).size).toBe(values.length); // no dup values
        for (const o of arr) {
          expect(o.value.trim().length).toBeGreaterThan(0);
          expect(o.label.trim().length).toBeGreaterThan(0);
        }
      });

      it('is non-empty (the dropdown always has choices)', () => {
        expect(arr.length).toBeGreaterThan(0);
      });
    });
  }

  it('pins the exact value vocab so a rename is a deliberate change', () => {
    expect(BUSINESS_FOCUS_OPTIONS.map((o) => o.value)).toEqual([
      'residential', 'commercial', 'luxury', 'rentals', 'investment', 'new_construction',
    ]);
    expect(COMMUNICATION_TONE_OPTIONS.map((o) => o.value)).toEqual(['formal', 'casual', 'direct', 'warm']);
    expect(AGENT_MODEL_OPTIONS.map((o) => o.value)).toEqual(['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini']);
  });
});
