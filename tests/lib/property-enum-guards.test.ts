/**
 * isValidPropertyType / isValidListingStatus are the enum guards the LLM
 * sanitizer (parseAnalysisResponse) and the API routes lean on to reject any
 * value not in the canonical option set. Pin that they accept every option,
 * reject junk/non-strings, and stay in lockstep with the *_OPTIONS arrays
 * (the single source of truth the UI dropdowns also render).
 */

import { describe, it, expect } from 'vitest';
import {
  isValidPropertyType,
  isValidListingStatus,
  PROPERTY_TYPE_OPTIONS,
  PROPERTY_LISTING_STATUS_OPTIONS,
} from '@/lib/properties';

describe('isValidPropertyType', () => {
  it('accepts every option value and nothing else', () => {
    for (const o of PROPERTY_TYPE_OPTIONS) expect(isValidPropertyType(o.value)).toBe(true);
    expect(isValidPropertyType('mansion')).toBe(false);
    expect(isValidPropertyType('')).toBe(false);
    expect(isValidPropertyType(null)).toBe(false);
    expect(isValidPropertyType(undefined)).toBe(false);
    expect(isValidPropertyType(123)).toBe(false);
  });
});

describe('isValidListingStatus', () => {
  it('accepts every option value and nothing else', () => {
    for (const o of PROPERTY_LISTING_STATUS_OPTIONS) expect(isValidListingStatus(o.value)).toBe(true);
    expect(isValidListingStatus('for_rent')).toBe(false);
    expect(isValidListingStatus(null)).toBe(false);
    expect(isValidListingStatus(42)).toBe(false);
  });
});

describe('option arrays are well-formed (single source of truth)', () => {
  it('have unique values and non-empty labels', () => {
    for (const arr of [PROPERTY_TYPE_OPTIONS, PROPERTY_LISTING_STATUS_OPTIONS]) {
      const values = arr.map((o) => o.value);
      expect(new Set(values).size).toBe(values.length); // no dup values
      for (const o of arr) expect(o.label.trim().length).toBeGreaterThan(0);
    }
  });
});
