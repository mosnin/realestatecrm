/**
 * buildQueries / buildAreaQueries are the pure query planners for the research
 * step — each aims a capped, de-duplicated set of searches at a different facet
 * of the same subject. They decide what the (paid) Tavily calls actually ask, so
 * pin the structure: the address/locality is embedded, the MLS-vs-tax-record
 * branch, the locality-gated market query, whitespace collapse + de-dup, and the
 * hard MAX_QUERIES cap.
 */

import { describe, it, expect } from 'vitest';
import { buildQueries, buildAreaQueries, MAX_QUERIES } from '@/lib/research/tavily';

type Subject = Parameters<typeof buildQueries>[0];
type AreaSubject = Parameters<typeof buildAreaQueries>[0];

const subject = (over: Partial<Subject> = {}): Subject =>
  ({ address: '412 Elm St', city: 'Austin', stateRegion: 'TX', postalCode: '78704', ...over } as Subject);

describe('buildQueries', () => {
  it('embeds the full address + locality and never exceeds MAX_QUERIES', () => {
    const qs = buildQueries(subject());
    expect(qs.length).toBeLessThanOrEqual(MAX_QUERIES);
    // most queries target the address; the market query is locality-only
    expect(qs.filter((q) => q.includes('412 Elm St')).length).toBeGreaterThanOrEqual(2);
    expect(qs.some((q) => /Austin, TX/.test(q))).toBe(true); // market query uses the locality
  });

  it('uses the MLS query when an MLS number is present, tax-record otherwise', () => {
    const withMls = buildQueries(subject({ mlsNumber: 'ABC123' }));
    expect(withMls.some((q) => q.includes('MLS ABC123'))).toBe(true);
    expect(withMls.some((q) => /tax assessor record/.test(q))).toBe(false);

    const noMls = buildQueries(subject({ mlsNumber: null }));
    expect(noMls.some((q) => /county property tax assessor record/.test(q))).toBe(true);
  });

  it('drops the market query when there is no locality', () => {
    const qs = buildQueries(subject({ city: null, stateRegion: null, postalCode: null }));
    expect(qs.some((q) => /neighborhood real estate market overview/.test(q))).toBe(false);
  });

  it('collapses whitespace and de-dupes', () => {
    const qs = buildQueries(subject());
    expect(qs.every((q) => !/\s{2,}/.test(q))).toBe(true); // no double spaces
    expect(new Set(qs).size).toBe(qs.length); // unique
  });
});

describe('buildAreaQueries', () => {
  it('covers the four area facets, capped + de-duped', () => {
    const qs = buildAreaQueries({ label: 'East Austin' } as AreaSubject);
    expect(qs.length).toBeLessThanOrEqual(MAX_QUERIES);
    expect(qs.every((q) => q.startsWith('East Austin'))).toBe(true);
    expect(qs.some((q) => /school ratings/i.test(q))).toBe(true);
    expect(qs.some((q) => /crime rate safety/i.test(q))).toBe(true);
    expect(qs.some((q) => /housing market median home price/i.test(q))).toBe(true);
    expect(new Set(qs).size).toBe(qs.length);
  });

  it('trims the label before embedding it', () => {
    const qs = buildAreaQueries({ label: '  Eastside  ' } as AreaSubject);
    expect(qs.every((q) => q.startsWith('Eastside '))).toBe(true);
  });
});
