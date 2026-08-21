/**
 * CMA (Comparative Market Analysis) — comp/valuation engine.
 *
 * Primary source: RentCast market data. For a subject (address + beds/baths/
 * sqft/type) `buildCma` calls RentCast's AVM (`GET /avm/value`), which returns
 * an estimated value, a value range, and an array of nearby comparable sales.
 * Those real comps + range drive the headline numbers. The workspace's own
 * Property rows are merged in as ADDITIONAL (secondary) comparables.
 *
 * Fallback source: if `RENTCAST_API_KEY` is unset, or RentCast errors / times
 * out / has no match, `buildCma` falls back to the in-house Property-only logic
 * and LABELS the report's data source honestly (`dataSource`), so the realtor
 * and the seller always know whether they're looking at market data or CRM data.
 *
 * MLS is a FUTURE source: a direct MLS/IDX feed is a non-trivial integration
 * pending data-access approval (each MLS has its own license + RESO/RETS or
 * Web API connection), so it is not wired up today. Today's comps come from
 * RentCast plus the workspace's own Property rows.
 *
 * The stat math lives in small pure helpers (`median`, `computeStats`) so the
 * computation is unit-testable without a database or a network call. `buildCma`
 * returns a frozen payload the public report page renders verbatim.
 */

import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
import { logger } from '@/lib/logger';
import {
  rentcastConfigured,
  getValueEstimate,
  type RentcastComparable,
  type RentcastValueResult,
} from '@/lib/rentcast';
import type {
  CmaDataSource,
  CmaDataSourceReason,
  CmaSubject,
  CmaComp,
  CmaStats,
  CmaPayload,
  SubjectFields,
} from '@/lib/cma-types';

// Re-export the payload shapes + label so existing `@/lib/cma` imports are
// unchanged. The shapes themselves live in lib/cma-types (no server-only deps)
// so CLIENT components can import them without pulling in lib/rentcast.
export { DATA_SOURCE_LABEL } from '@/lib/cma-types';
export type {
  CmaDataSource,
  CmaSubject,
  CmaComp,
  CmaStats,
  CmaPayload,
  SubjectFields,
} from '@/lib/cma-types';

// ── Pure stat helpers (the unit-tested core) ─────────────────────────────────

/** Median of a numeric list. Empty → null. */
export function median(values: number[]): number | null {
  const xs = values.filter((n) => Number.isFinite(n)).slice().sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 === 0 ? (xs[mid - 1] + xs[mid]) / 2 : xs[mid];
}

/**
 * Compute the headline stats from a set of comps + the subject.
 *
 * - low / median / high from comps that have a usable price.
 * - avgPricePerSqft from comps with both price and sqft.
 * - suggested range: caller-supplied `suggestedRange` wins (RentCast's own value
 *   range). Otherwise, if the subject has sqft and a $/sqft signal, the range is
 *   the subject sqft × the comp $/sqft band; else the raw price low/high — so
 *   there's always a defensible range when comps exist.
 */
export function computeStats(
  comps: CmaComp[],
  subject: CmaSubject,
  opts?: {
    /** RentCast's value range — preferred suggested range when present. */
    suggestedRange?: { low: number | null; high: number | null } | null;
    /** RentCast's point value estimate for the subject. */
    estimatedValue?: number | null;
  },
): CmaStats {
  const priced = comps.filter((c) => c.price != null && c.price > 0) as Array<
    CmaComp & { price: number }
  >;
  const prices = priced.map((c) => c.price);

  const ppsfList = comps
    .filter((c) => c.pricePerSqft != null && c.pricePerSqft > 0)
    .map((c) => c.pricePerSqft as number);

  const avgPricePerSqft =
    ppsfList.length > 0
      ? Math.round(ppsfList.reduce((s, n) => s + n, 0) / ppsfList.length)
      : null;

  // Basis: did the priced comps come from sold data, list data, or both?
  let basis: CmaStats['basis'] = 'none';
  if (priced.length > 0) {
    const sold = priced.filter((c) => c.priceBasis === 'sold').length;
    basis = sold === priced.length ? 'sold' : sold === 0 ? 'list' : 'mixed';
  }

  const low = prices.length > 0 ? Math.min(...prices) : null;
  const high = prices.length > 0 ? Math.max(...prices) : null;
  const med = median(prices);

  // Suggested list-price range — RentCast's range first, then derived.
  let suggestedLow: number | null = null;
  let suggestedHigh: number | null = null;
  const rcLow = opts?.suggestedRange?.low ?? null;
  const rcHigh = opts?.suggestedRange?.high ?? null;
  if (rcLow != null && rcHigh != null && rcLow > 0 && rcHigh > 0) {
    suggestedLow = Math.round(rcLow);
    suggestedHigh = Math.round(rcHigh);
  } else if (subject.squareFeet != null && subject.squareFeet > 0 && ppsfList.length > 0) {
    const minPpsf = Math.min(...ppsfList);
    const maxPpsf = Math.max(...ppsfList);
    suggestedLow = Math.round(subject.squareFeet * minPpsf);
    suggestedHigh = Math.round(subject.squareFeet * maxPpsf);
  } else if (low != null && high != null) {
    suggestedLow = low;
    suggestedHigh = high;
  }

  const estimatedValue = opts?.estimatedValue ?? null;
  return {
    compCount: comps.length,
    pricedCount: priced.length,
    low,
    median: med,
    high,
    avgPricePerSqft,
    suggestedLow,
    suggestedHigh,
    estimatedValue,
    basis,
    // No market estimate AND too few priced comps to defend a valuation — the UI
    // must present this as "not enough data", never as a market value.
    insufficientData: estimatedValue == null && priced.length < MIN_RELIABLE_COMPS,
  };
}

