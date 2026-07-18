/**
 * CMA narrative — a seller-facing listing pitch generated from a CmaPayload.
 *
 * Realtors turn a CMA into a pre-listing pitch by hand today. `composeCmaNarrative`
 * asks the LLM for a short, grounded, three-paragraph narrative that cites the
 * real numbers already computed in the payload (suggested range, comp count,
 * $/sqft, data source) — nothing invented.
 *
 * Grounding contract (mirrors lib/deals/next-move.ts): the model receives ONLY
 * facts drawn from the payload, is told to use ONLY those facts, and is told to
 * say plainly when the comp data is thin rather than oversell a shaky number.
 * Honest UI: when the payload itself doesn't have enough data to defend a
 * valuation (`stats.insufficientData`), we never call the LLM — there is
 * nothing true to write a pitch about, so `composeCmaNarrative` returns `null`.
 *
 * LLM calls go through getLLMClient() (never `new OpenAI(...)`) with the
 * OpenRouter usage-accounting opt-in, and token/cost telemetry lands in
 * ChatUsage via recordChatUsage (route 'agent') — same billing contract as
 * every other text call (see lib/deals/next-move.ts for the pattern this
 * mirrors).
 */

import {
  getLLMClient,
  hasLLMKey,
  openaiModel,
  usageAccountingParams,
} from '@/lib/llm';
import { recordChatUsage } from '@/lib/usage/record-chat-usage';
import { logger } from '@/lib/logger';
import { DATA_SOURCE_LABEL, type CmaPayload } from '@/lib/cma-types';

/** Raised only for real failures (no key, empty/errored completion) — never
 * for the honest "not enough data" case, which is a plain `null` return. */
export class CmaNarrativeError extends Error {}

// Same rationale as next-move.ts: short grounded copy, not a reasoning task.
const MODEL = 'gpt-4.1-mini';
const TIMEOUT_MS = 30_000;
const MAX_TOKENS = 500;

export interface ComposeCmaNarrativeOpts {
  spaceId: string;
  /** Workspace / brand name, if known — folded into the pitch's voice. */
  brandName?: string | null;
  signal?: AbortSignal;
}

const SYSTEM_PROMPT =
  'You are Chippi, an AI assistant for a real-estate CRM, writing a seller-facing pre-listing pitch from a completed comparative market analysis (CMA). ' +
  'GROUNDING: use ONLY the numbers and facts present in the user JSON. Never invent comps, dollar figures, dates, neighborhood claims, or amenities that are not in the JSON. ' +
  'If the JSON marks the comp data as thin (few comps, no market estimate), say so plainly in the narrative instead of oversellling the number — honesty beats polish. ' +
  'Write exactly three short paragraphs of plain prose (no headings, no bullet points, no markdown): ' +
  '(1) open with the suggested price range and what it is based on, ' +
  '(2) walk through what the comparable homes show (cite the comp count, and the $/sqft or basis if present), ' +
  '(3) close with a confident, warm recommendation for listing, calibrated honestly to how strong the data is. ' +
  'Voice: warm, specific, confident but never hypey — a sharp local agent talking to a seller, not marketing copy. No exclamation marks, no emojis. ' +
  'Output plain text only — the three paragraphs, nothing else (no preamble like "Here is the narrative").';

/** Build the grounded fact payload handed to the model — ONLY real numbers. */
function buildFacts(payload: CmaPayload, brandName?: string | null) {
  const { subject, stats, comps } = payload;
  return {
    preparedBy: brandName?.trim() || null,
    subjectAddress: subject.address,
    subjectCity: subject.city,
    beds: subject.beds,
    baths: subject.baths,
    squareFeet: subject.squareFeet,
    currentListPrice: subject.listPrice,
    suggestedLow: stats.suggestedLow,
    suggestedHigh: stats.suggestedHigh,
    estimatedValue: stats.estimatedValue,
    compCount: stats.compCount,
    pricedCompCount: stats.pricedCount,
    lowCompPrice: stats.low,
    medianCompPrice: stats.median,
    highCompPrice: stats.high,
    avgPricePerSqft: stats.avgPricePerSqft,
    priceBasis: stats.basis, // 'sold' | 'list' | 'mixed' | 'none'
    dataSource: DATA_SOURCE_LABEL[payload.dataSource],
    dataIsThin: stats.insufficientData,
    topComps: comps.slice(0, 5).map((c) => ({
      address: c.address,
      price: c.price,
      priceBasis: c.priceBasis,
      squareFeet: c.squareFeet,
    })),
  };
}

/**
 * Compose a grounded, three-paragraph seller-facing narrative from a CMA
 * payload. Returns `null` — WITHOUT calling the LLM — when the payload has
 * insufficient data to defend a valuation (honest UI: nothing true to pitch).
 * Throws `CmaNarrativeError` on a real failure (no LLM key, empty/errored
 * completion) so the route can surface a distinct "couldn't generate" error
 * rather than silently pretending there was nothing to say.
 */
export async function composeCmaNarrative(
  payload: CmaPayload,
  opts: ComposeCmaNarrativeOpts,
): Promise<string | null> {
  if (payload.stats.insufficientData) return null;

  if (!hasLLMKey()) {
    throw new CmaNarrativeError('No LLM key configured.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onExternalAbort);

  try {
    const client = getLLMClient();
    const model = openaiModel(MODEL);
    const facts = buildFacts(payload, opts.brandName);

    const response = await client.chat.completions.create(
      {
        model,
        temperature: 0.5,
        max_tokens: MAX_TOKENS,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(facts) },
        ],
        // Cast: `usage` is an OpenRouter request extension the OpenAI SDK's
        // param type doesn't know about; empty on direct-OpenAI deploys.
        ...(usageAccountingParams() as Record<string, never>),
      },
      { signal: controller.signal },
    );

    // Billing accuracy: every completed call lands in ChatUsage, exact
    // OpenRouter cost preferred (usage-accounting opt-in above).
    const u = response.usage as
      | (typeof response.usage & {
          prompt_tokens_details?: { cached_tokens?: number };
          cost?: number;
        })
      | undefined;
    if (u) {
      const costUsd =
        typeof u.cost === 'number' && Number.isFinite(u.cost) && u.cost >= 0
          ? u.cost
          : undefined;
      void recordChatUsage({
        spaceId: opts.spaceId,
        model,
        promptTokens: u.prompt_tokens ?? 0,
        completionTokens: u.completion_tokens ?? 0,
        cachedTokens: u.prompt_tokens_details?.cached_tokens ?? 0,
        costUsd,
        route: 'agent',
        runtime: 'ts',
      });
    }

    const raw = response.choices?.[0]?.message?.content?.trim();
    if (!raw) {
      logger.warn('[cma-narrative] compose unusable', { reason: 'empty_response' });
      throw new CmaNarrativeError('The model returned an empty narrative.');
    }
    return raw;
  } catch (err) {
    if (err instanceof CmaNarrativeError) throw err;
    logger.warn('[cma-narrative] compose failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    throw new CmaNarrativeError('Could not generate the narrative.');
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onExternalAbort);
  }
}
