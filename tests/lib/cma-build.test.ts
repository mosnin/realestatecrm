/**
 * Tests for buildCma()'s source selection — RentCast primary vs CRM fallback.
 *
 * NO live network: the RentCast client (@/lib/rentcast) and Supabase
 * (@/lib/supabase) are both mocked. We assert:
 *
 *   1. RentCast configured + returns data → dataSource 'rentcast', RentCast
 *      comps lead, CRM rows are merged in as secondary comps, stats use
 *      RentCast's value range.
 *   2. RentCast configured but returns null (no match / error / timeout) →
 *      falls back to CRM-only with dataSource 'crm'.
 *   3. RentCast NOT configured → CRM-only path, dataSource 'crm', and
 *      getValueEstimate is never called.
 *   4. A CRM merge failure on the RentCast path degrades to RentCast-only,
 *      it does not sink the report.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RentcastValueResult } from '@/lib/rentcast';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const { rentcastConfiguredMock, getValueEstimateMock } = vi.hoisted(() => ({
  rentcastConfiguredMock: vi.fn<() => boolean>(() => true),
  getValueEstimateMock: vi.fn<
    (...args: unknown[]) => Promise<RentcastValueResult | null>
  >(async () => null),
}));
vi.mock('@/lib/rentcast', () => ({
  rentcastConfigured: rentcastConfiguredMock,
  getValueEstimate: getValueEstimateMock,
}));

// Supabase query-builder stub. `.from('Property')` returns a thenable builder;
// `propertyRows` is the resolved comp/subject list. The chain methods are no-ops
// that return `this`, and awaiting the builder yields { data, error }.
let propertyRows: Array<Record<string, unknown>> = [];
let propertyError: { message: string } | null = null;

vi.mock('@/lib/supabase', () => {
  function makeBuilder() {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    for (const m of ['select', 'eq', 'order', 'limit']) builder[m] = vi.fn(chain);
    // maybeSingle resolves a single row (used for the subjectPropertyId lookup).
    builder.maybeSingle = vi.fn(async () => ({
      data: propertyRows[0] ?? null,
      error: propertyError,
    }));
    // Awaiting the builder itself resolves the list query.
    builder.then = (resolve: (v: { data: unknown; error: unknown }) => unknown) =>
      resolve({ data: propertyRows, error: propertyError });
    return builder;
  }
  return { supabase: { from: vi.fn(() => makeBuilder()) } };
});

import { buildCma } from '@/lib/cma';

// ── Fixtures ────────────────────────────────────────────────────────────────────

function rcResult(overrides: Partial<RentcastValueResult> = {}): RentcastValueResult {
  return {
    price: 700_000,
    priceRangeLow: 650_000,
    priceRangeHigh: 760_000,
    latitude: 37.8,
    longitude: -122.2,
    comparables: [
      {
        id: 'rc-a',
        formattedAddress: '10 Market St, Oakland, CA',
        city: 'Oakland',
        state: 'CA',
        zipCode: '94601',
        propertyType: 'Single Family',
        bedrooms: 3,
        bathrooms: 2,
        squareFootage: 1800,
        price: 690_000,
        listingType: 'Standard',
        distance: 0.3,
        daysOld: 20,
        correlation: 0.96,
      },
      {
        id: 'rc-b',
        formattedAddress: '12 Market St, Oakland, CA',
        city: 'Oakland',
        state: 'CA',
        zipCode: '94601',
        propertyType: 'Single Family',
        bedrooms: 3,
        bathrooms: 2,
        squareFootage: 1900,
        price: 730_000,
        listingType: 'Standard',
        distance: 0.5,
        daysOld: 45,
        correlation: 0.92,
      },
    ],
    ...overrides,
  };
}

const CRM_ROW = {
  id: 'crm-1',
  address: '99 CRM Ave',
  city: 'Oakland',
  stateRegion: 'CA',
  beds: 3,
  baths: 2,
  squareFeet: 1750,
  propertyType: 'single_family',
  listPrice: 640_000,
  listingStatus: 'sold',
  updatedAt: new Date().toISOString(),
};

const SUBJECT_FIELDS = {
  address: '500 Subject Ave',
  city: 'Oakland',
  stateRegion: 'CA',
  beds: 3,
  baths: 2,
  squareFeet: 1800,
  propertyType: 'single_family',
  listPrice: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  rentcastConfiguredMock.mockReturnValue(true);
  getValueEstimateMock.mockResolvedValue(null);
  propertyRows = [];
  propertyError = null;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildCma — RentCast primary path', () => {
  it('uses RentCast data, leads with RentCast comps, merges CRM rows as secondary', async () => {
    getValueEstimateMock.mockResolvedValue(rcResult());
    propertyRows = [CRM_ROW]; // available as a secondary comp

    const payload = await buildCma({ spaceId: 'space-1', subjectFields: SUBJECT_FIELDS });

    expect(payload.dataSource).toBe('rentcast');
    expect(getValueEstimateMock).toHaveBeenCalledTimes(1);

    // RentCast comps first, then the CRM comp appended.
    expect(payload.comps.length).toBe(3);
    expect(payload.comps[0].source).toBe('rentcast');
    expect(payload.comps.some((c) => c.source === 'crm' && c.id === 'crm-1')).toBe(true);

    // Suggested range comes from RentCast's value range; estimate is surfaced.
    expect(payload.stats.suggestedLow).toBe(650_000);
    expect(payload.stats.suggestedHigh).toBe(760_000);
    expect(payload.stats.estimatedValue).toBe(700_000);
  });

  it('forwards the subject address + attributes to RentCast', async () => {
    getValueEstimateMock.mockResolvedValue(rcResult());

    await buildCma({ spaceId: 'space-1', subjectFields: SUBJECT_FIELDS });

    const arg = getValueEstimateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.address).toContain('500 Subject Ave');
    expect(arg.bedrooms).toBe(3);
    expect(arg.bathrooms).toBe(2);
    expect(arg.squareFootage).toBe(1800);
    expect(arg.propertyType).toBe('Single Family'); // mapped from single_family
  });

  it('still produces a RentCast report when the CRM merge fails', async () => {
    getValueEstimateMock.mockResolvedValue(rcResult());
    propertyError = { message: 'db down' }; // CRM secondary merge throws internally

    const payload = await buildCma({ spaceId: 'space-1', subjectFields: SUBJECT_FIELDS });

    expect(payload.dataSource).toBe('rentcast');
    expect(payload.comps.length).toBe(2); // RentCast comps only
    expect(payload.comps.every((c) => c.source === 'rentcast')).toBe(true);
  });
});

describe('buildCma — fallback to CRM', () => {
  it('falls back to CRM-only when RentCast returns no data', async () => {
    getValueEstimateMock.mockResolvedValue(null); // no match / error / timeout
    propertyRows = [CRM_ROW];

    const payload = await buildCma({ spaceId: 'space-1', subjectFields: SUBJECT_FIELDS });

    expect(getValueEstimateMock).toHaveBeenCalledTimes(1);
    expect(payload.dataSource).toBe('crm');
    expect(payload.comps.length).toBe(1);
    expect(payload.comps[0].source).toBe('crm');
    expect(payload.comps[0].id).toBe('crm-1');
  });

  it('does NOT call RentCast when the key is unconfigured', async () => {
    rentcastConfiguredMock.mockReturnValue(false);
    propertyRows = [CRM_ROW];

    const payload = await buildCma({ spaceId: 'space-1', subjectFields: SUBJECT_FIELDS });

    expect(getValueEstimateMock).not.toHaveBeenCalled();
    expect(payload.dataSource).toBe('crm');
  });

  it('falls back gracefully (no crash) when RentCast finds no match and the CRM is empty', async () => {
    getValueEstimateMock.mockResolvedValue(null);
    propertyRows = []; // no CRM comps either

    const payload = await buildCma({ spaceId: 'space-1', subjectFields: SUBJECT_FIELDS });

    expect(payload.dataSource).toBe('crm');
    expect(payload.comps).toHaveLength(0);
    expect(payload.stats.compCount).toBe(0);
    expect(payload.stats.suggestedLow).toBeNull();
    expect(payload.stats.basis).toBe('none');
  });

  it('treats a RentCast client throw as a fallback, not a crash', async () => {
    getValueEstimateMock.mockRejectedValue(new Error('boom'));
    propertyRows = [CRM_ROW];

    const payload = await buildCma({ spaceId: 'space-1', subjectFields: SUBJECT_FIELDS });

    expect(payload.dataSource).toBe('crm');
    expect(payload.comps[0].source).toBe('crm');
  });
});

describe('buildCma — input validation', () => {
  it('throws when neither a subject id nor an address is provided', async () => {
    await expect(
      buildCma({ spaceId: 'space-1', subjectFields: { address: '   ' } }),
    ).rejects.toThrow(/address/i);
  });
});
