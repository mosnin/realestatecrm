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

/**
 * The shared scrape-and-extract core: POST one URL to Firecrawl in EXTRACT mode
 * with the given schema + prompt and return the raw extract object (or null on
 * any failure). Both the property scraper and the area scraper use this so the
 * fetch / timeout / abort / non-200 handling lives in exactly one place.
 */
async function firecrawlExtract(
  apiKey: string,
  url: string,
  schema: Record<string, unknown>,
  prompt: string,
  signal?: AbortSignal,
): Promise<Record<string, unknown> | null> {
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
        extract: { schema, prompt },
      }),
    });
    if (!res.ok) {
      logger.warn('[firecrawl] scrape non-200', { status: res.status });
      return null;
    }
    const json = (await res.json()) as {
      success?: boolean;
      data?: { extract?: unknown };
    };
    const extract = json.data?.extract;
    if (!extract || typeof extract !== 'object') return null;
    return extract as Record<string, unknown>;
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

/** Scrape + extract one URL's property facts. Returns null on empty (fail-soft). */
async function scrapeOne(
  apiKey: string,
  url: string,
  signal?: AbortSignal,
): Promise<ScrapedProperty | null> {
  const extract = await firecrawlExtract(apiKey, url, EXTRACT_SCHEMA, EXTRACT_PROMPT, signal);
  if (!extract) return null;
  const shaped = coerce(extract as FirecrawlExtractItem, url);
  return hasSignal(shaped) ? shaped : null;
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

// ── Property IQ: area / neighborhood extraction ──────────────────────────────

/**
 * Extraction schema for an AREA page (Niche, GreatSchools, Walk Score, market
 * reports). Every field optional — a schools page fills the school fields, a
 * Walk Score page fills the scores, a market report fills the medians. The LLM
 * structuring step reconciles across pages.
 */
const AREA_EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    areaName: { type: 'string', description: 'The neighborhood / city / ZIP this page is about.' },
    schoolsSummary: { type: 'string', description: 'Summary of the schools serving this area.' },
    schoolRating: { type: 'string', description: 'Headline school rating as shown (e.g. "8/10", "A-").' },
    safetySummary: { type: 'string', description: 'Summary of crime / safety for this area.' },
    crimeLevel: { type: 'string', description: 'Relative crime level (e.g. "Lower than national average").' },
    walkScore: { type: 'number', description: 'Walk Score (0-100) if shown.' },
    transitScore: { type: 'number', description: 'Transit Score (0-100) if shown.' },
    walkabilitySummary: { type: 'string', description: 'How walkable / transit-friendly the area is.' },
    marketSummary: { type: 'string', description: 'Local housing market summary.' },
    medianListPrice: { type: 'number', description: 'Median list price in USD, if shown.' },
    medianSalePrice: { type: 'number', description: 'Median sale price in USD, if shown.' },
    medianDaysOnMarket: { type: 'number', description: 'Median days on market, if shown.' },
    amenitiesSummary: { type: 'string', description: 'Dining, parks, shopping, transit nearby.' },
    highlights: {
      type: 'array',
      items: { type: 'string' },
      description: 'Notable nearby places or features (e.g. "Zilker Park", "tech employers").',
    },
    lifestyleSummary: { type: 'string', description: 'Who the area suits and its general vibe.' },
    commuteSummary: { type: 'string', description: 'Commute / transit access summary.' },
  },
};

const AREA_EXTRACT_PROMPT =
  'Extract facts about the AREA (neighborhood / city / ZIP) this page is about: the schools and ' +
  'their ratings, crime / safety, Walk Score and Transit Score, the local housing ' +
  'market (median list price, median sale price, median days on market), nearby amenities, notable ' +
  'highlights, lifestyle / vibe, and commute access. Only capture values actually shown on this ' +
  'page; never infer or invent. Leave anything not present unset.';

/** Structured facts extracted from one scraped AREA page. */
export interface ScrapedArea {
  sourceUrl: string;
  areaName: string | null;
  schoolsSummary: string | null;
  schoolRating: string | null;
  safetySummary: string | null;
  crimeLevel: string | null;
  walkScore: number | null;
  transitScore: number | null;
  walkabilitySummary: string | null;
  marketSummary: string | null;
  medianListPrice: number | null;
  medianSalePrice: number | null;
  medianDaysOnMarket: number | null;
  amenitiesSummary: string | null;
  highlights: string[];
  lifestyleSummary: string | null;
  commuteSummary: string | null;
}

/** Shape the raw area extract into a typed, length-bounded ScrapedArea. */
function coerceArea(raw: Record<string, unknown>, sourceUrl: string): ScrapedArea {
  return {
    sourceUrl,
    areaName: str(raw.areaName, 160),
    schoolsSummary: str(raw.schoolsSummary, 1200),
    schoolRating: str(raw.schoolRating, 80),
    safetySummary: str(raw.safetySummary, 1200),
    crimeLevel: str(raw.crimeLevel, 120),
    walkScore: num(raw.walkScore),
    transitScore: num(raw.transitScore),
    walkabilitySummary: str(raw.walkabilitySummary, 1200),
    marketSummary: str(raw.marketSummary, 1200),
    medianListPrice: num(raw.medianListPrice),
    medianSalePrice: num(raw.medianSalePrice),
    medianDaysOnMarket: num(raw.medianDaysOnMarket),
    amenitiesSummary: str(raw.amenitiesSummary, 1200),
    highlights: strArr(raw.highlights, 160, 20),
    lifestyleSummary: str(raw.lifestyleSummary, 1200),
    commuteSummary: str(raw.commuteSummary, 1200),
  };
}

/** True if an area scrape produced at least one usable signal beyond the URL. */
function hasAreaSignal(p: ScrapedArea): boolean {
  return Boolean(
    p.schoolsSummary ||
      p.schoolRating ||
      p.safetySummary ||
      p.crimeLevel ||
      p.walkScore != null ||
      p.transitScore != null ||
      p.walkabilitySummary ||
      p.marketSummary ||
      p.medianListPrice != null ||
      p.medianSalePrice != null ||
      p.medianDaysOnMarket != null ||
      p.amenitiesSummary ||
      p.highlights.length > 0 ||
      p.lifestyleSummary ||
      p.commuteSummary,
  );
}

/**
 * Scrape the given AREA URLs (capped to MAX_SCRAPES) in parallel and return the
 * per-page structured facts. Same posture as scrapeProperty: throws only on a
 * missing key; per-page failures degrade to fewer evidence pages.
 */
export async function scrapeArea(
  urls: string[],
  signal?: AbortSignal,
): Promise<ScrapedArea[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error('FIRECRAWL_API_KEY not configured');

  const targets = [...new Set(urls)].slice(0, MAX_SCRAPES);
  const results = await Promise.all(
    targets.map(async (u) => {
      const extract = await firecrawlExtract(apiKey, u, AREA_EXTRACT_SCHEMA, AREA_EXTRACT_PROMPT, signal);
      if (!extract) return null;
      const shaped = coerceArea(extract, u);
      return hasAreaSignal(shaped) ? shaped : null;
    }),
  );
  return results.filter((r): r is ScrapedArea => r !== null);
}
