/**
 * Firecrawl scrape client — the ONLY module that talks to Firecrawl.
 *
 * Firecrawl turns a messy listing/record page (Zillow, Redfin, Realtor.com,
 * county records) into clean structured data. For the Property "Analyze" feature
 * we use its `/v1/scrape` endpoint in EXTRACT mode: we hand it a JSON schema for
 * the SUBJECT property's facts and it returns the fields filled from THAT page.
 * That's the structured-evidence stage of the pipeline — far more reliable than
 * asking the synthesis LLM to read raw HTML/markdown.
 *
 * Gated entirely on `FIRECRAWL_API_KEY`. Cost/latency posture: scrapes run in
 * parallel, each with its own per-scrape timeout, and the count is capped. A
 * single slow or blocked page degrades to one fewer piece of evidence rather
 * than stalling the Analyze run. The scrape stage never throws (except on a
 * missing key, which the orchestrator guards against with `firecrawlConfigured`).
 */

import 'server-only';
import { logger } from '@/lib/logger';

const FIRECRAWL_SCRAPE_ENDPOINT = 'https://api.firecrawl.dev/v1/scrape';

/** Per-page scrape timeout. Generous (rendering is slow) but bounded. */
const PER_SCRAPE_TIMEOUT_MS = 20_000;

/** Hard cap on pages scraped per Analyze run — bounds cost + latency. */
export const MAX_SCRAPES = 4;

/** True when Firecrawl is configured. */
export function firecrawlConfigured(): boolean {
  return Boolean(process.env.FIRECRAWL_API_KEY);
}

/**
 * Extraction schema handed to Firecrawl, one object per page describing THE
 * subject property. Unlike the CMA comps schema (an array of nearby homes), here
 * every field is about the single property the page is for. All fields optional
 * — a given page (e.g. a tax record) only fills what it shows.
 */
const EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    address: { type: 'string', description: 'Full street address of the property on this page.' },
    beds: { type: 'number', description: 'Number of bedrooms.' },
    baths: { type: 'number', description: 'Number of bathrooms (may be fractional, e.g. 2.5).' },
    squareFeet: { type: 'number', description: 'Interior living area in square feet.' },
    lotSizeSqft: { type: 'number', description: 'Lot size in square feet (convert acres if needed).' },
    yearBuilt: { type: 'number', description: 'Year the home was built.' },
    propertyType: {
      type: 'string',
      description: 'e.g. Single Family, Condo, Townhouse, Multi-Family, Land.',
    },
    listPrice: { type: 'number', description: 'Current list / asking price in USD, if for sale.' },
    estimateValue: {
      type: 'number',
      description: 'Site estimate (Zestimate / Redfin Estimate) in USD, if shown.',
    },
    lastSoldPrice: { type: 'number', description: 'Most recent SALE price in USD, if shown.' },
    lastSoldDate: { type: 'string', description: 'Most recent sale date as shown (e.g. "Mar 2023").' },
    listingStatus: {
      type: 'string',
      description: 'e.g. For sale, Pending, Sold, Off market.',
    },
    description: { type: 'string', description: 'The listing description / property remarks.' },
    features: {
      type: 'array',
      items: { type: 'string' },
      description: 'Notable features (e.g. "renovated kitchen", "pool", "2-car garage").',
    },
    hoaFee: { type: 'string', description: 'HOA fee as shown (e.g. "$350/mo"), if any.' },
    propertyTaxes: { type: 'string', description: 'Annual property taxes as shown, if any.' },
    photoUrls: {
      type: 'array',
      items: { type: 'string' },
      description: 'Direct image URLs of the property photos on this page.',
    },
  },
};

const EXTRACT_PROMPT =
  'Extract the facts about the single property this page is for: full address, beds, baths, ' +
  'interior square feet, lot size, year built, property type, current list price, site estimate ' +
  '(Zestimate / Redfin Estimate), most recent sale price and date, listing status, the listing ' +
  'description, notable features, HOA fee, annual property taxes, and direct photo image URLs. ' +
  'Only capture values actually shown on this page — never infer or invent. Leave anything not ' +
  'present unset.';

/** The structured facts extracted from one scraped page about the property. */
export interface ScrapedProperty {
  sourceUrl: string;
  address: string | null;
  beds: number | null;
  baths: number | null;
  squareFeet: number | null;
  lotSizeSqft: number | null;
  yearBuilt: number | null;
  propertyType: string | null;
  listPrice: number | null;
  estimateValue: number | null;
  lastSoldPrice: number | null;
  lastSoldDate: string | null;
  listingStatus: string | null;
  description: string | null;
  features: string[];
  hoaFee: string | null;
  propertyTaxes: string | null;
  photoUrls: string[];
}

