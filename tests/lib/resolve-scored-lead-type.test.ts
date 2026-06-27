/**
 * resolveScoredLeadType decides whether a lead is scored as buyer or rental.
 * The precedence is load-bearing: an explicit request wins, a 'general'/absent
 * request defers to the form config, and the floor is 'rental'. This is the
 * one unit-testable slice of lead scoring (the rest delegates to an LLM), so
 * pin every branch.
 */

import { describe, it, expect } from 'vitest';
import { resolveScoredLeadType } from '@/lib/lead-scoring';
import type { IntakeFormConfig } from '@/lib/types';

const cfg = (leadType: 'buyer' | 'rental' | undefined) =>
  ({ leadType } as unknown as IntakeFormConfig);

describe('resolveScoredLeadType', () => {
  it('honours an explicit request over the form config', () => {
    expect(resolveScoredLeadType('buyer', cfg('rental'))).toBe('buyer');
    expect(resolveScoredLeadType('rental', cfg('buyer'))).toBe('rental');
  });

  it('defers to the form config when the request is general or absent', () => {
    expect(resolveScoredLeadType('general', cfg('buyer'))).toBe('buyer');
    expect(resolveScoredLeadType('general', cfg('rental'))).toBe('rental');
    expect(resolveScoredLeadType(undefined, cfg('buyer'))).toBe('buyer');
    expect(resolveScoredLeadType(undefined, cfg('rental'))).toBe('rental');
  });

  it('falls back to rental when nothing else decides', () => {
    expect(resolveScoredLeadType(undefined, null)).toBe('rental');
    expect(resolveScoredLeadType('general', null)).toBe('rental');
    expect(resolveScoredLeadType('general', cfg(undefined))).toBe('rental');
  });
});