// ── RentCast → CMA mapping (pure, unit-tested) ───────────────────────────────

/**
 * Map RentCast's listing type to our sold/list basis. RentCast comps are recent
 * MARKET listings (it surfaces the most recent sale/active price), so we treat
 * them as 'sold' comps — the truest signal a CMA wants — unless the listing is
 * clearly an active "For Sale" listing.
 */
function basisForRentcastComp(c: RentcastComparable): 'sold' | 'list' {
  const t = (c.listingType ?? '').toLowerCase();
  return t.includes('for sale') || t.includes('active') ? 'list' : 'sold';
}

/** Map one RentCast comparable into a CmaComp. */
export function rentcastCompToCmaComp(c: RentcastComparable): CmaComp {
  const squareFeet = c.squareFootage;
  const price = c.price;
  const pricePerSqft =
    price != null && price > 0 && squareFeet != null && squareFeet > 0
      ? Math.round(price / squareFeet)
      : null;
  return {
    id: c.id ?? `rc-${crypto.randomUUID()}`,
    address: c.formattedAddress,
    city: c.city,
    beds: c.bedrooms,
    baths: c.bathrooms,
    squareFeet,
    price,
    priceBasis: basisForRentcastComp(c),
    pricePerSqft,
    // We don't get a CRM-style status; surface RentCast's listing type (or a
    // neutral "Comparable") so the public table reads cleanly.
    listingStatus: c.listingType ?? 'Comparable',
    source: 'rentcast',
    distanceMiles: c.distance,
    daysOld: c.daysOld,
  };
}

/**
 * Build the full set of CmaComp + CmaStats from a RentCast AVM result and the
 * (optional) secondary CRM comps. Pure — no DB/network. Exposed for unit tests.
 */
export function mapRentcastResult(
  rc: RentcastValueResult,
  subject: CmaSubject,
  crmComps: CmaComp[] = [],
): { comps: CmaComp[]; stats: CmaStats } {
  const rentcastComps = rc.comparables.map(rentcastCompToCmaComp);
  // RentCast comps lead; CRM rows are merged in as additional/secondary comps.
  const comps = [...rentcastComps, ...crmComps];
  const stats = computeStats(comps, subject, {
    suggestedRange: { low: rc.priceRangeLow, high: rc.priceRangeHigh },
    estimatedValue: rc.price,
  });
  return { comps, stats };
}

/**
 * Map our internal property-type strings to RentCast's enum. RentCast accepts:
 * Single Family, Condo, Townhouse, Manufactured, Multi-Family, Apartment, Land.
 * Unknown/blank → undefined (RentCast then infers the type from the address).
 */
export function toRentcastPropertyType(t: string | null | undefined): string | undefined {
  if (!t) return undefined;
  const key = t.toLowerCase().replace(/[\s_-]+/g, '');
  const map: Record<string, string> = {
    singlefamily: 'Single Family',
    singlefamilyhome: 'Single Family',
    house: 'Single Family',
    sfr: 'Single Family',
    condo: 'Condo',
    condominium: 'Condo',
    townhouse: 'Townhouse',
    townhome: 'Townhouse',
    manufactured: 'Manufactured',
    mobile: 'Manufactured',
    multifamily: 'Multi-Family',
    duplex: 'Multi-Family',
    triplex: 'Multi-Family',
    fourplex: 'Multi-Family',
    apartment: 'Apartment',
    land: 'Land',
    lot: 'Land',
  };
  return map[key];
}

// ── Comp selection (in-house CRM path) ───────────────────────────────────────