interface FirecrawlExtractItem {
  address?: unknown;
  beds?: unknown;
  baths?: unknown;
  squareFeet?: unknown;
  lotSizeSqft?: unknown;
  yearBuilt?: unknown;
  propertyType?: unknown;
  listPrice?: unknown;
  estimateValue?: unknown;
  lastSoldPrice?: unknown;
  lastSoldDate?: unknown;
  listingStatus?: unknown;
  description?: unknown;
  features?: unknown;
  hoaFee?: unknown;
  propertyTaxes?: unknown;
  photoUrls?: unknown;
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}
function str(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}
function strArr(v: unknown, max: number, cap: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map((x) => x.trim().slice(0, max))
    .slice(0, cap);
}

/** Shape the raw extract into a typed, length-bounded ScrapedProperty. */
function coerce(raw: FirecrawlExtractItem, sourceUrl: string): ScrapedProperty {
  return {
    sourceUrl,
    address: str(raw.address, 300),
    beds: num(raw.beds),
    baths: num(raw.baths),
    squareFeet: num(raw.squareFeet),
    lotSizeSqft: num(raw.lotSizeSqft),
    yearBuilt: num(raw.yearBuilt),
    propertyType: str(raw.propertyType, 60),
    listPrice: num(raw.listPrice),
    estimateValue: num(raw.estimateValue),
    lastSoldPrice: num(raw.lastSoldPrice),
    lastSoldDate: str(raw.lastSoldDate, 60),
    listingStatus: str(raw.listingStatus, 60),
    description: str(raw.description, 4000),
    features: strArr(raw.features, 160, 30),
    hoaFee: str(raw.hoaFee, 60),
    propertyTaxes: str(raw.propertyTaxes, 60),
    photoUrls: strArr(raw.photoUrls, 1000, 20),
  };
}

/** True if a scrape produced at least one usable signal beyond the URL. */
function hasSignal(p: ScrapedProperty): boolean {
  return Boolean(
    p.address ||
      p.beds != null ||
      p.baths != null ||
      p.squareFeet != null ||
      p.lotSizeSqft != null ||
      p.yearBuilt != null ||
      p.propertyType ||
      p.listPrice != null ||
      p.estimateValue != null ||
      p.lastSoldPrice != null ||
      p.lastSoldDate ||
      p.listingStatus ||
      p.description ||
      p.features.length > 0 ||
      p.hoaFee ||
      p.propertyTaxes ||
      p.photoUrls.length > 0,
  );
}

/** Scrape + extract one URL. Returns null on failure or empty result (fail-soft). */
async function scrapeOne(
  apiKey: string,
  url: string,
  signal?: AbortSignal,
): Promise<ScrapedProperty | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PER_SCRAPE_TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const res = await fetch(FIRECRAWL_SCRAPE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: ctrl.signal,
      body: JSON.stringify({
        url,
        formats: ['extract'],
        onlyMainContent: true,
        extract: { schema: EXTRACT_SCHEMA, prompt: EXTRACT_PROMPT },
      }),
    });
    if (!res.ok) {
      logger.warn('[firecrawl] scrape non-200', { status: res.status });
      return null;
    }
    const json = (await res.json()) as {
      success?: boolean;
      data?: { extract?: FirecrawlExtractItem };
    };
    const extract = json.data?.extract;
    if (!extract || typeof extract !== 'object') return null;
    const shaped = coerce(extract, url);
    return hasSignal(shaped) ? shaped : null;
  } catch (err) {
    logger.warn('[firecrawl] scrape failed', {
      err: err instanceof Error ? err.message : 'unknown',
    });
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * Scrape the given URLs (capped to MAX_SCRAPES) in parallel and return the
 * per-page structured facts for the subject property. Throws only if the key is
 * missing. Per-page failures degrade to fewer evidence pages, never an error.
 */
export async function scrapeProperty(
  urls: string[],
  signal?: AbortSignal,
): Promise<ScrapedProperty[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error('FIRECRAWL_API_KEY not configured');

  const targets = [...new Set(urls)].slice(0, MAX_SCRAPES);
  const results = await Promise.all(targets.map((u) => scrapeOne(apiKey, u, signal)));
  return results.filter((r): r is ScrapedProperty => r !== null);
}
