/**
 * Unit tests for the lead-source taxonomy helpers (lib/lead-source.ts).
 * normalizeLeadSource must never throw and must reject unknown values, so a bad
 * input at a Contact-creation site can't crash the create.
 */
import { describe, it, expect } from 'vitest';
import {
  LEAD_SOURCES,
  isLeadSource,
  normalizeLeadSource,
  leadSourceLabel,
} from '@/lib/lead-source';

describe('lead-source taxonomy', () => {
  it('accepts every known source value', () => {
    for (const s of LEAD_SOURCES) {
      expect(isLeadSource(s)).toBe(true);
      expect(normalizeLeadSource(s)).toBe(s);
    }
  });

  it('rejects unknown / malformed values without throwing', () => {
    for (const bad of ['', 'WEB_FORM', 'sms', 42, null, undefined, {}, []]) {
      expect(isLeadSource(bad)).toBe(false);
      expect(normalizeLeadSource(bad)).toBeNull();
    }
  });

  it('maps known sources to a human label and unknown to "Unknown"', () => {
    expect(leadSourceLabel('web_form')).toBe('Web form');
    expect(leadSourceLabel('brokerage_form')).toBe('Brokerage form');
    expect(leadSourceLabel('import')).toBe('Import');
    expect(leadSourceLabel(null)).toBe('Unknown');
    expect(leadSourceLabel('nope')).toBe('Unknown');
  });
});
