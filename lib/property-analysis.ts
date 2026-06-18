/**
 * Property "Analyze" pipeline — web research → LLM structuring → DB persist.
 *
 * Flow (all server-side):
 *   1. GATE   — both TAVILY_API_KEY and FIRECRAWL_API_KEY must be set, else we
 *               return a `not_configured` status (the route turns that into a
 *               clear UI state; nothing throws).
 *   2. SEARCH — Tavily finds the pages that describe THIS specific address
 *               (listing, sale history, public record, market context).
 *   3. SCRAPE — Firecrawl scrapes the top pages and extracts the property's
 *               facts from each (parallel, per-scrape timeout, capped count).
 *   4. STRUCTURE — the app LLM (`getLLMClient`, a strong model — OpenAI GPT) is
 *               fed the gathered evidence under a STRICT JSON schema matching the
 *               Property columns + a summary. GROUNDING RULE in the prompt: use
 *               only values present in the evidence, cite a source URL per field,
 *               never invent, leave unknowns null.
 *   5. MERGE  — fill EMPTY Property columns with the found values (NEVER overwrite
 *               a non-null human-entered value), and store the full structured
 *               result + summary + sources in Property.analysis with analyzedAt.
 *
 * The pure pieces (`structureEvidence`'s parsing, `mergePropertyFields`, the
 * schema, evidence assembly) are exported and unit-tested without any network.
 */

import 'server-only';
import { logger } from '@/lib/logger';
import { getLLMClient, openaiModel } from '@/lib/llm';
import { isValidPropertyType } from '@/lib/properties';
import type {
  AnalyzedFields,
  FieldSources,
  AnalysisSource,
  PropertyAnalysis,
} from '@/lib/types';
import {
  tavilyConfigured,
  searchProperty,
  type TavilySubject,
  type SearchResult,
} from '@/lib/research/tavily';
import {
  firecrawlConfigured,
  scrapeProperty,
  MAX_SCRAPES,
  type ScrapedProperty,
} from '@/lib/research/firecrawl';

export type { AnalyzedFields, FieldSources, AnalysisSource, PropertyAnalysis };

// ── Tunables ─────────────────────────────────────────────────────────────────

/**
 * Strong model for the contextualization step. Prefer OpenAI GPT (per spec) and
 * route through the shared client: `openaiModel` vendor-prefixes it to
 * `openai/gpt-4.1` on OpenRouter and leaves it bare for OpenAI-direct.
 */
const ANALYSIS_MODEL = 'gpt-4.1';

/** How many of the ranked Tavily results we hand to the scraper. */
const PAGES_TO_SCRAPE = MAX_SCRAPES;

/** Overall server-side time budget for the whole research run. */
const TOTAL_BUDGET_MS = 55_000;

/** LLM call timeout (the structuring step is a single non-streamed call). */
const LLM_TIMEOUT_MS = 30_000;

// ── Public shapes ────────────────────────────────────────────────────────────
// AnalyzedFields / FieldSources / AnalysisSource / PropertyAnalysis are defined
// in lib/types.ts (client-safe, shared with the UI) and re-exported above.

/** Discriminated result so the route can render each case cleanly. */
export type AnalyzeOutcome =
  | { status: 'ok'; analysis: PropertyAnalysis; patch: Partial<PropertyRecord> }
  | { status: 'not_configured'; missing: Array<'TAVILY_API_KEY' | 'FIRECRAWL_API_KEY'> }
  | { status: 'no_evidence'; analyzedAt: string }
  | { status: 'error'; message: string };

/** The Property columns this module reads (to decide empties) + writes. */
export interface PropertyRecord {
  id: string;
  address: string;
  unitNumber: string | null;
  city: string | null;
  stateRegion: string | null;
  postalCode: string | null;
  mlsNumber: string | null;
  propertyType: string | null;
  beds: number | null;
  baths: number | null;
  squareFeet: number | null;
  lotSizeSqft: number | null;
  yearBuilt: number | null;
  listPrice: number | null;
  listingStatus: string;
  listingUrl: string | null;
  photos: string[];
  notes: string | null;
}

// ── Evidence assembly (pure) ─────────────────────────────────────────────────

/** Compact JSON-ish evidence block handed to the LLM. */
export interface Evidence {
  subject: TavilySubject;
  /** Search snippets (context the scraper didn't fully capture). */
  searchSnippets: Array<{ url: string; title: string; snippet: string }>;
  /** Per-page structured facts from Firecrawl. */
  pages: ScrapedProperty[];
}

