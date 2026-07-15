/**
 * "What's my home worth?" — public seller lead-magnet types + the pure mapper
 * that turns a full CMA payload into the small, honest shape the public page
 * renders.
 *
 * This module is CLIENT-SAFE: it imports only lib/cma-types (which has no
 * server-only deps), so the public page's client island can import
 * `HomeValueEstimate` + `toHomeValueEstimate` without pulling lib/cma's
 * RentCast/server graph into the browser bundle. Types live here — NOT in
 * lib/types.ts — so this top-of-funnel feature stays additive and disjoint.
 *
 * Honesty rule (product non-negotiable #5): a valuation is surfaced ONLY when
 * the underlying CMA can stand behind it. When the CMA has no market estimate
 * and too few priced comps (`stats.insufficientData`), `hasEstimate` is false
 * and every number is null — the UI says "we couldn't estimate this address",
 * it NEVER invents a figure.
 */

import type { CmaPayload, CmaDataSource } from '@/lib/cma-types';
import { DATA_SOURCE_LABEL } from '@/lib/cma-types';

/** The compact, honest valuation the public home-value page renders. */
export interface HomeValueEstimate {
  /**
   * True only when the CMA can defend a headline number — there's a market
   * estimate OR enough priced comps. False → the page shows the honest
   * "not enough data" state and all figures below are null.
   */
  hasEstimate: boolean;
  /** Point estimate (RentCast AVM value, else comp median). Null when none. */
  estimatedValue: number | null;
  /** Low end of the value range. Null when there's no defensible range. */
  low: number | null;
  /** High end of the value range. Null when there's no defensible range. */
  high: number | null;
  /** Which engine produced the numbers — 'rentcast' (market) vs 'crm'. */
  dataSource: CmaDataSource;
  /** Human label for `dataSource` (e.g. "RentCast market data"). */
  dataSourceLabel: string;
  /** How many comparables backed the analysis. */
  compCount: number;
}

/**
 * Map a CMA payload into the public estimate shape. Pure — no I/O — so it's
 * unit-testable and shared by the route and the client renderer.
 *
 * Range preference mirrors the CMA's own logic: RentCast's suggested range
 * first, then the raw comp low/high. The point value prefers RentCast's AVM,
 * then the comp median. When the CMA flags `insufficientData`, nothing is
 * surfaced as a value.
 */
export function toHomeValueEstimate(payload: CmaPayload): HomeValueEstimate {
  const { stats, dataSource, comps } = payload;

  const low = stats.suggestedLow ?? stats.low;
  const high = stats.suggestedHigh ?? stats.high;
  const estimatedValue = stats.estimatedValue ?? stats.median;

  // A defensible headline needs real data behind it: not flagged insufficient,
  // AND at least a point value or a full low/high band to show.
  const hasEstimate =
    !stats.insufficientData &&
    (estimatedValue != null || (low != null && high != null));

  return {
    hasEstimate,
    estimatedValue: hasEstimate ? estimatedValue : null,
    low: hasEstimate ? low : null,
    high: hasEstimate ? high : null,
    dataSource,
    dataSourceLabel: DATA_SOURCE_LABEL[dataSource],
    compCount: comps.length,
  };
}

/** Response body for POST /api/public/home-value/[slug]. */
export interface HomeValueResponse {
  /** Always true when the lead was captured (even without an estimate). */
  captured: boolean;
  /** The honest valuation. `hasEstimate: false` → no fabricated number. */
  estimate: HomeValueEstimate;
  /** The address we analysed, echoed back for the result header. */
  address: string;
}
