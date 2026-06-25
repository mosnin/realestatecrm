/**
 * Property IQ — area-analysis pipeline: web research → LLM structuring → typed
 * intelligence. The neighborhood-level sibling of lib/property-analysis.ts.
 *
 * Flow (server-side, mirrors the property pipeline exactly):
 *   1. GATE   — both TAVILY_API_KEY and FIRECRAWL_API_KEY must be set, else a
 *               `not_configured` outcome (the caller renders a clear state).
 *   2. SEARCH — Tavily finds the pages that describe THIS area (neighborhood
 *               profile, schools, safety, local market).
 *   3. SCRAPE — Firecrawl extracts area facts from the top pages (parallel,
 *               per-scrape timeout, capped count).
 *   4. STRUCTURE — the app LLM is fed the evidence under a STRICT JSON schema,
 *               grounded: use only values present in the evidence, cite a source
 *               URL per field, never invent, leave unknowns null.
 *   5. ASSEMBLE — return the typed AreaIntelligence + the sources consulted.
 *
 * The store (lib/area-report-store.ts) persists the result and reuses it across
 * every property in the area. The pure pieces (schema, parser) are exported and
 * unit-tested without any network.
 */

import 'server-only';
import { logger } from '@/lib/logger';
import { getLLMClient, openaiModel } from '@/lib/llm';
import type {
  AreaFields,
  AreaFieldSources,
  AreaIntelligence,
  AreaMarketTrend,
  AreaConfidence,
  AnalysisSource,
} from '@/lib/types';
import {
  tavilyConfigured,
  searchArea,
  type AreaSubject,
  type SearchResult,
} from '@/lib/research/tavily';
import {
  firecrawlConfigured,
  scrapeArea,
  MAX_SCRAPES,
  type ScrapedArea,
} from '@/lib/research/firecrawl';

export type { AreaFields, AreaFieldSources, AreaIntelligence };

// ── Tunables (mirror property-analysis) ──────────────────────────────────────

const ANALYSIS_MODEL = 'gpt-4.1';
const PAGES_TO_SCRAPE = MAX_SCRAPES;
const TOTAL_BUDGET_MS = 55_000;
const LLM_TIMEOUT_MS = 30_000;

/** Discriminated outcome so callers render each case cleanly. */
export type AreaAnalyzeOutcome =
  | { status: 'ok'; intelligence: AreaIntelligence }
  | { status: 'not_configured'; missing: Array<'TAVILY_API_KEY' | 'FIRECRAWL_API_KEY'> }
  | { status: 'no_evidence'; generatedAt: string }
  | { status: 'error'; message: string };

// ── Evidence assembly (pure) ─────────────────────────────────────────────────

export interface AreaEvidence {
  subject: AreaSubject;
  searchSnippets: Array<{ url: string; title: string; snippet: string }>;
  pages: ScrapedArea[];
}

export function buildAreaEvidence(
  subject: AreaSubject,
  results: SearchResult[],
  pages: ScrapedArea[],
): AreaEvidence {
  return {
    subject,
    searchSnippets: results.slice(0, 8).map((r) => ({
      url: r.url,
      title: r.title,
      snippet: r.snippet,
    })),
    pages,
  };
}

// ── Strict JSON schema for the structuring step ──────────────────────────────

const numOrNull = { anyOf: [{ type: 'number' as const }, { type: 'null' as const }] };
const strOrNull = { anyOf: [{ type: 'string' as const }, { type: 'null' as const }] };

