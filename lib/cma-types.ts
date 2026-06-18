/**
 * CMA payload shapes + small client-safe constants.
 *
 * Split out from lib/cma.ts so CLIENT components (e.g. the builder view) can
 * import the types + the data-source label WITHOUT pulling in lib/cma's
 * server-only dependency graph (lib/rentcast imports 'server-only', which fails
 * to bundle for the client). lib/cma re-exports everything here, so existing
 * `@/lib/cma` imports keep working.
 *
 * Rule: nothing in this file may import a server-only module.
 */

// ── Data source ──────────────────────────────────────────────────────────────

/** Where the comps + valuation in a report came from. */
export type CmaDataSource = 'rentcast' | 'crm';

/** Human-readable label for a data source, shown on the builder + public report. */
export const DATA_SOURCE_LABEL: Record<CmaDataSource, string> = {
  rentcast: 'RentCast market data',
  crm: 'your CRM data',
};

/**
 * Why the report ended up on its `dataSource` — drives an honest banner so a
 * CRM-only fallback is never mistaken for a real market valuation.
 */
export type CmaDataSourceReason =
  | 'rentcast' // RentCast returned market data
  | 'rentcast_unconfigured' // RENTCAST_API_KEY not present at runtime → never called
  | 'rentcast_no_match'; // RentCast configured but returned no usable data

// ── Public payload shapes ────────────────────────────────────────────────────

/** Snapshot of the subject property frozen into the report. */
export interface CmaSubject {
  propertyId: string | null;
  address: string;
  city: string | null;
  stateRegion: string | null;
  beds: number | null;
  baths: number | null;
  squareFeet: number | null;
  propertyType: string | null;
  listPrice: number | null;
}

/** A single comparable, snapshotted so the report is stable over time. */
export interface CmaComp {
  id: string;
  address: string;
  city: string | null;
  beds: number | null;
  baths: number | null;
  squareFeet: number | null;
  /** The price we analysed — sold price preferred, else list price. */
  price: number | null;
  /** Whether `price` came from a sold listing vs an active list price. */
  priceBasis: 'sold' | 'list';
  pricePerSqft: number | null;
  listingStatus: string;
  /** Which source this comp came from — RentCast market data vs the CRM. */
  source: CmaDataSource;
  /** Distance from the subject, in miles (RentCast comps only). */
  distanceMiles: number | null;
  /** Days since the comp last appeared on the market (RentCast comps only). */
  daysOld: number | null;
}

/** Computed headline numbers. Nulls mean "not enough data". */
export interface CmaStats {
  compCount: number;
  /** How many comps had a usable price (drives low/median/high). */
  pricedCount: number;
  low: number | null;
  median: number | null;
  high: number | null;
  /** Average $/sqft across comps that had both a price and a sqft. */
  avgPricePerSqft: number | null;
  /** Suggested list-price range. From RentCast's value range when available. */
  suggestedLow: number | null;
  suggestedHigh: number | null;
  /**
   * RentCast's point value estimate for the subject (null on the CRM path).
   * Distinct from the comp-derived low/median/high.
   */
  estimatedValue: number | null;
  /** Whether the priced comps were mostly sold (vs list) prices. */
  basis: 'sold' | 'list' | 'mixed' | 'none';
  /**
   * True when there isn't enough real data to stand behind the numbers — no
   * market estimate AND fewer than a handful of priced comps. The UI must NOT
   * present these as a market valuation.
   */
  insufficientData: boolean;
}

export interface CmaPayload {
  subject: CmaSubject;
  comps: CmaComp[];
  stats: CmaStats;
  /** Which engine produced the headline numbers — drives the honest label. */
  dataSource: CmaDataSource;
  /** Why it came from `dataSource` (e.g. RentCast off vs no match). */
  dataSourceReason?: CmaDataSourceReason;
  /** ISO timestamp the analysis was computed. */
  generatedAt: string;
}

/** Free-typed subject fields (when the realtor isn't picking a saved row). */
export interface SubjectFields {
  address: string;
  city?: string | null;
  stateRegion?: string | null;
  beds?: number | null;
  baths?: number | null;
  squareFeet?: number | null;
  propertyType?: string | null;
  listPrice?: number | null;
}