export function buildEvidence(
  subject: TavilySubject,
  results: SearchResult[],
  pages: ScrapedProperty[],
): Evidence {
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
//
// OpenAI strict json_schema mode requires: additionalProperties:false on every
// object, every property listed in `required`, and nullable scalars expressed as
// anyOf [type, null]. We model each populated field's source URL as a sibling
// `*Source` string (null when the field is null) rather than a nested object, to
// keep the schema flat and the grounding 1:1.

const numOrNull = { anyOf: [{ type: 'number' as const }, { type: 'null' as const }] };
const strOrNull = { anyOf: [{ type: 'string' as const }, { type: 'null' as const }] };

export const ANALYSIS_JSON_SCHEMA = {
  name: 'property_analysis',
  strict: true,
  schema: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      beds: numOrNull,
      bedsSource: strOrNull,
      baths: numOrNull,
      bathsSource: strOrNull,
      squareFeet: numOrNull,
      squareFeetSource: strOrNull,
      lotSizeSqft: numOrNull,
      lotSizeSqftSource: strOrNull,
      yearBuilt: numOrNull,
      yearBuiltSource: strOrNull,
      propertyType: {
        anyOf: [
          {
            type: 'string' as const,
            enum: ['single_family', 'condo', 'townhouse', 'multi_family', 'land', 'commercial', 'other'],
          },
          { type: 'null' as const },
        ],
        description: 'Canonical Property type, mapped from the evidence. Null if unclear.',
      },
      propertyTypeSource: strOrNull,
      listPrice: numOrNull,
      listPriceSource: strOrNull,
      listingStatus: {
        anyOf: [
          { type: 'string' as const, enum: ['active', 'pending', 'sold', 'off_market', 'owned'] },
          { type: 'null' as const },
        ],
        description: 'Canonical listing status mapped from the evidence. Null if unclear.',
      },
      listingStatusSource: strOrNull,
      listingUrl: { ...strOrNull, description: 'Canonical listing page URL for THIS property.' },
      estimatedValue: { ...numOrNull, description: 'Site estimate (Zestimate/Redfin Estimate), USD.' },
      estimatedValueSource: strOrNull,
      lastSoldPrice: numOrNull,
      lastSoldPriceSource: strOrNull,
      lastSoldDate: { ...strOrNull, description: 'Most recent sale date as shown.' },
      lastSoldDateSource: strOrNull,
      description: { ...strOrNull, description: 'A concise factual description of the property.' },
      descriptionSource: strOrNull,
      features: {
        type: 'array' as const,
        items: { type: 'string' as const },
        description: 'Notable features explicitly present in the evidence.',
      },
      hoaFee: strOrNull,
      hoaFeeSource: strOrNull,
      propertyTaxes: strOrNull,
      propertyTaxesSource: strOrNull,
      photoUrls: {
        type: 'array' as const,
        items: { type: 'string' as const },
        description: 'Direct photo image URLs for THIS property from the evidence.',
      },
      summary: {
        type: 'string' as const,
        description:
          'A 2-4 sentence grounded summary for the realtor: what the property is, pricing/sale ' +
          'context, and any standout facts. Only state things supported by the evidence.',
      },
    },
    required: [
      'beds', 'bedsSource',
      'baths', 'bathsSource',
      'squareFeet', 'squareFeetSource',
      'lotSizeSqft', 'lotSizeSqftSource',
      'yearBuilt', 'yearBuiltSource',
      'propertyType', 'propertyTypeSource',
      'listPrice', 'listPriceSource',
      'listingStatus', 'listingStatusSource',
      'listingUrl',
      'estimatedValue', 'estimatedValueSource',
      'lastSoldPrice', 'lastSoldPriceSource',
      'lastSoldDate', 'lastSoldDateSource',
      'description', 'descriptionSource',
      'features',
      'hoaFee', 'hoaFeeSource',
      'propertyTaxes', 'propertyTaxesSource',
      'photoUrls',
      'summary',
    ],
  },
};

/** Raw shape returned by the model (flat, with *Source siblings). */
export interface RawAnalysisResponse {
  beds: number | null; bedsSource: string | null;
  baths: number | null; bathsSource: string | null;
  squareFeet: number | null; squareFeetSource: string | null;
  lotSizeSqft: number | null; lotSizeSqftSource: string | null;
  yearBuilt: number | null; yearBuiltSource: string | null;
  propertyType: string | null; propertyTypeSource: string | null;
  listPrice: number | null; listPriceSource: string | null;
  listingStatus: string | null; listingStatusSource: string | null;
  listingUrl: string | null;
  estimatedValue: number | null; estimatedValueSource: string | null;
  lastSoldPrice: number | null; lastSoldPriceSource: string | null;
  lastSoldDate: string | null; lastSoldDateSource: string | null;
  description: string | null; descriptionSource: string | null;
  features: string[];
  hoaFee: string | null; hoaFeeSource: string | null;
  propertyTaxes: string | null; propertyTaxesSource: string | null;
  photoUrls: string[];
  summary: string;
}