export const AREA_ANALYSIS_JSON_SCHEMA = {
  name: 'area_intelligence',
  strict: true,
  schema: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      schoolsSummary: strOrNull,
      schoolsSummarySource: strOrNull,
      schoolRating: strOrNull,
      schoolRatingSource: strOrNull,
      safetySummary: strOrNull,
      safetySummarySource: strOrNull,
      crimeLevel: strOrNull,
      crimeLevelSource: strOrNull,
      walkScore: numOrNull,
      walkScoreSource: strOrNull,
      transitScore: numOrNull,
      transitScoreSource: strOrNull,
      walkabilitySummary: strOrNull,
      walkabilitySummarySource: strOrNull,
      marketSummary: strOrNull,
      marketSummarySource: strOrNull,
      medianListPrice: numOrNull,
      medianListPriceSource: strOrNull,
      medianSalePrice: numOrNull,
      medianSalePriceSource: strOrNull,
      marketTrend: {
        anyOf: [
          { type: 'string' as const, enum: ['rising', 'steady', 'cooling'] },
          { type: 'null' as const },
        ],
        description: 'Direction of the local market, mapped from the evidence. Null if unclear.',
      },
      marketTrendSource: strOrNull,
      medianDaysOnMarket: numOrNull,
      medianDaysOnMarketSource: strOrNull,
      marketAsOf: { ...strOrNull, description: 'As-of date of the market figures as shown (e.g. "Apr 2026"). Null if undated.' },
      marketAsOfSource: strOrNull,
      amenitiesSummary: strOrNull,
      amenitiesSummarySource: strOrNull,
      highlights: {
        type: 'array' as const,
        items: { type: 'string' as const },
        description: 'Notable nearby places or features explicitly present in the evidence.',
      },
      lifestyleSummary: strOrNull,
      lifestyleSummarySource: strOrNull,
      commuteSummary: strOrNull,
      commuteSummarySource: strOrNull,
      verdict: {
        type: 'string' as const,
        description:
          'ONE punchy sentence of judgment a realtor would lead with: who this area suits, the ' +
          'standout strength, and the honest catch. Lead with the opinion, not a recap. ' +
          'Example: "Strong for families: top-rated schools and quiet streets, but you will pay ' +
          'above the metro median." Grounded in the evidence; no em dash.',
      },
      summary: {
        type: 'string' as const,
        description:
          'A 3-5 sentence grounded brief that BACKS the verdict: schools, safety, walkability, ' +
          'market, lifestyle. Only state what the evidence supports. Do not repeat the verdict verbatim.',
      },
    },
    required: [
      'schoolsSummary', 'schoolsSummarySource',
      'schoolRating', 'schoolRatingSource',
      'safetySummary', 'safetySummarySource',
      'crimeLevel', 'crimeLevelSource',
      'walkScore', 'walkScoreSource',
      'transitScore', 'transitScoreSource',
      'walkabilitySummary', 'walkabilitySummarySource',
      'marketSummary', 'marketSummarySource',
      'medianListPrice', 'medianListPriceSource',
      'medianSalePrice', 'medianSalePriceSource',
      'marketTrend', 'marketTrendSource',
      'medianDaysOnMarket', 'medianDaysOnMarketSource',
      'marketAsOf', 'marketAsOfSource',
      'amenitiesSummary', 'amenitiesSummarySource',
      'highlights',
      'lifestyleSummary', 'lifestyleSummarySource',
      'commuteSummary', 'commuteSummarySource',
      'verdict',
      'summary',
    ],
  },
};

/** Raw flat shape from the model (with *Source siblings). */
export interface RawAreaResponse {
  schoolsSummary: string | null; schoolsSummarySource: string | null;
  schoolRating: string | null; schoolRatingSource: string | null;
  safetySummary: string | null; safetySummarySource: string | null;
  crimeLevel: string | null; crimeLevelSource: string | null;
  walkScore: number | null; walkScoreSource: string | null;
  transitScore: number | null; transitScoreSource: string | null;
  walkabilitySummary: string | null; walkabilitySummarySource: string | null;
  marketSummary: string | null; marketSummarySource: string | null;
  medianListPrice: number | null; medianListPriceSource: string | null;
  medianSalePrice: number | null; medianSalePriceSource: string | null;
  marketTrend: string | null; marketTrendSource: string | null;
  medianDaysOnMarket: number | null; medianDaysOnMarketSource: string | null;
  marketAsOf: string | null; marketAsOfSource: string | null;
  amenitiesSummary: string | null; amenitiesSummarySource: string | null;
  highlights: string[];
  lifestyleSummary: string | null; lifestyleSummarySource: string | null;
  commuteSummary: string | null; commuteSummarySource: string | null;
  verdict: string;
  summary: string;
}

// ── Parsing the LLM response (pure, unit-tested) ─────────────────────────────

const POSITIVE_NUM = (v: number | null): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

/** 0-100 score or null. */
const SCORE_0_100 = (v: number | null): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 ? Math.round(v) : null;

/**
 * Plausibility-bounded number or null. A median home price of $40 or $4B, or a
 * 5-year days-on-market, is an extraction error, not a data point — reject it
 * rather than let a wrong number reach the verdict. (Physics first: a value that
 * violates reality is a bug.)
 */
