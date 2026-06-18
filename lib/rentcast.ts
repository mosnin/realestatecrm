/**
 * RentCast — server-only transport client for the CMA value/comparables engine.
 *
 * Powers the "real market data" path of `buildCma`: given a subject address +
 * attributes, RentCast's AVM endpoint returns an estimated value, a value range,
 * and an array of nearby comparable listings (real sold/active prices, distances,
 * recency). We map that into the CMA payload shapes.
 *
 * Gated on `RENTCAST_API_KEY` — when it's missing, `rentcastConfigured()` is
 * false and the CMA engine falls back to in-house Property rows. Callers get
 * normalised data or `null` on ANY upstream failure (missing key, network error,
 * timeout, non-2xx, address-not-found, unparseable body) so the fallback path is
 * always reachable without a throw. The key never leaves this module.
 *
 * API base: https://api.rentcast.io/v1   Auth header: X-Api-Key: <key>
 * Endpoint:  GET /avm/value
 *   https://developers.rentcast.io/reference/value-estimate
 */

import 'server-only';
import { logger } from '@/lib/logger';

const RENTCAST_BASE = 'https://api.rentcast.io/v1';
const REQUEST_TIMEOUT_MS = 12_000;

/** RentCast's `compCount` is clamped 5–25; we ask for ~10 strong comps. */
const DEFAULT_COMP_COUNT = 10;

// ── Config ────────────────────────────────────────────────────────────────────

/** True when the server-side API key is present. */
export function rentcastConfigured(): boolean {
  return Boolean(process.env.RENTCAST_API_KEY);
}

// ── Request input ──────────────────────────────────────────────────────────────

/**
 * Subject attributes forwarded to `/avm/value`. Only `address` is strictly
 * required by RentCast (it can infer the rest), but supplying beds/baths/sqft/
 * type yields tighter comps.
 */
export interface RentcastValueInput {
  address: string;
  /** RentCast's enum, e.g. "Single Family" | "Condo" | "Townhouse" | … */
  propertyType?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  squareFootage?: number | null;
  /** 5–25; defaults to DEFAULT_COMP_COUNT. */
  compCount?: number | null;
}

// ── Normalised output (RentCast's exact field names, narrowed + validated) ──────

/** One comparable from RentCast, after defensive parsing. `price` is required. */
export interface RentcastComparable {
  id: string | null;
  formattedAddress: string;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  propertyType: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  squareFootage: number | null;
  price: number;
  /** RentCast listing type, e.g. "Standard" | "New Construction" | "Foreclosure". */
  listingType: string | null;
  /** Distance from the subject, in miles. */
  distance: number | null;
  /** Days since the comparable last appeared on the market. */
  daysOld: number | null;
  /** RentCast's similarity score, 0–1 (higher = more comparable). */
  correlation: number | null;
}

/** The normalised AVM result. `null` from `getValueEstimate` means "fall back". */
export interface RentcastValueResult {
  /** RentCast's point estimate of the subject's value. */
  price: number | null;
  priceRangeLow: number | null;
  priceRangeHigh: number | null;
  latitude: number | null;
  longitude: number | null;
  comparables: RentcastComparable[];
}

// ── Defensive coercion helpers ─────────────────────────────────────────────────

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * Map one raw comparable. Returns null when the row lacks the two fields a comp
 * is useless without: a usable address and a positive price. The CMA never
 * surfaces a $0/blank comp.
 */
function parseComparable(raw: unknown): RentcastComparable | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;

  const price = num(c.price);
  if (price == null || price <= 0) return null;

  const formattedAddress = str(c.formattedAddress) ?? str(c.addressLine1);
  if (!formattedAddress) return null;

  return {
    id: str(c.id),
    formattedAddress,
    city: str(c.city),
    state: str(c.state),
    zipCode: str(c.zipCode),
    propertyType: str(c.propertyType),
    bedrooms: num(c.bedrooms),
    bathrooms: num(c.bathrooms),
    squareFootage: num(c.squareFootage),
    price,
    listingType: str(c.listingType),
    distance: num(c.distance),
    daysOld: num(c.daysOld),
    correlation: num(c.correlation),
  };
}

/** Validate + normalise the whole `/avm/value` body. Null on a useless shape. */
function parseValueResponse(raw: unknown): RentcastValueResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const rawComps = Array.isArray(r.comparables) ? r.comparables : [];
  const comparables = rawComps
    .map(parseComparable)
    .filter((c): c is RentcastComparable => c !== null);

  const price = num(r.price);

  // A result with neither a value estimate nor a single usable comp is no better
  // than no data — let the caller fall back rather than render an empty report.
  if (price == null && comparables.length === 0) return null;

  return {
    price,
    priceRangeLow: num(r.priceRangeLow),
    priceRangeHigh: num(r.priceRangeHigh),
    latitude: num(r.latitude),
    longitude: num(r.longitude),
    comparables,
  };
}

// ── Public API ──────────────────────────────────────────────────────────────────

/**
 * Fetch a value estimate + comparables for a subject from RentCast's AVM.
 *
 * Returns normalised data, or `null` on ANY failure (unconfigured key, bad
 * input, network/timeout, non-2xx, address-not-found, unparseable/empty body).
 * Never throws — the CMA engine relies on `null` to trigger its in-house
 * fallback. The 404 "no record found" case is logged at debug, not error,
 * because an unknown address is an expected outcome, not a fault.
 */
export async function getValueEstimate(
  input: RentcastValueInput,
  opts?: { signal?: AbortSignal },
): Promise<RentcastValueResult | null> {
  const apiKey = process.env.RENTCAST_API_KEY;
  if (!apiKey) {
    logger.warn('[rentcast] RENTCAST_API_KEY not configured', {});
    return null;
  }

  const address = input.address?.trim();
  if (!address) return null;

  const params = new URLSearchParams();
  params.set('address', address);
  if (input.propertyType) params.set('propertyType', input.propertyType);
  if (input.bedrooms != null && Number.isFinite(input.bedrooms)) {
    params.set('bedrooms', String(input.bedrooms));
  }
  if (input.bathrooms != null && Number.isFinite(input.bathrooms)) {
    params.set('bathrooms', String(input.bathrooms));
  }
  if (input.squareFootage != null && Number.isFinite(input.squareFootage) && input.squareFootage > 0) {
    params.set('squareFootage', String(input.squareFootage));
  }
  const compCount = input.compCount ?? DEFAULT_COMP_COUNT;
  params.set('compCount', String(Math.min(25, Math.max(5, Math.round(compCount)))));

  // Combine our own timeout with any caller-provided signal (e.g. request abort).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  if (opts?.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    const res = await fetch(`${RENTCAST_BASE}/avm/value?${params.toString()}`, {
      method: 'GET',
      headers: {
        'X-Api-Key': apiKey,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    // 404 = RentCast has no record for this address. Expected, not an error.
    if (res.status === 404) {
      logger.debug('[rentcast] no record for address', { status: 404 });
      return null;
    }

    if (!res.ok) {
      logger.warn('[rentcast] value estimate non-ok', { status: res.status });
      return null;
    }

    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      logger.warn('[rentcast] value estimate body not JSON', { status: res.status });
      return null;
    }

    return parseValueResponse(body);
  } catch (err) {
    // Timeout (AbortError) or network failure — fall back, don't throw.
    logger.warn('[rentcast] value estimate request failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  } finally {
    clearTimeout(timer);
    if (opts?.signal) opts.signal.removeEventListener('abort', onAbort);
  }
}
