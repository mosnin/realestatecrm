/**
 * Apify property scraper — optional.
 *
 * Given a public listing URL, run an Apify actor and map the first dataset item
 * into a Property prefill the realtor reviews before saving. Token-gated: if
 * APIFY_TOKEN is unset the feature is a clean no-op (`apifyConfigured()` is
 * false) and callers degrade quietly. Server-side only — never import the
 * runtime into a client bundle (use `import type` for PropertyPrefill).
 *
 * The actor is configurable via APIFY_PROPERTY_ACTOR so an operator can point
 * it at a listing-specific scraper; we default to a generic web scraper. Output
 * shapes vary across actors, so mapItem() reads a spread of common field names
 * with null fallbacks and returns null when nothing usable comes back.
 */

import { isValidPropertyType } from '@/lib/properties';
import type { PropertyType } from '@/lib/types';
import { logger } from '@/lib/logger';

const APIFY_BASE = 'https://api.apify.com/v2';
const DEFAULT_ACTOR = 'apify~web-scraper';

export interface PropertyPrefill {
  address: string | null;
  unitNumber: string | null;
  city: string | null;
  stateRegion: string | null;
  postalCode: string | null;
  beds: number | null;
  baths: number | null;
  squareFeet: number | null;
  listPrice: number | null;
  propertyType: PropertyType | null;
  listingUrl: string | null;
  photos: string[];
  notes: string | null;
}

export function apifyConfigured(): boolean {
  return Boolean(process.env.APIFY_TOKEN);
}

function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function firstOf(item: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    const val = item[k];
    if (val != null && val !== '') return val;
  }
  return null;
}

/**
 * Run the configured actor against a URL and map the first dataset item.
 * Returns null when unconfigured, on any error/timeout, or when nothing usable
 * is extracted. Never throws.
 */
export async function runPropertyScrape(url: string): Promise<PropertyPrefill | null> {
  const token = process.env.APIFY_TOKEN;
  if (!token) return null;
  const actor = process.env.APIFY_PROPERTY_ACTOR || DEFAULT_ACTOR;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    // run-sync-get-dataset-items: start the actor, wait, and return its dataset
    // items in a single call (no separate run/poll round-trips).
    const res = await fetch(
      `${APIFY_BASE}/acts/${encodeURIComponent(actor)}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startUrls: [{ url }], maxRequestsPerCrawl: 1 }),
        signal: controller.signal,
      },
    );
    if (!res.ok) {
      logger.warn('[apify] actor run failed', { status: res.status });
      return null;
    }
    const items = (await res.json()) as unknown;
    const item = Array.isArray(items) ? (items[0] as Record<string, unknown> | undefined) : undefined;
    if (!item) return null;
    return mapItem(item, url);
  } catch (err) {
    logger.warn('[apify] scrape error', { err: err instanceof Error ? err.message : String(err) });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function mapItem(item: Record<string, unknown>, url: string): PropertyPrefill | null {
  const rawType = str(firstOf(item, ['homeType', 'propertyType', 'type']))
    ?.toLowerCase()
    .replace(/\s+/g, '_') ?? null;
  const propertyType = rawType && isValidPropertyType(rawType) ? (rawType as PropertyType) : null;

  const photosRaw = firstOf(item, ['photos', 'images', 'imageUrls', 'pictures']);
  const photos = Array.isArray(photosRaw)
    ? photosRaw
        .map((p) => (typeof p === 'string' ? p : str((p as Record<string, unknown>)?.url)))
        .filter((p): p is string => typeof p === 'string' && /^https?:\/\//i.test(p))
        .slice(0, 24)
    : [];

  const prefill: PropertyPrefill = {
    address: str(firstOf(item, ['address', 'streetAddress', 'addressStreet'])),
    unitNumber: str(firstOf(item, ['unit', 'unitNumber'])),
    city: str(firstOf(item, ['city', 'addressCity'])),
    stateRegion: str(firstOf(item, ['state', 'stateRegion', 'region', 'addressState'])),
    postalCode: str(firstOf(item, ['zipcode', 'zip', 'postalCode', 'addressZipcode'])),
    beds: num(firstOf(item, ['beds', 'bedrooms', 'numberOfBedrooms'])),
    baths: num(firstOf(item, ['baths', 'bathrooms', 'numberOfBathrooms'])),
    squareFeet: num(firstOf(item, ['sqft', 'squareFeet', 'livingArea', 'area'])),
    listPrice: num(firstOf(item, ['price', 'listPrice', 'unformattedPrice'])),
    propertyType,
    listingUrl: str(firstOf(item, ['url', 'listingUrl', 'detailUrl'])) ?? url,
    photos,
    notes: str(firstOf(item, ['description', 'summary', 'remarks'])),
  };

  const hasAnything = Object.entries(prefill).some(([k, v]) =>
    k !== 'listingUrl' && (Array.isArray(v) ? v.length > 0 : v != null),
  );
  return hasAnything ? prefill : null;
}