const BOUNDED = (v: number | null, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null;

/** A US residential median sits well within this band; anything outside is junk. */
const MEDIAN_PRICE = (v: number | null): number | null => BOUNDED(v, 10_000, 100_000_000);
/** Days on market: 0 to two years. */
const DOM = (v: number | null): number | null => BOUNDED(v, 0, 730);

function cleanSource(v: string | null): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length > 0 && /^https?:\/\//i.test(t) ? t.slice(0, 1000) : undefined;
}

function cleanStr(v: string | null, max: number): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}

const VALID_TRENDS = new Set<AreaMarketTrend>(['rising', 'steady', 'cooling']);

/**
 * Convert the model's flat response into `{ fields, fieldSources, summary }`,
 * with light validation/clamping. Pure. A field's source is recorded only when
 * the field actually has a value.
 */
export function parseAreaResponse(raw: RawAreaResponse): {
  fields: AreaFields;
  fieldSources: AreaFieldSources;
  summary: string;
  verdict: string;
} {
  const fieldSources: AreaFieldSources = {};
  const setSource = (key: keyof AreaFields, val: unknown, src: string | null) => {
    const hasValue = Array.isArray(val) ? val.length > 0 : val !== null && val !== undefined;
    const s = cleanSource(src);
    if (hasValue && s) fieldSources[key] = s;
  };

  const marketTrend =
    typeof raw.marketTrend === 'string' && VALID_TRENDS.has(raw.marketTrend as AreaMarketTrend)
      ? (raw.marketTrend as AreaMarketTrend)
      : null;

  const highlights = Array.isArray(raw.highlights)
    ? raw.highlights
        .filter((h): h is string => typeof h === 'string' && h.trim().length > 0)
        .map((h) => h.trim().slice(0, 160))
        .slice(0, 20)
    : [];

  const fields: AreaFields = {
    schoolsSummary: cleanStr(raw.schoolsSummary, 1200),
    schoolRating: cleanStr(raw.schoolRating, 80),
    safetySummary: cleanStr(raw.safetySummary, 1200),
    crimeLevel: cleanStr(raw.crimeLevel, 120),
    walkScore: SCORE_0_100(raw.walkScore),
    transitScore: SCORE_0_100(raw.transitScore),
    walkabilitySummary: cleanStr(raw.walkabilitySummary, 1200),
    marketSummary: cleanStr(raw.marketSummary, 1200),
    medianListPrice: MEDIAN_PRICE(raw.medianListPrice),
    medianSalePrice: MEDIAN_PRICE(raw.medianSalePrice),
    marketTrend,
    medianDaysOnMarket: DOM(raw.medianDaysOnMarket),
    marketAsOf: cleanStr(raw.marketAsOf, 40),
    amenitiesSummary: cleanStr(raw.amenitiesSummary, 1200),
    highlights,
    lifestyleSummary: cleanStr(raw.lifestyleSummary, 1200),
    commuteSummary: cleanStr(raw.commuteSummary, 1200),
  };

  setSource('schoolsSummary', fields.schoolsSummary, raw.schoolsSummarySource);
  setSource('schoolRating', fields.schoolRating, raw.schoolRatingSource);
  setSource('safetySummary', fields.safetySummary, raw.safetySummarySource);
  setSource('crimeLevel', fields.crimeLevel, raw.crimeLevelSource);
  setSource('walkScore', fields.walkScore, raw.walkScoreSource);
  setSource('transitScore', fields.transitScore, raw.transitScoreSource);
  setSource('walkabilitySummary', fields.walkabilitySummary, raw.walkabilitySummarySource);
  setSource('marketSummary', fields.marketSummary, raw.marketSummarySource);
  setSource('medianListPrice', fields.medianListPrice, raw.medianListPriceSource);
  setSource('medianSalePrice', fields.medianSalePrice, raw.medianSalePriceSource);
  setSource('marketTrend', fields.marketTrend, raw.marketTrendSource);
  setSource('medianDaysOnMarket', fields.medianDaysOnMarket, raw.medianDaysOnMarketSource);
  setSource('marketAsOf', fields.marketAsOf, raw.marketAsOfSource);
  setSource('amenitiesSummary', fields.amenitiesSummary, raw.amenitiesSummarySource);
  setSource('lifestyleSummary', fields.lifestyleSummary, raw.lifestyleSummarySource);
  setSource('commuteSummary', fields.commuteSummary, raw.commuteSummarySource);

  const summary = typeof raw.summary === 'string' ? raw.summary.trim().slice(0, 2000) : '';
  const verdict = typeof raw.verdict === 'string' ? raw.verdict.trim().slice(0, 400) : '';

  return { fields, fieldSources, summary, verdict };
}

