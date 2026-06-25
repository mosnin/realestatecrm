/**
 * Tavily search client — the ONLY module that talks to Tavily.
 *
 * Tavily is an LLM-oriented web search API: one POST returns ranked web results
 * with page snippets. For the Property "Analyze" feature we use it to discover
 * the pages that describe ONE specific property by its full address — the live
 * listing (Zillow / Redfin / Realtor.com), its sale/price history, the county
 * public record, and local neighborhood/market context. Firecrawl then scrapes
 * the best hits and the LLM structures the evidence.
 *
 * Gated entirely on `TAVILY_API_KEY` — when it's absent `tavilyConfigured()` is
 * false and the Analyze pipeline returns a "research not configured" state
 * rather than throwing.
 *
 * Cost/latency posture (mirrors lib/llm.ts): a small, fixed number of queries,
 * each with a short per-request timeout and a capped result count, fanned out
 * in parallel under a shared abort signal. No SDK — Tavily exposes a plain JSON
 * HTTP endpoint, so a single typed `fetch` wrapper keeps the dependency surface
 * (and the bundle) minimal. Every per-query failure degrades to fewer results;
 * the search stage never throws (except on a missing key, a programming error
 * the orchestrator guards against with `tavilyConfigured()`).
 */

import 'server-only';
import { logger } from '@/lib/logger';

const TAVILY_ENDPOINT = 'https://api.tavily.com/search';

/** Per-query HTTP timeout. A slow search must not eat the Analyze time budget. */
const PER_QUERY_TIMEOUT_MS = 8_000;

/** Hard cap on queries per Analyze run — bounds cost + latency regardless of caller. */
export const MAX_QUERIES = 4;

/** Results to keep per query before they flow on to the scrape stage. */
const RESULTS_PER_QUERY = 5;

/** Domains that carry the richest single-property data — boosted in ranking. */
const PREFERRED_DOMAINS = [
  'zillow.com',
  'redfin.com',
  'realtor.com',
  'trulia.com',
  'homes.com',
  'compass.com',
];

/** True when Tavily is configured. Callers gate the whole pipeline on this. */
export function tavilyConfigured(): boolean {
  return Boolean(process.env.TAVILY_API_KEY);
}

/** The subject property — just the fields that shape useful address queries. */
export interface TavilySubject {
  address: string;
  unitNumber?: string | null;
  city?: string | null;
  stateRegion?: string | null;
  postalCode?: string | null;
  mlsNumber?: string | null;
}

/** A single ranked search hit. */
export interface SearchResult {
  /** The query that surfaced this hit (for debugging / provenance). */
  query: string;
  url: string;
  title: string;
  snippet: string;
  /** Tavily relevance score, when present. */
  score?: number;
}

/** One-line address used verbatim inside queries. */
function fullAddress(subject: TavilySubject): string {
  const unit = subject.unitNumber ? ` #${subject.unitNumber}` : '';
  const tail = [subject.city, subject.stateRegion, subject.postalCode]
    .filter(Boolean)
    .join(', ');
  return tail ? `${subject.address}${unit}, ${tail}` : `${subject.address}${unit}`;
}

/**
 * Build the (capped) set of targeted queries for ONE property. Exposed for unit
 * tests + so the orchestrator can log what it asked. We aim each query at a
 * different facet of the same address: the live listing, the sale/price
 * history, the public tax record, and the local market context.
 */
export function buildQueries(subject: TavilySubject): string[] {
  const addr = fullAddress(subject);
  const where = [subject.city, subject.stateRegion].filter(Boolean).join(', ');

  const queries: string[] = [
    // The listing itself — beds/baths/sqft/list price/description/photos.
    `${addr} home for sale listing Zillow Redfin`,
    // Sale + price history and any estimate.
    `${addr} sale price history property record`,
  ];

  // A neighborhood/market query only makes sense when we know the locality.
  if (where) {
    queries.push(`${where} neighborhood real estate market overview`);
  }

  // The MLS number is the single most precise handle when the realtor has it.
  if (subject.mlsNumber) {
    queries.push(`MLS ${subject.mlsNumber} ${where || subject.address}`.trim());
  } else {
    // Otherwise add a public-records angle for beds/baths/sqft/year/taxes.
    queries.push(`${addr} county property tax assessor record`);
  }

  // De-dupe and cap.
  return [...new Set(queries.map((q) => q.replace(/\s+/g, ' ').trim()).filter(Boolean))].slice(
    0,
    MAX_QUERIES,
  );
}

interface TavilyApiResult {
  url?: string;
  title?: string;
  content?: string;
  score?: number;
}

/** Boost results on a preferred-domain list so they scrape first. */
function rankBoostFor(url: string, domains: readonly string[]): number {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return domains.some((d) => host === d || host.endsWith(`.${d}`)) ? 0.25 : 0;
  } catch {
    return 0;
  }
}

