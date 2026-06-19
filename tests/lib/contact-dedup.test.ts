/**
 * Unit tests for the duplicate-contact detector (lib/contact-dedup.ts).
 *
 * Pure logic only — no DB. Covers:
 *   - normalization (email/phone/name) edge cases
 *   - name similarity (reorder, typo, distinct names)
 *   - grouping: email dupes, phone dupes (incl. country-code), transitive
 *     closure, name-only NON-grouping, and that the detector only ever groups
 *     within the list it's given (the API guarantees that list is one space).
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeEmail,
  normalizePhone,
  normalizeName,
  nameSimilarity,
  groupDuplicates,
  NAME_SIMILARITY_THRESHOLD,
  type DedupContact,
} from '@/lib/contact-dedup';

describe('normalizeEmail', () => {
  it('lower-cases and trims', () => {
    expect(normalizeEmail('  Jane.Doe@Example.COM ')).toBe('jane.doe@example.com');
  });
  it('returns empty for blank/nullish', () => {
    expect(normalizeEmail(null)).toBe('');
    expect(normalizeEmail('')).toBe('');
    expect(normalizeEmail(undefined)).toBe('');
  });
});

describe('normalizePhone', () => {
  it('strips non-digits', () => {
    expect(normalizePhone('(415) 555-1234')).toBe('4155551234');
  });
  it('compares on last 10 digits so +1 and bare match', () => {
    expect(normalizePhone('+1 415 555 1234')).toBe('4155551234');
    expect(normalizePhone('14155551234')).toBe(normalizePhone('4155551234'));
  });
  it('rejects implausibly short input', () => {
    expect(normalizePhone('123')).toBe('');
    expect(normalizePhone('x12')).toBe('');
  });
  it('returns empty for blank', () => {
    expect(normalizePhone(null)).toBe('');
  });
});

describe('normalizeName', () => {
  it('lower-cases, strips punctuation, collapses whitespace', () => {
    expect(normalizeName("  O'Brien,  Jane  ")).toBe('obrien jane');
  });
});

describe('nameSimilarity', () => {
  it('is 1 for identical normalized names', () => {
    expect(nameSimilarity('Jane Doe', 'jane  doe')).toBe(1);
  });
  it('is high for reordered names (token overlap)', () => {
    expect(nameSimilarity('Jane Doe', 'Doe, Jane')).toBeGreaterThanOrEqual(NAME_SIMILARITY_THRESHOLD);
  });
  it('is high for a small typo', () => {
    expect(nameSimilarity('Jonathan Smith', 'Jonathon Smith')).toBeGreaterThanOrEqual(
      NAME_SIMILARITY_THRESHOLD,
    );
  });
  it('is low for distinct names', () => {
    expect(nameSimilarity('Jane Doe', 'Robert Johnson')).toBeLessThan(NAME_SIMILARITY_THRESHOLD);
  });
  it('is 0 when either name is blank', () => {
    expect(nameSimilarity('', 'Jane')).toBe(0);
    expect(nameSimilarity('Jane', null)).toBe(0);
  });
});

function c(partial: Partial<DedupContact> & { id: string }): DedupContact {
  return { name: null, email: null, phone: null, createdAt: '2026-01-01', ...partial };
}

describe('groupDuplicates', () => {
  it('groups contacts that share a normalized email (case-insensitive)', () => {
    const groups = groupDuplicates([
      c({ id: 'a', name: 'Jane', email: 'Jane@Example.com' }),
      c({ id: 'b', name: 'Jane D', email: 'jane@example.com' }),
      c({ id: 'z', name: 'Other', email: 'other@example.com' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].contacts.map((x) => x.id).sort()).toEqual(['a', 'b']);
    expect(groups[0].confidence).toBe('high');
    expect(groups[0].reasons).toContain('Same email');
  });

  it('groups contacts that share a phone, including +1 vs bare', () => {
    const groups = groupDuplicates([
      c({ id: 'a', name: 'Bob', phone: '+1 (415) 555-0000' }),
      c({ id: 'b', name: 'Bob B', phone: '4155550000' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].confidence).toBe('high');
    expect(groups[0].reasons).toContain('Same phone');
  });

  it('forms a transitive group: A~B by email, B~C by phone → {A,B,C}', () => {
    const groups = groupDuplicates([
      c({ id: 'a', name: 'X', email: 'x@e.com' }),
      c({ id: 'b', name: 'X', email: 'x@e.com', phone: '4155551111' }),
      c({ id: 'cc', name: 'X', phone: '4155551111' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].contacts.map((x) => x.id).sort()).toEqual(['a', 'b', 'cc']);
  });

  it('does NOT group two different people who only share a similar name', () => {
    // Same common name, NO shared email/phone → must not merge.
    const groups = groupDuplicates([
      c({ id: 'a', name: 'John Smith', email: 'john.smith.1@e.com', phone: '4150000001' }),
      c({ id: 'b', name: 'John Smith', email: 'john.smith.2@e.com', phone: '4150000002' }),
    ]);
    expect(groups).toHaveLength(0);
  });

  it('decorates a hard-identifier group with the similar-name reason', () => {
    const groups = groupDuplicates([
      c({ id: 'a', name: 'Jane Doe', email: 'jd@e.com' }),
      c({ id: 'b', name: 'Doe, Jane', email: 'jd@e.com' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].reasons).toEqual(expect.arrayContaining(['Same email', 'Similar name']));
  });

  it('orders members oldest-first (suggested survivor leads)', () => {
    const groups = groupDuplicates([
      c({ id: 'new', name: 'P', email: 'p@e.com', createdAt: '2026-05-01' }),
      c({ id: 'old', name: 'P', email: 'p@e.com', createdAt: '2026-01-01' }),
    ]);
    expect(groups[0].contacts[0].id).toBe('old');
  });

  it('returns no groups when there are no duplicates', () => {
    expect(
      groupDuplicates([
        c({ id: 'a', email: 'a@e.com' }),
        c({ id: 'b', email: 'b@e.com' }),
      ]),
    ).toHaveLength(0);
  });

  it('ignores blank emails/phones (does not group two contacts with no contact info)', () => {
    expect(groupDuplicates([c({ id: 'a', name: 'Anon' }), c({ id: 'b', name: 'Anon' })])).toHaveLength(
      0,
    );
  });
});