/**
 * Resolve the comp `price` + basis for a Property row: prefer a sold listing's
 * price (the truest comp signal), otherwise fall back to the list price.
 */
function priceForComp(row: {
  listPrice: number | null;
  listingStatus: string;
}): { price: number | null; basis: 'sold' | 'list' } {
  const basis = row.listingStatus === 'sold' ? 'sold' : 'list';
  return { price: row.listPrice ?? null, basis };
}

interface PropertyRow {
  id: string;
  address: string;
  city: string | null;
  stateRegion: string | null;
  beds: number | null;
  baths: number | null;
  squareFeet: number | null;
  propertyType: string | null;
  listPrice: number | null;
  listingStatus: string;
  updatedAt: string;
}

const COMP_SELECT =
  'id, address, city, stateRegion, beds, baths, squareFeet, propertyType, listPrice, listingStatus, updatedAt';

/** Max CRM comps on the in-house path. */
const MAX_CRM_COMPS = 6;
/** Max CRM comps merged in as SECONDARY comps on the RentCast path. */
const MAX_CRM_SECONDARY_COMPS = 4;
/** Below this many priced comps — with no market estimate — a report can't
 *  stand behind a valuation, so it's flagged insufficientData for honest UI. */
const MIN_RELIABLE_COMPS = 3;

/**
 * Score a candidate against the subject. Lower is closer. Mirrors the
 * intent of `find_comparable_properties` (beds/baths/price similarity) but
 * adds sqft + a sold-comp preference, since a CMA wants the most relevant
 * recent sales near the top.
 */
function scoreComp(row: PropertyRow, subject: CmaSubject): number {
  let score = 0;
  if (subject.beds != null && row.beds != null) score += Math.abs(row.beds - subject.beds) * 2;
  if (subject.baths != null && row.baths != null) score += Math.abs(row.baths - subject.baths) * 1.5;
  if (subject.squareFeet != null && row.squareFeet != null) {
    score += Math.abs(row.squareFeet - subject.squareFeet) / 250;
  }
  if (
    subject.listPrice != null &&
    subject.listPrice > 0 &&
    row.listPrice != null &&
    row.listPrice > 0
  ) {
    score += (Math.abs(row.listPrice - subject.listPrice) / subject.listPrice) * 5;
  }
  // Prefer sold comps and same property type as light tie-breakers.
  if (row.listingStatus === 'sold') score -= 1;
  if (subject.propertyType && row.propertyType === subject.propertyType) score -= 0.5;
  return score;
}

function toComp(row: PropertyRow): CmaComp {
  const { price, basis } = priceForComp(row);
  const pricePerSqft =
    price != null && row.squareFeet != null && row.squareFeet > 0
      ? Math.round(price / row.squareFeet)
      : null;
  return {
    id: row.id,
    address: row.address,
    city: row.city,
    beds: row.beds,
    baths: row.baths,
    squareFeet: row.squareFeet,
    price,
    priceBasis: basis,
    pricePerSqft,
    listingStatus: row.listingStatus,
    source: 'crm',
    distanceMiles: null,
    daysOld: null,
  };
}

/** Fetch + score the workspace's own Property rows as comps for a subject. */
async function selectCrmComps(
  spaceId: string,
  subject: CmaSubject,
  limit: number,
): Promise<CmaComp[]> {
  const { data, error } = await tenantTable(supabase, 'Property', { spaceId })
    .select(COMP_SELECT)
    .order('updatedAt', { ascending: false })
    .limit(50);
  if (error) throw new Error(`Comp lookup failed: ${error.message}`);

  let rows = (data ?? []) as PropertyRow[];
  // Never include the subject itself as its own comp.
  if (subject.propertyId) rows = rows.filter((r) => r.id !== subject.propertyId);

  rows.sort((a, b) => scoreComp(a, subject) - scoreComp(b, subject));
  return rows.slice(0, limit).map(toComp);
}

// ── buildCma ─────────────────────────────────────────────────────────────────

export interface BuildCmaArgs {
  spaceId: string;
  /** Pick a saved Property as the subject. */
  subjectPropertyId?: string;
  /** Or type subject details directly. One of these is required. */
  subjectFields?: SubjectFields;
  /** Optional abort signal (request lifetime) forwarded to RentCast. */
  signal?: AbortSignal;
}

/**
 * Build a full CMA payload for a space.
 *
 * Resolves the subject (saved Property or typed fields), then:
 *   1. PRIMARY — if RentCast is configured, call its AVM for real comps + a
 *      value range, and merge the workspace's own Property rows as additional
 *      (secondary) comps. `dataSource: 'rentcast'`.
 *   2. FALLBACK — if RentCast is unconfigured / errors / times out / has no
 *      match, use the in-house Property-only logic. `dataSource: 'crm'`.
 *
 * Throws only on bad input or a hard DB error; the route translates to HTTP.
 * A RentCast failure never throws — it silently degrades to the CRM path.
 */