/** Boost results on the richest single-property domains so they scrape first. */
function rankBoost(url: string): number {
  return rankBoostFor(url, PREFERRED_DOMAINS);
}

/** POST one query to Tavily. Returns [] on any failure (fail-soft). */
async function runQuery(
  apiKey: string,
  query: string,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PER_QUERY_TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const res = await fetch(TAVILY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        api_key: apiKey,
        query,
        // Real-estate listing/record pages live on the open web; "advanced"
        // depth ranks them better than "basic" for this use case.
        search_depth: 'advanced',
        max_results: RESULTS_PER_QUERY,
        include_answer: false,
        include_raw_content: false,
      }),
    });
    if (!res.ok) {
      logger.warn('[tavily] query non-200', { status: res.status });
      return [];
    }
    const json = (await res.json()) as { results?: TavilyApiResult[] };
    const results = Array.isArray(json.results) ? json.results : [];
    return results
      .filter((r) => typeof r.url === 'string' && r.url)
      .map((r) => ({
        query,
        url: r.url as string,
        title: (r.title ?? '').slice(0, 300),
        snippet: (r.content ?? '').slice(0, 1200),
        score: typeof r.score === 'number' ? r.score : undefined,
      }));
  } catch (err) {
    // Timeout / network / parse — never throw out of the search stage.
    logger.warn('[tavily] query failed', {
      err: err instanceof Error ? err.message : 'unknown',
    });
    return [];
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * Run the capped query set for a subject property and return de-duplicated
 * results ranked by Tavily score + a preferred-domain boost. Throws only if the
 * key is missing (the orchestrator checks `tavilyConfigured()` first, so that's
 * a programming error); any per-query failure degrades to fewer results.
 */
export async function searchProperty(
  subject: TavilySubject,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error('TAVILY_API_KEY not configured');

  const queries = buildQueries(subject);
  // Queries are independent — fan out in parallel under the shared signal.
  const batches = await Promise.all(queries.map((q) => runQuery(apiKey, q, signal)));

  // De-dupe by URL, keeping the highest-scoring occurrence.
  const byUrl = new Map<string, SearchResult>();
  for (const r of batches.flat()) {
    const existing = byUrl.get(r.url);
    if (!existing || (r.score ?? 0) > (existing.score ?? 0)) byUrl.set(r.url, r);
  }
  return [...byUrl.values()].sort(
    (a, b) => (b.score ?? 0) + rankBoost(b.url) - ((a.score ?? 0) + rankBoost(a.url)),
  );
}

// ── Property IQ: area / neighborhood search ──────────────────────────────────

/** A normalized area to research — just the label + parts that shape queries. */
export interface AreaSubject {
  label: string;
  city?: string | null;
  stateRegion?: string | null;
  postalCode?: string | null;
}

/** Domains that carry the richest area / neighborhood / market data. */
const AREA_PREFERRED_DOMAINS = [
  'niche.com',
  'greatschools.org',
  'walkscore.com',
  'areavibes.com',
  'neighborhoodscout.com',
  'redfin.com',
  'realtor.com',
  'zillow.com',
];

/**
 * Build the (capped) area query set. Each query targets a different facet of the
 * SAME place: an overall neighborhood profile, schools, safety, and the local
 * housing market. Exposed for unit tests + orchestrator logging.
 */
export function buildAreaQueries(subject: AreaSubject): string[] {
  const where = subject.label.trim();
  const queries = [
    `${where} neighborhood overview livability walkability`,
    `${where} school ratings GreatSchools district`,
    `${where} crime rate safety statistics`,
    `${where} housing market median home price trends days on market`,
  ];
  return [...new Set(queries.map((q) => q.replace(/\s+/g, ' ').trim()).filter(Boolean))].slice(
    0,
    MAX_QUERIES,
  );
}

/**
 * Run the capped area query set and return de-duplicated results ranked by
 * Tavily score + an area-domain boost. Mirrors searchProperty's posture: throws
 * only on a missing key (the orchestrator gates with tavilyConfigured first);
 * any per-query failure degrades to fewer results.
 */
export async function searchArea(
  subject: AreaSubject,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error('TAVILY_API_KEY not configured');

  const queries = buildAreaQueries(subject);
  const batches = await Promise.all(queries.map((q) => runQuery(apiKey, q, signal)));

  const byUrl = new Map<string, SearchResult>();
  for (const r of batches.flat()) {
    const existing = byUrl.get(r.url);
    if (!existing || (r.score ?? 0) > (existing.score ?? 0)) byUrl.set(r.url, r);
  }
  return [...byUrl.values()].sort(
    (a, b) =>
      (b.score ?? 0) +
      rankBoostFor(b.url, AREA_PREFERRED_DOMAINS) -
      ((a.score ?? 0) + rankBoostFor(a.url, AREA_PREFERRED_DOMAINS)),
  );
}
