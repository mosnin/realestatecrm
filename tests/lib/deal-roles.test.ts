/**
 * The deal-contact role catalogue is the single source of truth for who can be
 * attached to a deal — the role dropdown renders it, the API trusts isValidRole,
 * and the UI shows roleLabel. Pin the lookups (null-safe label, strict guard)
 * and that the catalogue stays well-formed (unique values, real labels, valid
 * groups) so a stray edit can't desync the dropdown from the guard.
 */

import { describe, it, expect } from 'vitest';
import { roleLabel, isValidRole, DEAL_CONTACT_ROLES } from '@/lib/deals/roles';

describe('roleLabel', () => {
  it('maps a known role to its label and is null-safe', () => {
    expect(roleLabel('buyer_agent')).toBe("Buyer's agent");
    expect(roleLabel('title')).toBe('Title company');
    expect(roleLabel(null)).toBeNull();
    expect(roleLabel(undefined)).toBeNull();
    // an unknown string typed through the nullable param returns null, not undefined
    expect(roleLabel('mortgage_broker' as unknown as Parameters<typeof roleLabel>[0])).toBeNull();
  });
});

describe('isValidRole', () => {
  it('accepts every catalogue value and rejects junk / non-strings', () => {
    for (const r of DEAL_CONTACT_ROLES) expect(isValidRole(r.value)).toBe(true);
    expect(isValidRole('mortgage_broker')).toBe(false);
    expect(isValidRole('')).toBe(false);
    expect(isValidRole(null)).toBe(false);
    expect(isValidRole(7)).toBe(false);
  });
});

describe('DEAL_CONTACT_ROLES catalogue (single source of truth)', () => {
  it('has unique values, non-empty labels, and valid groups incl. an Other escape hatch', () => {
    const values = DEAL_CONTACT_ROLES.map((r) => r.value);
    expect(new Set(values).size).toBe(values.length); // no dup values
    const groups = new Set(['principal', 'agent', 'service', 'other']);
    for (const r of DEAL_CONTACT_ROLES) {
      expect(r.label.trim().length).toBeGreaterThan(0);
      expect(groups.has(r.group)).toBe(true);
    }
    expect(values).toContain('other'); // free-form escape hatch always present
    // every label resolves back through roleLabel
    for (const r of DEAL_CONTACT_ROLES) expect(roleLabel(r.value)).toBe(r.label);
  });
});
