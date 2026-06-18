/**
 * Tests for the pure CMA stat computation in lib/cma.ts.
 *
 * Covers the unit-testable core (no DB): median(), and computeStats()'s
 * low / median / high, average $/sqft, suggested-range derivation, and the
 * sold/list/mixed basis classification. buildCma() itself talks to Supabase
 * and is exercised end-to-end elsewhere; these tests pin the math.
 */

import { describe, it, expect, vi } from 'vitest';

// lib/cma imports lib/rentcast, which has `import 'server-only'` — a build-time
// guard that throws under vitest's Node runtime. Stub it to a no-op.
vi.mock('server-only', () => ({}));

import {
  computeStats,
  median,
  generateShareToken,
  rentcastCompToCmaComp,
  mapRentcastResult,
  toRentcastPropertyType,
} from '@/lib/cma';
import type { CmaComp, CmaSubject } from '@/lib/cma';
import type { RentcastComparable, RentcastValueResult } from '@/lib/rentcast';

function comp(overrides: Partial<CmaComp>): CmaComp {
  return {
    id: Math.random().toString(36).slice(2),
    address: '1 Test St',
    city: null,
    beds: null,
    baths: null,
    squareFeet: null,
    price: null,
    priceBasis: 'list',
    pricePerSqft: null,
    listingStatus: 'active',
    source: 'crm',
    distanceMiles: null,
    daysOld: null,
    ...overrides,
  };
}

const SUBJECT: CmaSubject = {
  propertyId: null,
  address: '500 Subject Ave',
  city: 'Oakland',
  stateRegion: 'CA',
  beds: 3,
  baths: 2,
  squareFeet: 2000,
  propertyType: 'single_family',
  listPrice: null,
};

describe('median', () => {
  it('returns null for an empty list', () => {
    expect(median([])).toBeNull();
  });

  it('returns the middle value for an odd-length list', () => {
    expect(median([300, 100, 200])).toBe(200);
  });

  it('averages the two middle values for an even-length list', () => {
    expect(median([100, 200, 300, 400])).toBe(250);
  });
});

describe('computeStats — low / median / high', () => {
  it('computes low, median, high from priced comps', () => {
    const comps = [
      comp({ price: 800_000 }),
      comp({ price: 600_000 }),
      comp({ price: 1_000_000 }),
    ];
    const stats = computeStats(comps, SUBJECT);

    expect(stats.compCount).toBe(3);
    expect(stats.pricedCount).toBe(3);
    expect(stats.low).toBe(600_000);
    expect(stats.median).toBe(800_000);
    expect(stats.high).toBe(1_000_000);
  });

  it('ignores comps with no usable price', () => {
    const comps = [
      comp({ price: 500_000 }),
      comp({ price: null }),
      comp({ price: 0 }),
      comp({ price: 700_000 }),
    ];
    const stats = computeStats(comps, SUBJECT);

    expect(stats.compCount).toBe(4);
    expect(stats.pricedCount).toBe(2);
    expect(stats.low).toBe(500_000);
    expect(stats.high).toBe(700_000);
    expect(stats.median).toBe(600_000);
  });

  it('returns null stats when no comps are priced', () => {
    const stats = computeStats([comp({ price: null }), comp({ price: null })], SUBJECT);
    expect(stats.low).toBeNull();
    expect(stats.median).toBeNull();
    expect(stats.high).toBeNull();
    expect(stats.basis).toBe('none');
  });
});

describe('computeStats — average $/sqft', () => {
  it('averages the per-comp $/sqft values', () => {
    const comps = [
      comp({ price: 600_000, squareFeet: 2000, pricePerSqft: 300 }),
      comp({ price: 800_000, squareFeet: 2000, pricePerSqft: 400 }),
    ];
    const stats = computeStats(comps, SUBJECT);
    expect(stats.avgPricePerSqft).toBe(350);
  });

  it('is null when no comp has a $/sqft', () => {
    const stats = computeStats([comp({ price: 600_000, pricePerSqft: null })], SUBJECT);
    expect(stats.avgPricePerSqft).toBeNull();
  });
});

describe('computeStats — suggested range', () => {
  it('derives the range from subject sqft × the comp $/sqft band', () => {
    const comps = [
      comp({ price: 600_000, squareFeet: 2000, pricePerSqft: 300 }),
      comp({ price: 900_000, squareFeet: 2000, pricePerSqft: 450 }),
    ];
    const stats = computeStats(comps, SUBJECT); // subject sqft = 2000
    expect(stats.suggestedLow).toBe(2000 * 300);
    expect(stats.suggestedHigh).toBe(2000 * 450);
  });

  it('falls back to raw price low/high when the subject has no sqft', () => {
    const subjectNoSqft: CmaSubject = { ...SUBJECT, squareFeet: null };
    const comps = [comp({ price: 500_000 }), comp({ price: 900_000 })];
    const stats = computeStats(comps, subjectNoSqft);
    expect(stats.suggestedLow).toBe(500_000);
    expect(stats.suggestedHigh).toBe(900_000);
  });
});

describe('computeStats — basis classification', () => {
  it('reports "sold" when every priced comp is a sold listing', () => {
    const comps = [
      comp({ price: 600_000, priceBasis: 'sold' }),
      comp({ price: 700_000, priceBasis: 'sold' }),
    ];
    expect(computeStats(comps, SUBJECT).basis).toBe('sold');
  });

  it('reports "list" when every priced comp is a list price', () => {
    const comps = [comp({ price: 600_000, priceBasis: 'list' })];
    expect(computeStats(comps, SUBJECT).basis).toBe('list');
  });

  it('reports "mixed" when sold and list prices both appear', () => {
    const comps = [
      comp({ price: 600_000, priceBasis: 'sold' }),
      comp({ price: 700_000, priceBasis: 'list' }),
    ];
    expect(computeStats(comps, SUBJECT).basis).toBe('mixed');
  });
});

