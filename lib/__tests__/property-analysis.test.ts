/**
 * Unit tests for the Property "Analyze" pipeline.
 *
 * Two contracts are guarded here, with NO live network (the Tavily/Firecrawl/LLM
 * clients are mocked):
 *   1. The structure + merge core — `parseAnalysisResponse` (grounding, source
 *      attribution, clamping) and `mergePropertyFields` (fill-empty-only, never
 *      overwrite human-entered values).
 *   2. The missing-key fallback — `analyzeProperty` returns `not_configured`
 *      (and never touches the clients) when a research key is absent.
 *
 * Plus the happy path and no-evidence path of the orchestrator, with the network
 * clients stubbed, so the end-to-end wiring (search → scrape → structure →
 * merge) is exercised deterministically.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// `import 'server-only'` is a build-time guard that throws under vitest's Node
// runtime — stub it to a no-op so lib/property-analysis.ts (and its server-only
// transitive imports) load. Mirrors the pattern in tests/lib/*.test.ts.
vi.mock('server-only', () => ({}));

// ── Mock the network-bound modules (hoisted; declare before importing SUT) ────

vi.mock('@/lib/research/tavily', () => ({
  tavilyConfigured: vi.fn(() => true),
  searchProperty: vi.fn(async () => []),
  MAX_QUERIES: 4,
}));

vi.mock('@/lib/research/firecrawl', () => ({
  firecrawlConfigured: vi.fn(() => true),
  scrapeProperty: vi.fn(async () => []),
  MAX_SCRAPES: 4,
}));

vi.mock('@/lib/llm', () => ({
  getLLMClient: vi.fn(),
  openaiModel: (n: string) => n,
}));

// Quiet the logger.
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  parseAnalysisResponse,
  mergePropertyFields,
  analyzeProperty,
  missingResearchKeys,
  buildEvidence,
  type RawAnalysisResponse,
  type PropertyRecord,
} from '@/lib/property-analysis';
import { tavilyConfigured, searchProperty } from '@/lib/research/tavily';
import { firecrawlConfigured, scrapeProperty } from '@/lib/research/firecrawl';
import { getLLMClient } from '@/lib/llm';

const mockedTavilyConfigured = vi.mocked(tavilyConfigured);
const mockedSearch = vi.mocked(searchProperty);
const mockedFirecrawlConfigured = vi.mocked(firecrawlConfigured);
const mockedScrape = vi.mocked(scrapeProperty);
const mockedGetLLM = vi.mocked(getLLMClient);

// A complete, all-null raw response we can selectively override per test.
function emptyRaw(): RawAnalysisResponse {
  return {
    beds: null, bedsSource: null,
    baths: null, bathsSource: null,
    squareFeet: null, squareFeetSource: null,
    lotSizeSqft: null, lotSizeSqftSource: null,
    yearBuilt: null, yearBuiltSource: null,
    propertyType: null, propertyTypeSource: null,
    listPrice: null, listPriceSource: null,
    listingStatus: null, listingStatusSource: null,
    listingUrl: null,
    estimatedValue: null, estimatedValueSource: null,
    lastSoldPrice: null, lastSoldPriceSource: null,
    lastSoldDate: null, lastSoldDateSource: null,
    description: null, descriptionSource: null,
    features: [],
    hoaFee: null, hoaFeeSource: null,
    propertyTaxes: null, propertyTaxesSource: null,
    photoUrls: [],
    summary: '',
  };
}

function baseRecord(overrides: Partial<PropertyRecord> = {}): PropertyRecord {
  return {
    id: 'prop_1',
    address: '123 Main St',
    unitNumber: null,
    city: 'Oakland',
    stateRegion: 'CA',
    postalCode: '94601',
    mlsNumber: null,
    propertyType: null,
    beds: null,
    baths: null,
    squareFeet: null,
    lotSizeSqft: null,
    yearBuilt: null,
    listPrice: null,
    listingStatus: 'active',
    listingUrl: null,
    photos: [],
    notes: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedTavilyConfigured.mockReturnValue(true);
  mockedFirecrawlConfigured.mockReturnValue(true);
  mockedSearch.mockResolvedValue([]);
  mockedScrape.mockResolvedValue([]);
});

afterEach(() => {
  delete process.env.TAVILY_API_KEY;
  delete process.env.FIRECRAWL_API_KEY;
});

// ── parseAnalysisResponse ─────────────────────────────────────────────────────

describe('parseAnalysisResponse', () => {
  it('all-null response → all fields null, empty arrays, no sources', () => {
    const { fields, fieldSources, summary } = parseAnalysisResponse(emptyRaw());
    expect(fields.beds).toBeNull();
    expect(fields.listPrice).toBeNull();
    expect(fields.features).toEqual([]);
    expect(fields.photoUrls).toEqual([]);
    expect(fieldSources).toEqual({});
    expect(summary).toBe('');
  });

  it('records a source ONLY when the field has a value and the source is a URL', () => {
    const raw = emptyRaw();
    raw.beds = 3;
    raw.bedsSource = 'https://zillow.com/123';
    raw.baths = 2;
    raw.bathsSource = 'not-a-url'; // invalid → dropped
    raw.squareFeet = 1450;
    raw.squareFeetSource = null; // value but no source → no entry

    const { fields, fieldSources } = parseAnalysisResponse(raw);
    expect(fields.beds).toBe(3);
    expect(fieldSources.beds).toBe('https://zillow.com/123');
    // baths value kept, but its non-URL source is discarded.
    expect(fields.baths).toBe(2);
    expect(fieldSources.baths).toBeUndefined();
    // sqft kept, no source recorded.
    expect(fields.squareFeet).toBe(1450);
    expect(fieldSources.squareFeet).toBeUndefined();
  });

  it('drops a source when its field is null (no orphan provenance)', () => {
    const raw = emptyRaw();
    raw.beds = null;
    raw.bedsSource = 'https://zillow.com/123'; // source but no value → dropped
    const { fieldSources } = parseAnalysisResponse(raw);
    expect(fieldSources.beds).toBeUndefined();
  });

  it('validates propertyType + listingStatus against the canonical enums', () => {
    const raw = emptyRaw();
    raw.propertyType = 'mansion'; // not canonical
    raw.propertyTypeSource = 'https://x.com';
    raw.listingStatus = 'for_sale'; // not canonical (should be "active")
    const { fields } = parseAnalysisResponse(raw);
    expect(fields.propertyType).toBeNull();
    expect(fields.listingStatus).toBeNull();

    raw.propertyType = 'condo';
    raw.listingStatus = 'sold';
    const ok = parseAnalysisResponse(raw);
    expect(ok.fields.propertyType).toBe('condo');
    expect(ok.fields.listingStatus).toBe('sold');
  });

  it('rejects negative numbers and non-finite values (clamps to null)', () => {
    const raw = emptyRaw();
    raw.beds = -1;
    raw.listPrice = Number.NaN as unknown as number;
    const { fields } = parseAnalysisResponse(raw);
    expect(fields.beds).toBeNull();
    expect(fields.listPrice).toBeNull();
  });

  it('filters photo URLs to http(s) and caps features', () => {
    const raw = emptyRaw();
    raw.photoUrls = ['https://img/a.jpg', 'javascript:alert(1)', 'ftp://x/y', 'http://img/b.jpg'];
    raw.features = Array.from({ length: 40 }, (_, i) => `feature ${i}`);
    const { fields } = parseAnalysisResponse(raw);
    expect(fields.photoUrls).toEqual(['https://img/a.jpg', 'http://img/b.jpg']);
    expect(fields.features).toHaveLength(30);
  });

  it('only keeps listingUrl when it is a valid http(s) URL', () => {
    const raw = emptyRaw();
    raw.listingUrl = 'redfin.com/123'; // no scheme → dropped
    expect(parseAnalysisResponse(raw).fields.listingUrl).toBeNull();
    raw.listingUrl = 'https://redfin.com/123';
    expect(parseAnalysisResponse(raw).fields.listingUrl).toBe('https://redfin.com/123');
  });
});

// ── mergePropertyFields ───────────────────────────────────────────────────────

describe('mergePropertyFields', () => {
  const fullFields = {
    beds: 4, baths: 3, squareFeet: 2200.7, lotSizeSqft: 5000.2, yearBuilt: 1998.0,
    propertyType: 'single_family', listPrice: 750000, listingStatus: 'active',
    listingUrl: 'https://zillow.com/123', estimatedValue: 760000, lastSoldPrice: 600000,
    lastSoldDate: 'Mar 2019', description: 'Nice', features: ['pool'], hoaFee: null,
    propertyTaxes: null, photoUrls: ['https://img/a.jpg'],
  };

  it('fills every empty column from the analyzed fields', () => {
    const patch = mergePropertyFields(
      { propertyType: null, beds: null, baths: null, squareFeet: null, lotSizeSqft: null, yearBuilt: null, listPrice: null, listingUrl: null, photos: [] },
      fullFields,
    );
    expect(patch).toEqual({
      beds: 4,
      baths: 3,
      squareFeet: 2201, // rounded
      lotSizeSqft: 5000, // rounded
      yearBuilt: 1998,
      propertyType: 'single_family',
      listPrice: 750000,
      listingUrl: 'https://zillow.com/123',
      photos: ['https://img/a.jpg'],
    });
  });

  it('NEVER overwrites a non-null human-entered value', () => {
    const patch = mergePropertyFields(
      {
        propertyType: 'condo', // human said condo
        beds: 2, // human said 2
        baths: null,
        squareFeet: 999, // human value
        lotSizeSqft: null,
        yearBuilt: null,
        listPrice: 500000, // human value
        listingUrl: 'https://human-entered.com',
        photos: ['https://human/photo.jpg'],
      },
      fullFields,
    );
    // Only the genuinely-empty columns get filled.
    expect(patch).toEqual({
      baths: 3,
      lotSizeSqft: 5000,
      yearBuilt: 1998,
    });
    // Human values are absent from the patch entirely.
    expect(patch).not.toHaveProperty('beds');
    expect(patch).not.toHaveProperty('propertyType');
    expect(patch).not.toHaveProperty('squareFeet');
    expect(patch).not.toHaveProperty('listPrice');
    expect(patch).not.toHaveProperty('listingUrl');
    expect(patch).not.toHaveProperty('photos');
  });

  it('treats an empty-string listingUrl as empty and fills it', () => {
    const patch = mergePropertyFields(
      { propertyType: null, beds: 1, baths: 1, squareFeet: 1, lotSizeSqft: 1, yearBuilt: 1, listPrice: 1, listingUrl: '', photos: ['x'] },
      fullFields,
    );
    expect(patch.listingUrl).toBe('https://zillow.com/123');
  });

  it('produces an empty patch when nothing was found', () => {
    const patch = mergePropertyFields(
      { propertyType: null, beds: null, baths: null, squareFeet: null, lotSizeSqft: null, yearBuilt: null, listPrice: null, listingUrl: null, photos: [] },
      {
        beds: null, baths: null, squareFeet: null, lotSizeSqft: null, yearBuilt: null,
        propertyType: null, listPrice: null, listingStatus: null, listingUrl: null,
        estimatedValue: null, lastSoldPrice: null, lastSoldDate: null, description: null,
        features: [], hoaFee: null, propertyTaxes: null, photoUrls: [],
      },
    );
    expect(patch).toEqual({});
  });

  it('does not add photos when the record already has some', () => {
    const patch = mergePropertyFields(
      { propertyType: null, beds: null, baths: null, squareFeet: null, lotSizeSqft: null, yearBuilt: null, listPrice: null, listingUrl: null, photos: ['https://existing.jpg'] },
      fullFields,
    );
    expect(patch).not.toHaveProperty('photos');
  });
});

// ── missingResearchKeys / not-configured fallback ─────────────────────────────

describe('missing-key fallback', () => {
  it('missingResearchKeys reports both when neither client is configured', () => {
    mockedTavilyConfigured.mockReturnValue(false);
    mockedFirecrawlConfigured.mockReturnValue(false);
    expect(missingResearchKeys()).toEqual(['TAVILY_API_KEY', 'FIRECRAWL_API_KEY']);
  });

  it('reports only the missing one', () => {
    mockedTavilyConfigured.mockReturnValue(true);
    mockedFirecrawlConfigured.mockReturnValue(false);
    expect(missingResearchKeys()).toEqual(['FIRECRAWL_API_KEY']);
  });

  it('analyzeProperty returns not_configured and never calls the clients', async () => {
    mockedTavilyConfigured.mockReturnValue(false);
    mockedFirecrawlConfigured.mockReturnValue(true);

    const outcome = await analyzeProperty(baseRecord());

    expect(outcome.status).toBe('not_configured');
    if (outcome.status === 'not_configured') {
      expect(outcome.missing).toEqual(['TAVILY_API_KEY']);
    }
    // The expensive clients must NOT be touched when unconfigured.
    expect(mockedSearch).not.toHaveBeenCalled();
    expect(mockedScrape).not.toHaveBeenCalled();
    expect(mockedGetLLM).not.toHaveBeenCalled();
  });
});

// ── analyzeProperty orchestration (clients stubbed) ───────────────────────────

describe('analyzeProperty orchestration', () => {
  it('no search results → no_evidence, no scrape/LLM', async () => {
    mockedSearch.mockResolvedValue([]);

    const outcome = await analyzeProperty(baseRecord());

    expect(outcome.status).toBe('no_evidence');
    expect(mockedScrape).not.toHaveBeenCalled();
    expect(mockedGetLLM).not.toHaveBeenCalled();
  });

  it('happy path: search → scrape → LLM → ok with a fill-empty patch', async () => {
    mockedSearch.mockResolvedValue([
      { query: 'q', url: 'https://zillow.com/123', title: 'Zillow listing', snippet: 'snip', score: 0.9 },
    ]);
    mockedScrape.mockResolvedValue([
      {
        sourceUrl: 'https://zillow.com/123',
        address: '123 Main St',
        beds: 3, baths: 2, squareFeet: 1450, lotSizeSqft: null, yearBuilt: 1990,
        propertyType: 'Single Family', listPrice: 700000, estimateValue: null,
        lastSoldPrice: null, lastSoldDate: null, listingStatus: 'For sale',
        description: null, features: [], hoaFee: null, propertyTaxes: null, photoUrls: [],
      },
    ]);

    // Stub the LLM to return a grounded structured response.
    const raw = emptyRaw();
    raw.beds = 3; raw.bedsSource = 'https://zillow.com/123';
    raw.baths = 2; raw.bathsSource = 'https://zillow.com/123';
    raw.squareFeet = 1450; raw.squareFeetSource = 'https://zillow.com/123';
    raw.yearBuilt = 1990; raw.yearBuiltSource = 'https://zillow.com/123';
    raw.propertyType = 'single_family'; raw.propertyTypeSource = 'https://zillow.com/123';
    raw.listPrice = 700000; raw.listPriceSource = 'https://zillow.com/123';
    raw.summary = '3 bed / 2 bath single-family home listed at $700,000.';

    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(raw) } }],
    });
    mockedGetLLM.mockReturnValue({ chat: { completions: { create } } } as never);

    const outcome = await analyzeProperty(baseRecord());

    expect(outcome.status).toBe('ok');
    if (outcome.status === 'ok') {
      // Patch fills empty columns from the grounded fields.
      expect(outcome.patch).toMatchObject({
        beds: 3, baths: 2, squareFeet: 1450, yearBuilt: 1990,
        propertyType: 'single_family', listPrice: 700000,
      });
      // The persisted blob carries summary + per-field sources + sources list.
      expect(outcome.analysis.summary).toContain('$700,000');
      expect(outcome.analysis.fieldSources.beds).toBe('https://zillow.com/123');
      expect(outcome.analysis.sources.map((s) => s.url)).toContain('https://zillow.com/123');
      expect(outcome.analysis.stats).toEqual({ searchResults: 1, scraped: 1 });
      expect(typeof outcome.analysis.analyzedAt).toBe('string');
    }
    expect(create).toHaveBeenCalledOnce();
  });

  it('LLM throws → error outcome (never throws out of analyzeProperty)', async () => {
    mockedSearch.mockResolvedValue([
      { query: 'q', url: 'https://x.com/1', title: 't', snippet: 's' },
    ]);
    mockedScrape.mockResolvedValue([]);
    const create = vi.fn().mockRejectedValue(new Error('boom'));
    mockedGetLLM.mockReturnValue({ chat: { completions: { create } } } as never);

    const outcome = await analyzeProperty(baseRecord());
    expect(outcome.status).toBe('error');
  });

  it('happy path with an already-complete record → ok but EMPTY patch', async () => {
    mockedSearch.mockResolvedValue([
      { query: 'q', url: 'https://zillow.com/123', title: 'Zillow', snippet: 's', score: 1 },
    ]);
    mockedScrape.mockResolvedValue([]);
    const raw = emptyRaw();
    raw.beds = 3; raw.bedsSource = 'https://zillow.com/123';
    raw.summary = 'summary';
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(raw) } }],
    });
    mockedGetLLM.mockReturnValue({ chat: { completions: { create } } } as never);

    // Record already has beds set by a human.
    const outcome = await analyzeProperty(baseRecord({ beds: 5 }));
    expect(outcome.status).toBe('ok');
    if (outcome.status === 'ok') {
      // Human's beds=5 is not overwritten; nothing else found → empty patch.
      expect(outcome.patch).toEqual({});
    }
  });
});

// ── buildEvidence ─────────────────────────────────────────────────────────────

describe('buildEvidence', () => {
  it('caps search snippets to 8 and passes pages through', () => {
    const results = Array.from({ length: 12 }, (_, i) => ({
      query: 'q', url: `https://x.com/${i}`, title: `t${i}`, snippet: `s${i}`, score: 1,
    }));
    const evidence = buildEvidence({ address: '123 Main St' }, results, []);
    expect(evidence.searchSnippets).toHaveLength(8);
    expect(evidence.pages).toEqual([]);
    expect(evidence.subject.address).toBe('123 Main St');
  });
});
