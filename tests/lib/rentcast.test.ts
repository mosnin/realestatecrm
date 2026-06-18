/**
 * Tests for the RentCast transport client (lib/rentcast.ts).
 *
 * NO live network: global.fetch is stubbed. We assert:
 *   - rentcastConfigured() reflects RENTCAST_API_KEY presence.
 *   - getValueEstimate() returns null (never throws) when unconfigured, on a
 *     non-2xx, on a 404 (no record), on unparseable JSON, and on a fetch throw.
 *   - a well-formed response is normalised, with bad comps (no price / no
 *     address) dropped, and exact RentCast field names mapped through.
 *   - the request carries the X-Api-Key header and a clamped compCount.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// `import 'server-only'` is a build-time guard that throws under vitest's Node
// runtime; stub it to a no-op so lib/rentcast can be imported here.
vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { rentcastConfigured, getValueEstimate } from '@/lib/rentcast';

const ORIGINAL_KEY = process.env.RENTCAST_API_KEY;

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  process.env.RENTCAST_API_KEY = 'test-key';
  vi.restoreAllMocks();
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.RENTCAST_API_KEY;
  else process.env.RENTCAST_API_KEY = ORIGINAL_KEY;
});

describe('rentcastConfigured', () => {
  it('is true when the key is set, false when unset', () => {
    process.env.RENTCAST_API_KEY = 'k';
    expect(rentcastConfigured()).toBe(true);
    delete process.env.RENTCAST_API_KEY;
    expect(rentcastConfigured()).toBe(false);
  });
});

describe('getValueEstimate — failure paths return null (never throw)', () => {
  it('returns null when the key is unconfigured (no fetch)', async () => {
    delete process.env.RENTCAST_API_KEY;
    const fetchSpy = vi.spyOn(global, 'fetch');
    expect(await getValueEstimate({ address: '1 Main St' })).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns null on a 404 (address not found)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({}, 404));
    expect(await getValueEstimate({ address: '1 Main St' })).toBeNull();
  });

  it('returns null on a non-2xx error', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ error: 'rate limited' }, 429));
    expect(await getValueEstimate({ address: '1 Main St' })).toBeNull();
  });

  it('returns null when the body is not JSON', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('not json');
      },
    } as unknown as Response);
    expect(await getValueEstimate({ address: '1 Main St' })).toBeNull();
  });

  it('returns null when fetch itself throws (network/timeout)', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNRESET'));
    expect(await getValueEstimate({ address: '1 Main St' })).toBeNull();
  });

  it('returns null for an empty address', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    expect(await getValueEstimate({ address: '   ' })).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns null when the response has neither a price nor any usable comp', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ price: null, comparables: [] }),
    );
    expect(await getValueEstimate({ address: '1 Main St' })).toBeNull();
  });
});

describe('getValueEstimate — normalisation', () => {
  it('maps a well-formed response and drops comps with no price or address', async () => {
    const body = {
      price: 705_000,
      priceRangeLow: 660_000,
      priceRangeHigh: 750_000,
      latitude: 37.8,
      longitude: -122.2,
      comparables: [
        {
          id: 'c1',
          formattedAddress: '10 Market St, Oakland, CA 94601',
          city: 'Oakland',
          state: 'CA',
          zipCode: '94601',
          propertyType: 'Single Family',
          bedrooms: 3,
          bathrooms: 2,
          squareFootage: 1800,
          price: 690_000,
          listingType: 'Standard',
          distance: 0.41,
          daysOld: 22,
          correlation: 0.95,
        },
        // dropped: no price
        { id: 'c2', formattedAddress: '12 Market St', price: null },
        // dropped: no address
        { id: 'c3', formattedAddress: null, price: 700_000 },
      ],
    };
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(body));

    const result = await getValueEstimate({ address: '10 Market St, Oakland, CA' });
    expect(result).not.toBeNull();
    expect(result!.price).toBe(705_000);
    expect(result!.priceRangeLow).toBe(660_000);
    expect(result!.priceRangeHigh).toBe(750_000);
    expect(result!.comparables).toHaveLength(1);

    const c = result!.comparables[0];
    expect(c.formattedAddress).toBe('10 Market St, Oakland, CA 94601');
    expect(c.price).toBe(690_000);
    expect(c.bedrooms).toBe(3);
    expect(c.distance).toBe(0.41);
    expect(c.daysOld).toBe(22);
    expect(c.correlation).toBe(0.95);
  });

  it('sends X-Api-Key and a clamped compCount, and hits /avm/value', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(jsonResponse({ price: 1, comparables: [] }));

    await getValueEstimate({
      address: '1 Main St, Oakland, CA',
      bedrooms: 3,
      bathrooms: 2,
      squareFootage: 1500,
      propertyType: 'Single Family',
      compCount: 999, // should clamp to 25
    });

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('https://api.rentcast.io/v1/avm/value');
    expect(url).toContain('compCount=25');
    expect(url).toContain('propertyType=Single+Family');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Api-Key']).toBe('test-key');
  });
});