describe('generateShareToken', () => {
  it('returns 32 hex chars and is unique across calls', () => {
    const a = generateShareToken();
    const b = generateShareToken();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
  });
});

// ── RentCast → CMA mapping (pure) ───────────────────────────────────────────────

function rcComp(overrides: Partial<RentcastComparable>): RentcastComparable {
  return {
    id: 'rc-1',
    formattedAddress: '10 Market St, Oakland, CA 94601',
    city: 'Oakland',
    state: 'CA',
    zipCode: '94601',
    propertyType: 'Single Family',
    bedrooms: 3,
    bathrooms: 2,
    squareFootage: 1800,
    price: 720_000,
    listingType: 'Standard',
    distance: 0.42,
    daysOld: 30,
    correlation: 0.95,
    ...overrides,
  };
}

describe('rentcastCompToCmaComp', () => {
  it('maps RentCast field names into a CmaComp and computes $/sqft', () => {
    const c = rentcastCompToCmaComp(rcComp({ price: 720_000, squareFootage: 1800 }));
    expect(c.address).toBe('10 Market St, Oakland, CA 94601');
    expect(c.city).toBe('Oakland');
    expect(c.beds).toBe(3);
    expect(c.baths).toBe(2);
    expect(c.squareFeet).toBe(1800);
    expect(c.price).toBe(720_000);
    expect(c.pricePerSqft).toBe(400); // 720000 / 1800
    expect(c.source).toBe('rentcast');
    expect(c.distanceMiles).toBe(0.42);
    expect(c.daysOld).toBe(30);
  });

  it('treats a standard listing as a "sold" comp basis', () => {
    expect(rentcastCompToCmaComp(rcComp({ listingType: 'Standard' })).priceBasis).toBe('sold');
  });

  it('treats an active "For Sale" listing as a "list" comp basis', () => {
    expect(rentcastCompToCmaComp(rcComp({ listingType: 'For Sale' })).priceBasis).toBe('list');
  });

  it('synthesizes an id when RentCast omits one', () => {
    const c = rentcastCompToCmaComp(rcComp({ id: null }));
    expect(c.id).toMatch(/^rc-/);
  });

  it('leaves $/sqft null when squareFootage is missing', () => {
    expect(rentcastCompToCmaComp(rcComp({ squareFootage: null })).pricePerSqft).toBeNull();
  });
});

describe('mapRentcastResult', () => {
  const subject: CmaSubject = { ...SUBJECT, squareFeet: 1800 };

  function rcResult(overrides: Partial<RentcastValueResult>): RentcastValueResult {
    return {
      price: 700_000,
      priceRangeLow: 650_000,
      priceRangeHigh: 760_000,
      latitude: 37.8,
      longitude: -122.2,
      comparables: [
        rcComp({ id: 'a', price: 680_000, squareFootage: 1700 }),
        rcComp({ id: 'b', price: 720_000, squareFootage: 1900 }),
      ],
      ...overrides,
    };
  }

  it('maps a full RentCast result into comps + stats', () => {
    const { comps, stats } = mapRentcastResult(rcResult({}), subject);
    expect(comps).toHaveLength(2);
    expect(comps.every((c) => c.source === 'rentcast')).toBe(true);
    expect(stats.compCount).toBe(2);
    expect(stats.pricedCount).toBe(2);
    expect(stats.low).toBe(680_000);
    expect(stats.high).toBe(720_000);
    expect(stats.median).toBe(700_000);
  });

  it('uses RentCast\'s value range as the suggested range (not the derived band)', () => {
    const { stats } = mapRentcastResult(rcResult({}), subject);
    expect(stats.suggestedLow).toBe(650_000);
    expect(stats.suggestedHigh).toBe(760_000);
    expect(stats.estimatedValue).toBe(700_000);
  });

  it('appends CRM comps after the RentCast comps as secondary comparables', () => {
    const crm = [comp({ id: 'crm-1', price: 500_000, source: 'crm' })];
    const { comps } = mapRentcastResult(rcResult({}), subject, crm);
    expect(comps).toHaveLength(3);
    expect(comps[0].source).toBe('rentcast');
    expect(comps[comps.length - 1].source).toBe('crm');
    expect(comps[comps.length - 1].id).toBe('crm-1');
  });

  it('falls back to the derived band when RentCast omits a value range', () => {
    const { stats } = mapRentcastResult(
      rcResult({ priceRangeLow: null, priceRangeHigh: null }),
      subject,
    );
    // subject sqft 1800 × the comp $/sqft band.
    expect(stats.suggestedLow).not.toBeNull();
    expect(stats.suggestedHigh).not.toBeNull();
    expect(stats.suggestedLow! < stats.suggestedHigh!).toBe(true);
  });
});

describe('toRentcastPropertyType', () => {
  it('maps common internal types to RentCast enum values', () => {
    expect(toRentcastPropertyType('single_family')).toBe('Single Family');
    expect(toRentcastPropertyType('Condo')).toBe('Condo');
    expect(toRentcastPropertyType('town-home')).toBe('Townhouse');
    expect(toRentcastPropertyType('duplex')).toBe('Multi-Family');
    expect(toRentcastPropertyType('land')).toBe('Land');
  });

  it('returns undefined for unknown or empty types', () => {
    expect(toRentcastPropertyType(null)).toBeUndefined();
    expect(toRentcastPropertyType('')).toBeUndefined();
    expect(toRentcastPropertyType('castle')).toBeUndefined();
  });
});
