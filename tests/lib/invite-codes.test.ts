import { describe, it, expect } from 'vitest';
import {
  normalizeInviteCode,
  generateInviteCode,
  DEFAULT_INVITE_PLAN,
} from '@/lib/billing/invite-codes';
import { resolveCompSpacePlan, COMP_SPACE_PLAN } from '@/lib/billing/comp';

/**
 * Pure-logic locks for the invite-code primitives. The DB-touching paths
 * (create / list / redeem) are covered by the route tests; here we pin the
 * normalization, generation, and comp-plan resolution decisions.
 */

describe('normalizeInviteCode', () => {
  it('trims and lowercases so lookups are case-insensitive', () => {
    expect(normalizeInviteCode('  ABcd-EF  ')).toBe('abcd-ef');
    expect(normalizeInviteCode('SUMMER2026')).toBe('summer2026');
  });
  it('returns empty string for non-strings', () => {
    expect(normalizeInviteCode(null)).toBe('');
    expect(normalizeInviteCode(undefined)).toBe('');
    expect(normalizeInviteCode(123)).toBe('');
  });
});

describe('generateInviteCode', () => {
  it('defaults to a 12-char code from the unambiguous alphabet', () => {
    const code = generateInviteCode();
    expect(code).toHaveLength(12);
    // No ambiguous chars (0/o, 1/i/l) and already lowercased (== its normalized form).
    expect(code).toMatch(/^[a-hj-km-np-z2-9]{12}$/);
    expect(code).toBe(normalizeInviteCode(code));
  });
  it('clamps length to the 8-64 range', () => {
    expect(generateInviteCode(2)).toHaveLength(8);
    expect(generateInviteCode(999)).toHaveLength(64);
  });
  it('is effectively unguessable — no collisions across many draws', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(generateInviteCode());
    expect(seen.size).toBe(500);
  });
});

describe('DEFAULT_INVITE_PLAN', () => {
  it('is the $97 self-serve tier (solo), not pro', () => {
    expect(DEFAULT_INVITE_PLAN).toBe('solo');
  });
});

describe('resolveCompSpacePlan', () => {
  it('honors a valid pinned plan (an invite code that grants solo → solo)', () => {
    expect(resolveCompSpacePlan('solo')).toBe('solo');
    expect(resolveCompSpacePlan('pro')).toBe('pro');
    expect(resolveCompSpacePlan('team_plus')).toBe('team_plus');
  });
  it('falls back to the demo default for null/unknown (legacy demo comps unchanged)', () => {
    expect(resolveCompSpacePlan(null)).toBe(COMP_SPACE_PLAN);
    expect(resolveCompSpacePlan(undefined)).toBe(COMP_SPACE_PLAN);
    expect(resolveCompSpacePlan('')).toBe(COMP_SPACE_PLAN);
    expect(resolveCompSpacePlan('bogus')).toBe(COMP_SPACE_PLAN);
  });
});
