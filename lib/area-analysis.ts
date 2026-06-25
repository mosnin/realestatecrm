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
      bikeScore: numOrNull,
      bikeScoreSource: strOrNull,
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
      summary: {
        type: 'string' as const,
        description:
          'A 3-5 sentence grounded brief for the realtor: what this area is like for a buyer ' +
          '(schools, safety, walkability, market, lifestyle). Only state what the evidence supports.',
      },
    },
    required: [
      'schoolsSummary', 'schoolsSummarySource',
      'schoolRating', 'schoolRatingSource',
      'safetySummary', 'safetySummarySource',
      'crimeLevel', 'crimeLevelSource',
      'walkScore', 'walkScoreSource',
      'transitScore', 'transitScoreSource',
      'bikeScore', 'bikeScoreSource',
      'walkabilitySummary', 'walkabilitySummarySource',
      'marketSummary', 'marketSummarySource',
      'medianListPrice', 'medianListPriceSource',
      'medianSalePrice', 'medianSalePriceSource',
      'marketTrend', 'marketTrendSource',
      'medianDaysOnMarket', 'medianDaysOnMarketSource',
      'amenitiesSummary', 'amenitiesSummarySource',
      'highlights',
      'lifestyleSummary', 'lifestyleSummarySource',
      'commuteSummary', 'commuteSummarySource',
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
  bikeScore: number | null; bikeScoreSource: string | null;
  walkabilitySummary: string | null; walkabilitySummarySource: string | null;
  marketSummary: string | null; marketSummarySource: string | null;
  medianListPrice: number | null; medianListPriceSource: string | null;
  medianSalePrice: number | null; medianSalePriceSource: string | null;
  marketTrend: string | null; marketTrendSource: string | null;
  medianDaysOnMarket: number | null; medianDaysOnMarketSource: string | null;
  amenitiesSummary: string | null; amenitiesSummarySource: string | null;
  highlights: string[];
  lifestyleSummary: string | null; lifestyleSummarySource: string | null;
  commuteSummary: string | null; commuteSummarySource: string | null;
  summary: string;
}

// ── Parsing the LLM response (pure, unit-tested) ─────────────────────────────

const POSITIVE_NUM = (v: number | null): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

/** 0-100 score or null. */
const SCORE_0_100 = (v: number | null): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 ? Math.round(v) : null;

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
    bikeScore: SCORE_0_100(raw.bikeScore),
    walkabilitySummary: cleanStr(raw.walkabilitySummary, 1200),
    marketSummary: cleanStr(raw.marketSummary, 1200),
    medianListPrice: POSITIVE_NUM(raw.medianListPrice),
    medianSalePrice: POSITIVE_NUM(raw.medianSalePrice),
    marketTrend,
    medianDaysOnMarket: POSITIVE_NUM(raw.medianDaysOnMarket),
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
  setSource('bikeScore', fields.bikeScore, raw.bikeScoreSource);
  setSource('walkabilitySummary', fields.walkabilitySummary, raw.walkabilitySummarySource);
  setSource('marketSummary', fields.marketSummary, raw.marketSummarySource);
  setSource('medianListPrice', fields.medianListPrice, raw.medianListPriceSource);
  setSource('medianSalePrice', fields.medianSalePrice, raw.medianSalePriceSource);
  setSource('marketTrend', fields.marketTrend, raw.marketTrendSource);
  setSource('medianDaysOnMarket', fields.medianDaysOnMarket, raw.medianDaysOnMarketSource);
  setSource('amenitiesSummary', fields.amenitiesSummary, raw.amenitiesSummarySource);
  setSource('lifestyleSummary', fields.lifestyleSummary, raw.lifestyleSummarySource);
  setSource('commuteSummary', fields.commuteSummary, raw.commuteSummarySource);

  const summary = typeof raw.summary === 'string' ? raw.summary.trim().slice(0, 2000) : '';

  return { fields, fieldSources, summary };
}

// ── LLM structuring step ─────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a real-estate market analyst. You are given research EVIDENCE gathered from the open web about ONE specific AREA (a neighborhood, city, or ZIP), and you must extract its facts into a strict JSON structure for a realtor briefing a buyer.

GROUNDING RULES — follow exactly:
- Use ONLY values that actually appear in the EVIDENCE for the TARGET area. Do not infer, estimate, or invent anything.
- For every field you populate, set its matching "<field>Source" to the exact source URL (from the evidence) the value came from. If you cannot attribute a value to a specific evidence URL, leave BOTH the field and its source null.
- If a fact is not present in the evidence, leave that field null (or an empty array). Never guess.
- Make sure the data describes the TARGET area, not a different city that may also appear on a page. If unsure, leave it null.
- Map the market direction to one of: rising, steady, cooling. If it doesn't map cleanly, use null.
- "summary" must be 3-5 sentences and state only things supported by the evidence. If the evidence is thin, say so briefly.`;

export async function structureAreaEvidence(evidence: AreaEvidence): Promise<{
  fields: AreaFields;
  fieldSources: AreaFieldSources;
  summary: string;
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
    const { fields, fieldSources, summary } = await structureAreaEvidence(evidence);

    const sources: AnalysisSource[] = dedupeSources(results, pages);
    const intelligence: AreaIntelligence = {
      fields,
      fieldSources,
      summary,
      sources,
      stats: { searchResults: results.length, scraped: pages.length },
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