/**
 * How much to trust a report, from how much grounded evidence backed it. Pure +
 * unit-tested. A realtor about to repeat this to a client needs to know whether
 * it's solid or thin — one wrong verdict kills the feature, so we surface the
 * thinness instead of hiding it.
 *
 *   high   — several pages scraped AND the key dimensions are populated
 *   low    — nothing scraped, or barely any field came back
 *   medium — everything in between
 */
export function computeConfidence(
  fields: AreaFields,
  stats: { scraped: number; searchResults: number },
): AreaConfidence {
  const keySignals = [
    fields.schoolRating || fields.schoolsSummary,
    fields.crimeLevel || fields.safetySummary,
    fields.walkScore != null || fields.walkabilitySummary,
    fields.marketSummary || fields.medianListPrice != null || fields.medianSalePrice != null,
    fields.lifestyleSummary || fields.amenitiesSummary,
  ].filter(Boolean).length;

  if (stats.scraped === 0 || keySignals <= 1) return 'low';
  if (stats.scraped >= 3 && keySignals >= 4) return 'high';
  return 'medium';
}

// ── LLM structuring step ─────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a real-estate market analyst. You are given research EVIDENCE gathered from the open web about ONE specific AREA (a neighborhood, city, or ZIP), and you must extract its facts into a strict JSON structure for a realtor briefing a buyer.