// ── Parsing the LLM response into our typed shapes (pure) ─────────────────────

const POSITIVE_NUM = (v: number | null): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

/** Keep a source only if it's a non-empty URL string. */
function cleanSource(v: string | null): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length > 0 && /^https?:\/\//i.test(t) ? t.slice(0, 1000) : undefined;
}

/**
 * Convert the model's flat response into `{ fields, fieldSources }`, applying
 * light validation/clamping. Pure — unit-tested directly. A field's source is
 * only recorded when the field actually has a value.
 */
export function parseAnalysisResponse(raw: RawAnalysisResponse): {
  fields: AnalyzedFields;
  fieldSources: FieldSources;
  summary: string;
} {
  const fieldSources: FieldSources = {};
  const setSource = (key: keyof AnalyzedFields, val: unknown, src: string | null) => {
    const hasValue = Array.isArray(val) ? val.length > 0 : val !== null && val !== undefined;
    const s = cleanSource(src);
    if (hasValue && s) fieldSources[key] = s;
  };

  const propertyType = isValidPropertyType(raw.propertyType) ? raw.propertyType : null;
  const validStatuses = new Set(['active', 'pending', 'sold', 'off_market', 'owned']);
  const listingStatus =
    typeof raw.listingStatus === 'string' && validStatuses.has(raw.listingStatus)
      ? raw.listingStatus
      : null;

  const features = Array.isArray(raw.features)
    ? raw.features.filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
        .map((f) => f.trim().slice(0, 160))
        .slice(0, 30)
    : [];
  const photoUrls = Array.isArray(raw.photoUrls)
    ? raw.photoUrls.filter((u): u is string => typeof u === 'string' && /^https?:\/\//i.test(u))
        .map((u) => u.trim().slice(0, 1000))
        .slice(0, 20)
    : [];

  const fields: AnalyzedFields = {
    beds: POSITIVE_NUM(raw.beds),
    baths: POSITIVE_NUM(raw.baths),
    squareFeet: POSITIVE_NUM(raw.squareFeet),
    lotSizeSqft: POSITIVE_NUM(raw.lotSizeSqft),
    yearBuilt: POSITIVE_NUM(raw.yearBuilt),
    propertyType,
    listPrice: POSITIVE_NUM(raw.listPrice),
    listingStatus,
    listingUrl: cleanSource(raw.listingUrl) ?? null,
    estimatedValue: POSITIVE_NUM(raw.estimatedValue),
    lastSoldPrice: POSITIVE_NUM(raw.lastSoldPrice),
    lastSoldDate: typeof raw.lastSoldDate === 'string' && raw.lastSoldDate.trim() ? raw.lastSoldDate.trim().slice(0, 60) : null,
    description: typeof raw.description === 'string' && raw.description.trim() ? raw.description.trim().slice(0, 4000) : null,
    features,
    hoaFee: typeof raw.hoaFee === 'string' && raw.hoaFee.trim() ? raw.hoaFee.trim().slice(0, 60) : null,
    propertyTaxes: typeof raw.propertyTaxes === 'string' && raw.propertyTaxes.trim() ? raw.propertyTaxes.trim().slice(0, 60) : null,
    photoUrls,
  };

  setSource('beds', fields.beds, raw.bedsSource);
  setSource('baths', fields.baths, raw.bathsSource);
  setSource('squareFeet', fields.squareFeet, raw.squareFeetSource);
  setSource('lotSizeSqft', fields.lotSizeSqft, raw.lotSizeSqftSource);
  setSource('yearBuilt', fields.yearBuilt, raw.yearBuiltSource);
  setSource('propertyType', fields.propertyType, raw.propertyTypeSource);
  setSource('listPrice', fields.listPrice, raw.listPriceSource);
  setSource('listingStatus', fields.listingStatus, raw.listingStatusSource);
  setSource('estimatedValue', fields.estimatedValue, raw.estimatedValueSource);
  setSource('lastSoldPrice', fields.lastSoldPrice, raw.lastSoldPriceSource);
  setSource('lastSoldDate', fields.lastSoldDate, raw.lastSoldDateSource);
  setSource('description', fields.description, raw.descriptionSource);
  setSource('hoaFee', fields.hoaFee, raw.hoaFeeSource);
  setSource('propertyTaxes', fields.propertyTaxes, raw.propertyTaxesSource);

  const summary = typeof raw.summary === 'string' ? raw.summary.trim().slice(0, 2000) : '';

  return { fields, fieldSources, summary };
}

// ── Merge: fill EMPTY columns only (pure, unit-tested) ───────────────────────

/** A Property column is "empty" if null/undefined, or '' for strings. */
function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

/**
 * Compute the DB patch from analyzed fields: ONLY columns currently empty on the
 * record are filled. Human-entered (non-null) values are never overwritten.
 * `listingStatus` defaults to 'active' so it's treated as "set" unless the
 * record is genuinely at the default AND the analysis found a more specific
 * status — we deliberately do NOT touch it (a realtor's chosen status wins, and
 * the default is a real value, not "empty"). Pure — unit-tested directly.
 *
 * Note: `photos` is additive — if the record has no photos and the analysis
 * found photo URLs, we set them; if the record already has photos we leave them.
 */
export function mergePropertyFields(
  record: Pick<
    PropertyRecord,
    | 'propertyType' | 'beds' | 'baths' | 'squareFeet' | 'lotSizeSqft' | 'yearBuilt'
    | 'listPrice' | 'listingUrl' | 'photos'
  >,
  fields: AnalyzedFields,
): Partial<PropertyRecord> {
  const patch: Partial<PropertyRecord> = {};

  if (isEmpty(record.beds) && fields.beds != null) patch.beds = fields.beds;
  if (isEmpty(record.baths) && fields.baths != null) patch.baths = fields.baths;
  if (isEmpty(record.squareFeet) && fields.squareFeet != null) {
    patch.squareFeet = Math.round(fields.squareFeet);
  }
  if (isEmpty(record.lotSizeSqft) && fields.lotSizeSqft != null) {
    patch.lotSizeSqft = Math.round(fields.lotSizeSqft);
  }
  if (isEmpty(record.yearBuilt) && fields.yearBuilt != null) {
    patch.yearBuilt = Math.round(fields.yearBuilt);
  }
  if (isEmpty(record.propertyType) && fields.propertyType != null) {
    patch.propertyType = fields.propertyType as PropertyRecord['propertyType'];
  }
  if (isEmpty(record.listPrice) && fields.listPrice != null) patch.listPrice = fields.listPrice;
  if (isEmpty(record.listingUrl) && fields.listingUrl != null) patch.listingUrl = fields.listingUrl;

  // Photos: only when the record has none and we found some.
  const hasPhotos = Array.isArray(record.photos) && record.photos.length > 0;
  if (!hasPhotos && fields.photoUrls.length > 0) {
    patch.photos = fields.photoUrls.slice(0, 20);
  }

  return patch;
}

// ── LLM structuring step ─────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a real-estate data analyst. You are given research EVIDENCE gathered from the open web about ONE specific property (a target address), and you must extract its facts into a strict JSON structure.

GROUNDING RULES — follow exactly:
- Use ONLY values that actually appear in the EVIDENCE for the TARGET property at the subject address. Do not infer, estimate, or invent anything.
- For every field you populate, set its matching "<field>Source" to the exact source URL (from the evidence) that the value came from. If you cannot attribute a value to a specific evidence URL, leave BOTH the field and its source null.
- If a fact is not present in the evidence, leave that field null (or an empty array for list fields). Never guess.
- Be careful that the data describes the SUBJECT property, not a neighboring/comparable home that may also appear on a page. If unsure it's the subject, leave it null.
- Map free-text property type to one of the allowed enum values; map listing status likewise. If it doesn't map cleanly, use null.
- "summary" must be 2-4 sentences and state only things supported by the evidence. If the evidence is thin, say so briefly.`;

/**
 * Call the LLM to structure the evidence. Returns the parsed result, or throws
 * on a hard LLM/parse failure (the orchestrator catches → 'error'). Separated
 * so the orchestrator stays readable; the schema + parser are tested without it.
 */
export async function structureEvidence(evidence: Evidence): Promise<{
  fields: AnalyzedFields;
  fieldSources: FieldSources;
  summary: string;
}> {
  const client = getLLMClient();
  const model = openaiModel(ANALYSIS_MODEL);

  const response = await client.chat.completions.create(
    {
      model,
      temperature: 0,
      max_tokens: 2000,
      response_format: { type: 'json_schema', json_schema: ANALYSIS_JSON_SCHEMA },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content:
            'TARGET property + EVIDENCE follows. Extract the subject property facts per the rules.\n\n' +
            JSON.stringify(evidence, null, 2).slice(0, 60_000),
        },
      ],
    },
    { timeout: LLM_TIMEOUT_MS },
  );

  const content = response.choices?.[0]?.message?.content;
  if (!content) throw new Error('LLM returned an empty response');
  const raw = JSON.parse(content) as RawAnalysisResponse;
  return parseAnalysisResponse(raw);
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

/** Build the Tavily subject from a Property record. */
function toSubject(record: PropertyRecord): TavilySubject {
  return {
    address: record.address,
    unitNumber: record.unitNumber,
    city: record.city,
    stateRegion: record.stateRegion,
    postalCode: record.postalCode,
    mlsNumber: record.mlsNumber,
  };
}

/** Which required keys, if any, are missing. */
export function missingResearchKeys(): Array<'TAVILY_API_KEY' | 'FIRECRAWL_API_KEY'> {
  const missing: Array<'TAVILY_API_KEY' | 'FIRECRAWL_API_KEY'> = [];
  if (!tavilyConfigured()) missing.push('TAVILY_API_KEY');
  if (!firecrawlConfigured()) missing.push('FIRECRAWL_API_KEY');
  return missing;
}

/**
 * Run the full Analyze pipeline for a Property record. Pure orchestration over
 * the gated clients + the (tested) structure/merge functions. NEVER throws: all
 * outcomes are returned as the discriminated `AnalyzeOutcome`.
 */
export async function analyzeProperty(record: PropertyRecord): Promise<AnalyzeOutcome> {
  const analyzedAt = new Date().toISOString();

  // 1) GATE — graceful degradation when research isn't configured.
  const missing = missingResearchKeys();
  if (missing.length > 0) return { status: 'not_configured', missing };

  // Shared abort across the whole research run keeps us inside the time budget.
  const controller = new AbortController();
  const budgetTimer = setTimeout(() => controller.abort(), TOTAL_BUDGET_MS);

  try {
    const subject = toSubject(record);

    // 2) SEARCH
    const results = await searchProperty(subject, controller.signal);
    if (results.length === 0) {
      logger.info('[property-analysis] no search results', { propertyId: record.id });
      return { status: 'no_evidence', analyzedAt };
    }

    // 3) SCRAPE the top-ranked pages.
    const urls = results.slice(0, PAGES_TO_SCRAPE).map((r) => r.url);
    const pages = await scrapeProperty(urls, controller.signal);

    // If scraping yielded nothing structured, still try the LLM on the snippets,
    // but if BOTH are empty there's nothing to ground on.
    if (pages.length === 0 && results.length === 0) {
      return { status: 'no_evidence', analyzedAt };
    }

    // 4) STRUCTURE via the LLM.
    const evidence = buildEvidence(subject, results, pages);
    const { fields, fieldSources, summary } = await structureEvidence(evidence);

    // 5) Assemble result + the fill-empty-only DB patch.
    const sources: AnalysisSource[] = dedupeSources(results, pages);
    const analysis: PropertyAnalysis = {
      fields,
      fieldSources,
      summary,
      sources,
      stats: { searchResults: results.length, scraped: pages.length },
      analyzedAt,
    };
    const patch = mergePropertyFields(record, fields);

    logger.info('[property-analysis] complete', {
      propertyId: record.id,
      searchResults: results.length,
      scraped: pages.length,
      filledColumns: Object.keys(patch).length,
    });

    return { status: 'ok', analysis, patch };
  } catch (err) {
    logger.error('[property-analysis] failed', { propertyId: record.id }, err);
    const message =
      err instanceof Error && err.name === 'AbortError'
        ? 'Research timed out. Please try again.'
        : 'Analysis failed. Please try again.';
    return { status: 'error', message };
  } finally {
    clearTimeout(budgetTimer);
  }
}

/** Union of the source pages we actually consulted, scraped pages first. */
function dedupeSources(results: SearchResult[], pages: ScrapedProperty[]): AnalysisSource[] {
  const titleByUrl = new Map(results.map((r) => [r.url, r.title]));
  const seen = new Set<string>();
  const out: AnalysisSource[] = [];
  for (const p of pages) {
    if (seen.has(p.sourceUrl)) continue;
    seen.add(p.sourceUrl);
    out.push({ url: p.sourceUrl, title: titleByUrl.get(p.sourceUrl) ?? p.sourceUrl });
  }
  // Then any top search results we didn't scrape, for transparency.
  for (const r of results.slice(0, 8)) {
    if (seen.has(r.url)) continue;
    seen.add(r.url);
    out.push({ url: r.url, title: r.title || r.url });
  }
  return out.slice(0, 12);
}
