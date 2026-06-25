/**
 * Area IQ card model — flattens an AreaReport into a render-ready shape used by
 * BOTH the chat result card (display: 'area') and the property-detail panel, so
 * they always present area intelligence identically.
 *
 * Pure + client-safe (no server-only imports): the tool builds it server-side,
 * the React cards consume it.
 */

import type { AreaReport, AreaIntelligence, AreaFields, AnalysisSource } from '@/lib/types';

/** One labeled metric chip (schools rating, walk score, median price, ...). */
export interface AreaMetric {
  label: string;
  value: string;
}

/** One prose section with optional provenance. */
export interface AreaSection {
  title: string;
  body: string;
  source?: string;
}

/** Fully render-ready card payload. Primitives + flat arrays only. */
export interface AreaCardData {
  label: string;
  summary: string;
  generatedAt: string;
  cached: boolean;
  metrics: AreaMetric[];
  sections: AreaSection[];
  highlights: string[];
  sources: AnalysisSource[];
}

function usd(n: number | null): string | null {
  return n == null ? null : `$${Math.round(n).toLocaleString('en-US')}`;
}

const TREND_LABEL: Record<string, string> = {
  rising: 'Rising',
  steady: 'Steady',
  cooling: 'Cooling',
};

/**
 * Max length of a metric-chip value. Chips hold short, scannable facts (a
 * rating, a score, a price). Anything longer is prose and belongs in a section,
 * where it already renders, so we drop it from the chip row rather than let a
 * sentence stretch a chip across the card.
 */
const MAX_CHIP_VALUE = 22;
const short = (v: string): boolean => v.trim().length <= MAX_CHIP_VALUE;

/** Build the headline metric chips from the grounded fields (skip the unknowns). */
function buildMetrics(f: AreaFields): AreaMetric[] {
  const m: AreaMetric[] = [];
  // Schools / safety go in chips only when the value is short enough to scan;
  // the longer phrasing is carried by the Schools / Safety sections below.
  if (f.schoolRating && short(f.schoolRating)) m.push({ label: 'Schools', value: f.schoolRating });
  if (f.crimeLevel && short(f.crimeLevel)) m.push({ label: 'Safety', value: f.crimeLevel });
  if (f.walkScore != null) m.push({ label: 'Walk Score', value: String(f.walkScore) });
  if (f.transitScore != null) m.push({ label: 'Transit', value: String(f.transitScore) });
  if (f.bikeScore != null) m.push({ label: 'Bike Score', value: String(f.bikeScore) });
  const medList = usd(f.medianListPrice);
  if (medList) m.push({ label: 'Median list', value: medList });
  const medSale = usd(f.medianSalePrice);
  if (medSale) m.push({ label: 'Median sale', value: medSale });
  if (f.marketTrend) m.push({ label: 'Market', value: TREND_LABEL[f.marketTrend] ?? f.marketTrend });
  if (f.medianDaysOnMarket != null) {
    m.push({ label: 'Days on market', value: String(f.medianDaysOnMarket) });
  }
  return m;
}

/** Build the prose sections, each with its source URL when attributable. */
function buildSections(intel: AreaIntelligence): AreaSection[] {
  const f = intel.fields;
  const src = intel.fieldSources;
  const out: AreaSection[] = [];
  const add = (title: string, body: string | null, sourceKey: keyof AreaFields) => {
    if (body) out.push({ title, body, source: src[sourceKey] });
  };
  add('Schools', f.schoolsSummary, 'schoolsSummary');
  add('Safety', f.safetySummary, 'safetySummary');
  add('Walkability & transit', f.walkabilitySummary, 'walkabilitySummary');
  add('Market', f.marketSummary, 'marketSummary');
  add('Amenities', f.amenitiesSummary, 'amenitiesSummary');
  add('Lifestyle', f.lifestyleSummary, 'lifestyleSummary');
  add('Commute', f.commuteSummary, 'commuteSummary');
  return out;
}

/** Flatten a persisted report into the render-ready card payload. */
export function toAreaCardData(report: AreaReport, cached: boolean): AreaCardData {
  const intel = report.intelligence;
  return {
    label: report.label,
    summary: intel.summary,
    generatedAt: report.generatedAt,
    cached,
    metrics: buildMetrics(intel.fields),
    sections: buildSections(intel),
    highlights: intel.fields.highlights ?? [],
    sources: intel.sources ?? [],
  };
}

/** A one-line summary of the area for the chat transcript / tool result. */
export function summariseArea(report: AreaReport): string {
  const f = report.intelligence.fields;
  const bits: string[] = [];
  if (f.schoolRating) bits.push(`schools ${f.schoolRating}`);
  if (f.walkScore != null) bits.push(`Walk Score ${f.walkScore}`);
  const med = usd(f.medianListPrice ?? f.medianSalePrice);
  if (med) bits.push(`median ${med}`);
  if (f.marketTrend) bits.push(`${TREND_LABEL[f.marketTrend] ?? f.marketTrend} market`);
  const tail = bits.length ? ` — ${bits.join(' · ')}` : '';
  return `Area IQ for ${report.label}${tail}`;
}