GROUNDING RULES — follow exactly:
- Use ONLY values that actually appear in the EVIDENCE for the TARGET area. Do not infer, estimate, or invent anything.
- For every field you populate, set its matching "<field>Source" to the exact source URL (from the evidence) the value came from. If you cannot attribute a value to a specific evidence URL, leave BOTH the field and its source null.
- If a fact is not present in the evidence, leave that field null (or an empty array). Never guess.
- Make sure the data describes the TARGET area, not a different city that may also appear on a page. If unsure, leave it null.
- Map the market direction to one of: rising, steady, cooling. If it doesn't map cleanly, use null.
- "marketAsOf": if the market figures show an as-of date, capture it (e.g. "Apr 2026"); otherwise null. Never invent a date.
- "verdict" is the ONE sentence the realtor leads with: who the area suits, the standout strength, and the honest catch. Lead with the judgment, grounded in the evidence. No em dash.
- "summary" must be 3-5 sentences that BACK the verdict and state only things supported by the evidence. If the evidence is thin, say so briefly.`;

export async function structureAreaEvidence(evidence: AreaEvidence): Promise<{
  fields: AreaFields;
  fieldSources: AreaFieldSources;
  summary: string;
  verdict: string;
}> {
  const client = getLLMClient();
  const model = openaiModel(ANALYSIS_MODEL);

  const response = await client.chat.completions.create(
    {
      model,
      temperature: 0,
      max_tokens: 2000,
      response_format: { type: 'json_schema', json_schema: AREA_ANALYSIS_JSON_SCHEMA },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content:
            'TARGET area + EVIDENCE follows. Extract the area facts per the rules.\n\n' +
            JSON.stringify(evidence, null, 2).slice(0, 60_000),
        },
      ],
    },
    { timeout: LLM_TIMEOUT_MS },
  );

  const content = response.choices?.[0]?.message?.content;
  if (!content) throw new Error('LLM returned an empty response');
  const raw = JSON.parse(content) as RawAreaResponse;
  return parseAreaResponse(raw);
}

// ── Buyer-aware verdict (fast, no web calls) ─────────────────────────────────

const VERDICT_MODEL = 'gpt-5-mini';

/**
 * Re-cast the area verdict for a SPECIFIC buyer, using ONLY the already-
 * researched intelligence (no web calls, so it's fast and the shared cache stays
 * neutral). "Strong for the Chens: top schools and quiet streets for two kids,
 * but ~8% over their metro budget." Best-effort: any failure returns the neutral
 * verdict unchanged.
 */
export async function tailorVerdict(
  intelligence: AreaIntelligence,
  buyer: string,
): Promise<string> {
  const who = (buyer ?? '').trim().slice(0, 300);
  if (!who) return intelligence.verdict;
  try {
    const client = getLLMClient();
    const facts = JSON.stringify({
      verdict: intelligence.verdict,
      summary: intelligence.summary,
      fields: intelligence.fields,
    }).slice(0, 4000);
    const res = await client.chat.completions.create(
      {
        model: openaiModel(VERDICT_MODEL),
        temperature: 0.3,
        max_tokens: 120,
        messages: [
          {
            role: 'system',
            content:
              'Write ONE sentence: a realtor\'s verdict on whether this area fits THIS buyer, ' +
              'grounded ONLY in the AREA FACTS given. Lead with the judgment (good fit, mixed, or weak) ' +
              'and the single reason that matters most to this buyer, then the honest catch. Introduce ' +
              'no facts beyond those given. No em dash.',
          },
          { role: 'user', content: `BUYER: ${who}\n\nAREA FACTS:\n${facts}` },
        ],
      },
      { timeout: 12_000 },
    );
    const out = res.choices?.[0]?.message?.content?.trim();
    return out && out.length > 0 ? out.slice(0, 400) : intelligence.verdict;
  } catch (err) {
    logger.warn('[area-analysis] verdict tailoring failed', undefined, err);
    return intelligence.verdict;
  }
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

/** Which required keys, if any, are missing. (Shared posture with property analysis.) */
export function missingResearchKeys(): Array<'TAVILY_API_KEY' | 'FIRECRAWL_API_KEY'> {
  const missing: Array<'TAVILY_API_KEY' | 'FIRECRAWL_API_KEY'> = [];
  if (!tavilyConfigured()) missing.push('TAVILY_API_KEY');
  if (!firecrawlConfigured()) missing.push('FIRECRAWL_API_KEY');
  return missing;
}

/**
 * Run the full area-research pipeline. Pure orchestration over the gated clients
 * + the tested structure function. NEVER throws: all outcomes are returned as
 * the discriminated AreaAnalyzeOutcome.
 */
export async function analyzeArea(subject: AreaSubject): Promise<AreaAnalyzeOutcome> {
  const generatedAt = new Date().toISOString();

  const missing = missingResearchKeys();
  if (missing.length > 0) return { status: 'not_configured', missing };

  const controller = new AbortController();
  const budgetTimer = setTimeout(() => controller.abort(), TOTAL_BUDGET_MS);

  try {
    const results = await searchArea(subject, controller.signal);
    if (results.length === 0) {
      logger.info('[area-analysis] no search results', { area: subject.label });
      return { status: 'no_evidence', generatedAt };
    }

    const urls = results.slice(0, PAGES_TO_SCRAPE).map((r) => r.url);
    const pages = await scrapeArea(urls, controller.signal);

    const evidence = buildAreaEvidence(subject, results, pages);
    const { fields, fieldSources, summary, verdict } = await structureAreaEvidence(evidence);

    const sources: AnalysisSource[] = dedupeSources(results, pages);
    const stats = { searchResults: results.length, scraped: pages.length };
    const intelligence: AreaIntelligence = {
      fields,
      fieldSources,
      verdict,
      summary,
      confidence: computeConfidence(fields, stats),
      sources,
      stats,
      generatedAt,
    };

    logger.info('[area-analysis] complete', {
      area: subject.label,
      searchResults: results.length,
      scraped: pages.length,
    });

    return { status: 'ok', intelligence };
  } catch (err) {
    logger.error('[area-analysis] failed', { area: subject.label }, err);
    const message =
      err instanceof Error && err.name === 'AbortError'
        ? 'Research timed out. Please try again.'
        : 'Analysis failed. Please try again.';
    return { status: 'error', message };
  } finally {
    clearTimeout(budgetTimer);
  }
}

/** Union of the pages we consulted, scraped pages first. */
function dedupeSources(results: SearchResult[], pages: ScrapedArea[]): AnalysisSource[] {
  const titleByUrl = new Map(results.map((r) => [r.url, r.title]));
  const seen = new Set<string>();
  const out: AnalysisSource[] = [];
  for (const p of pages) {
    if (seen.has(p.sourceUrl)) continue;
    seen.add(p.sourceUrl);
    out.push({ url: p.sourceUrl, title: titleByUrl.get(p.sourceUrl) ?? p.sourceUrl });
  }
  for (const r of results.slice(0, 8)) {
    if (seen.has(r.url)) continue;
    seen.add(r.url);
    out.push({ url: r.url, title: r.title || r.url });
  }
  return out.slice(0, 12);
}
