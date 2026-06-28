/**
 * Unit tests for the fair-housing guardrail. Two duties: catch the classic
 * violations realtors get cited for, and — just as important — DON'T trip on
 * ordinary real-estate language. False positives would train realtors to ignore
 * the warning, which is worse than no warning.
 */

import { describe, it, expect } from 'vitest';
import { checkFairHousing, protectedClassLabel } from '@/lib/fair-housing';

describe('checkFairHousing — catches violations', () => {
  it('flags familial-status exclusions', () => {
    for (const text of ['Adults only, please.', 'No children allowed.', 'A child-free building.']) {
      const r = checkFairHousing(text);
      expect(r.ok).toBe(false);
      expect(r.findings.some((f) => f.protectedClass === 'familial_status')).toBe(true);
    }
  });

  it('flags religious community steering', () => {
    const r = checkFairHousing('A wonderful Christian community you will love.');
    expect(r.ok).toBe(false);
    expect(r.findings[0].protectedClass).toBe('religion');
    expect(r.findings[0].message).toMatch(/steering/i);
  });

  it('flags language / national-origin requirements', () => {
    expect(checkFairHousing('English-speaking tenants only.').ok).toBe(false);
    expect(checkFairHousing('Americans only.').ok).toBe(false);
  });

  it('flags disability exclusions including support animals', () => {
    expect(checkFairHousing('Must be able-bodied.').ok).toBe(false);
    const r = checkFairHousing('Sorry, no emotional-support animals in this unit.');
    expect(r.ok).toBe(false);
    expect(r.findings[0].protectedClass).toBe('disability');
  });

  it('flags coded steering phrases as high severity', () => {
    const r = checkFairHousing('A safe Christian area, very desirable.');
    expect(r.ok).toBe(false);
    expect(r.findings.some((f) => f.severity === 'high')).toBe(true);
  });

  it('treats source-of-income as a medium nudge (does not flip ok alone)', () => {
    const r = checkFairHousing('No Section 8.');
    // Medium-only finding: surfaced, but ok stays true (advisory, jurisdictional).
    expect(r.findings.some((f) => f.protectedClass === 'source_of_income')).toBe(true);
    expect(r.ok).toBe(true);
  });

  it('flags "perfect for families" as a medium steering nudge', () => {
    const r = checkFairHousing('This home is perfect for families.');
    expect(r.findings.some((f) => f.protectedClass === 'steering')).toBe(true);
    expect(r.ok).toBe(true); // medium → advisory
  });
});

describe('checkFairHousing — does NOT trip on ordinary real-estate language', () => {
  const clean = [
    'Spacious family room with a fireplace.',
    'The master suite has a walk-in closet.',
    'Hi Jane — following up on the 3-bed at 14 Maple. Want to tour this weekend?',
    'Quiet street, close to parks and the new coffee shop.',
    'Two-bedroom, second-floor unit; building has no elevator.',
    'Great schools nearby and an easy commute downtown.',
    'Pet-friendly with a fenced yard.',
  ];
  for (const text of clean) {
    it(`clean: ${text.slice(0, 32)}…`, () => {
      const r = checkFairHousing(text);
      expect(r.ok).toBe(true);
      expect(r.findings).toHaveLength(0);
    });
  }
});

describe('checkFairHousing — mechanics', () => {
  it('empty / whitespace input is trivially ok', () => {
    expect(checkFairHousing('').findings).toHaveLength(0);
    expect(checkFairHousing('   ').ok).toBe(true);
  });

  it('dedupes a repeated phrase', () => {
    const r = checkFairHousing('Adults only. Truly adults only.');
    const familial = r.findings.filter((f) => f.protectedClass === 'familial_status');
    expect(familial).toHaveLength(1);
  });

  it('collects multiple distinct findings', () => {
    const r = checkFairHousing('No children, and English-speaking only.');
    expect(r.findings.length).toBeGreaterThanOrEqual(2);
    expect(r.ok).toBe(false);
  });

  it('protectedClassLabel humanizes the enum', () => {
    expect(protectedClassLabel('familial_status')).toBe('familial status');
    expect(protectedClassLabel('national_origin')).toBe('national origin');
    expect(protectedClassLabel('religion')).toBe('religion');
  });
});
