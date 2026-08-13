import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ buildCma: vi.fn() }));

vi.mock('@/lib/cma', () => ({
  buildCma: mocks.buildCma,
  DATA_SOURCE_LABEL: {
    rentcast: 'RentCast market data',
    crm: 'your CRM data',
  },
}));

import { analyzePropertyValuesTool } from '@/lib/ai-tools/tools/analyze-property-values';
import { validateChippiOpenUiProgram } from '@/components/ai/openui/chippi-openui-renderer';
import type { ToolContext } from '@/lib/ai-tools/types';

const signal = new AbortController().signal;
const ctx: ToolContext = {
  userId: 'user-1',
  space: { id: 'space-1', slug: 'demo', name: 'Demo', ownerId: 'owner-1' },
  signal,
};

const subject = {
  propertyId: null,
  address: '10 Main Street',
  city: 'Miami',
  stateRegion: 'FL',
  beds: 3,
  baths: 2,
  squareFeet: 1800,
  propertyType: 'Single Family',
  listPrice: null,
};

describe('analyze_property_values', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires a real subject address in the schema', () => {
    expect(analyzePropertyValuesTool.parameters.safeParse({}).success).toBe(false);
    expect(analyzePropertyValuesTool.parameters.safeParse({ address: '10 Main Street' }).success).toBe(true);
  });

  it('refuses to invent a value when grounded data is insufficient', async () => {
    mocks.buildCma.mockResolvedValue({
      subject,
      comps: [],
      stats: {
        compCount: 0,
        pricedCount: 0,
        low: null,
        median: null,
        high: null,
        avgPricePerSqft: null,
        suggestedLow: null,
        suggestedHigh: null,
        estimatedValue: null,
        basis: 'none',
        insufficientData: true,
      },
      dataSource: 'crm',
      dataSourceReason: 'rentcast_unconfigured',
      generatedAt: '2026-08-12T00:00:00.000Z',
    });

    const result = await analyzePropertyValuesTool.handler(
      { address: '10 Main Street', city: 'Miami', stateRegion: 'FL' },
      ctx,
    );

    expect(mocks.buildCma).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: 'space-1', signal }),
    );
    expect(result.display).toBe('warning');
    expect(result.summary).toContain('not enough grounded data');
    expect(result.summary).toContain('No value was inferred');
    expect(result.summary).not.toMatch(/\$\d/);
    expect(result.modelContext).toContain('Do not supply, estimate, or infer');
  });

  it('returns only the CMA engine figures when data is sufficient', async () => {
    mocks.buildCma.mockResolvedValue({
      subject,
      comps: [
        {
          id: 'comp-secret-id',
          address: '12 Main Street',
          city: 'Miami',
          beds: 3,
          baths: 2,
          squareFeet: 1750,
          price: 510000,
          priceBasis: 'sold',
          pricePerSqft: 291,
          listingStatus: 'Sold',
          source: 'rentcast',
          distanceMiles: 0.2,
          daysOld: 20,
        },
      ],
      stats: {
        compCount: 1,
        pricedCount: 1,
        low: 510000,
        median: 510000,
        high: 510000,
        avgPricePerSqft: 291,
        suggestedLow: 495000,
        suggestedHigh: 530000,
        estimatedValue: 515000,
        basis: 'sold',
        insufficientData: false,
      },
      dataSource: 'rentcast',
      dataSourceReason: 'rentcast',
      generatedAt: '2026-08-12T00:00:00.000Z',
    });

    const result = await analyzePropertyValuesTool.handler(
      { address: '10 Main Street', city: 'Miami', stateRegion: 'FL' },
      ctx,
    );

    expect(result.display).toBe('openui');
    expect(result.summary).toContain('$515,000');
    expect(result.summary).toContain('$495,000 to $530,000');
    expect(result.summary).toContain('RentCast market data');
    expect(result.modelContext).not.toContain('comp-secret-id');
    const program = (result.data as { program?: unknown } | undefined)?.program;
    expect(typeof program).toBe('string');
    expect(validateChippiOpenUiProgram(String(program))).toBe(true);
    expect(program).toContain('Property value analysis');
    expect(program).toContain('RentCast market data');
  });
});