export async function buildCma(args: BuildCmaArgs): Promise<CmaPayload> {
  const { spaceId, subjectPropertyId, subjectFields, signal } = args;

  // ── Resolve the subject ───────────────────────────────────────────────────
  let subject: CmaSubject;
  if (subjectPropertyId) {
    const { data, error } = await tenantTable(supabase, 'Property', { spaceId })
      .select(COMP_SELECT)
      .eq('id', subjectPropertyId)
      .maybeSingle();
    if (error) throw new Error(`Subject lookup failed: ${error.message}`);
    if (!data) throw new Error('Subject property not found.');
    const row = data as PropertyRow;
    subject = {
      propertyId: row.id,
      address: row.address,
      city: row.city,
      stateRegion: row.stateRegion,
      beds: row.beds,
      baths: row.baths,
      squareFeet: row.squareFeet,
      propertyType: row.propertyType,
      listPrice: row.listPrice,
    };
  } else if (subjectFields && subjectFields.address.trim()) {
    subject = {
      propertyId: null,
      address: subjectFields.address.trim(),
      city: subjectFields.city ?? null,
      stateRegion: subjectFields.stateRegion ?? null,
      beds: subjectFields.beds ?? null,
      baths: subjectFields.baths ?? null,
      squareFeet: subjectFields.squareFeet ?? null,
      propertyType: subjectFields.propertyType ?? null,
      listPrice: subjectFields.listPrice ?? null,
    };
  } else {
    throw new Error('Provide a subjectPropertyId or subject fields with an address.');
  }

  // ── PRIMARY: RentCast market data ─────────────────────────────────────────
  // Track WHY we'd fall back to CRM so the report can say so honestly.
  let fallbackReason: CmaDataSourceReason = 'rentcast_unconfigured';
  if (rentcastConfigured()) {
    fallbackReason = 'rentcast_no_match';
    let rc: RentcastValueResult | null = null;
    try {
      // RentCast wants a full single-line address; fold in city/state if the
      // realtor split them out so the geocode has the best shot at a match.
      const addressParts = [subject.address, subject.city, subject.stateRegion]
        .map((p) => (p ?? '').trim())
        .filter(Boolean);
      const fullAddress = addressParts.join(', ');

      rc = await getValueEstimate(
        {
          address: fullAddress,
          propertyType: toRentcastPropertyType(subject.propertyType),
          bedrooms: subject.beds,
          bathrooms: subject.baths,
          squareFootage: subject.squareFeet,
          compCount: 10,
        },
        { signal },
      );
    } catch (err) {
      // getValueEstimate is built to return null, never throw — but stay safe.
      logger.warn('[cma] RentCast lookup threw; falling back to CRM', {
        spaceId,
        err: err instanceof Error ? err.message : String(err),
      });
      rc = null;
    }

    if (rc) {
      // Merge in a few CRM rows as secondary comps. A CRM failure here must not
      // sink the RentCast report — degrade to RentCast-only on error.
      let crmComps: CmaComp[] = [];
      try {
        crmComps = await selectCrmComps(spaceId, subject, MAX_CRM_SECONDARY_COMPS);
      } catch (err) {
        logger.warn('[cma] secondary CRM comp merge failed; using RentCast only', {
          spaceId,
          err: err instanceof Error ? err.message : String(err),
        });
      }

      const { comps, stats } = mapRentcastResult(rc, subject, crmComps);
      return {
        subject,
        comps,
        stats,
        dataSource: 'rentcast',
        dataSourceReason: 'rentcast',
        generatedAt: new Date().toISOString(),
      };
    }

    // RentCast configured but returned no usable data (no match / error) — log
    // once, then fall through to the in-house path below.
    logger.info('[cma] RentCast returned no data; using CRM fallback', { spaceId });
  }

  // ── FALLBACK: in-house Property-only logic ────────────────────────────────
  const comps = await selectCrmComps(spaceId, subject, MAX_CRM_COMPS);
  const stats = computeStats(comps, subject);

  return {
    subject,
    comps,
    stats,
    dataSource: 'crm',
    dataSourceReason: fallbackReason,
    generatedAt: new Date().toISOString(),
  };
}

// ── Share token ──────────────────────────────────────────────────────────────

/**
 * URL-safe random token for the public /cma/[token] route. 32 hex chars of
 * crypto-strong randomness — same posture as PropertyPacket tokens.
 */
export function generateShareToken(): string {
  return crypto.randomBytes(16).toString('hex');
}
