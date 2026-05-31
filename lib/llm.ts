/**
 * LLM provider — OpenRouter.
 *
 * Every model call in the app (chat agent, autonomous runs, embeddings,
 * lead-scoring enhancement, the legacy RAG route) goes through one OpenAI
 * client built here. OpenRouter is OpenAI-API-compatible, so the only
 * difference from calling OpenAI directly is the base URL + key.
 *
 * Fallback: when `OPENROUTER_API_KEY` is absent the client falls back to
 * calling OpenAI directly with `OPENAI_API_KEY`, so a deploy that hasn't
 * set the OpenRouter key keeps working.
 *
 * The Python agent has its own equivalent at `agent/llm.py`. The chat
 * model registry lives in `./chat-models` (pure data, client-safe) and is
 * re-exported here for server-side convenience.
 */

import OpenAI from 'openai';

export {
  CHAT_MODELS,
  DEFAULT_CHAT_MODEL,
  isValidChatModel,
  type ChatModelOption,
} from './chat-models';

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * Build the shared LLM client. Routes through OpenRouter when configured,
 * otherwise OpenAI direct. Throws only when neither key is present.
 */
export function getLLMClient(): OpenAI {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (openRouterKey) {
    return new OpenAI({ apiKey: openRouterKey, baseURL: OPENROUTER_BASE_URL });
  }
  const openAIKey = process.env.OPENAI_API_KEY;
  if (openAIKey) {
    return new OpenAI({ apiKey: openAIKey });
  }
  throw new Error('No LLM key configured — set OPENROUTER_API_KEY (or OPENAI_API_KEY).');
}

/** True once OpenRouter is the active provider. */
export function isOpenRouterConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

/** True when at least one LLM provider key is configured (OpenRouter or OpenAI). */
export function hasLLMKey(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY);
}

/**
 * Resolve a bare OpenAI model name to the slug the active provider wants —
 * vendor-prefixed (`openai/...`) for OpenRouter, bare for OpenAI direct.
 * Use for internal utility calls (embeddings, scoring, compaction). The
 * realtor-pickable chat models in CHAT_MODELS are already OpenRouter slugs.
 */
export function openaiModel(name: string): string {
  return isOpenRouterConfigured() ? `openai/${name}` : name;
}

/**
 * Embedding model slug. OpenRouter and OpenAI both resolve this to the
 * same underlying model, so stored 1536-dim vectors stay valid across the
 * provider switch — do NOT change this without re-embedding the corpus.
 */
export const EMBEDDING_MODEL = isOpenRouterConfigured()
  ? 'openai/text-embedding-3-small'
  : 'text-embedding-3-small';

/**
 * Return the OpenRouter provider prefix from a model slug. Mirrors
 * `detect_provider` in `agent/llm.py` — keep the two in sync.
 *
 *   'anthropic/claude-opus-4.7' -> 'anthropic'
 *   'openai/gpt-5.5'            -> 'openai'
 *   'x-ai/grok-4.3'             -> 'xai'   (dash normalized out)
 *   'deepseek/deepseek-chat'    -> 'deepseek'
 *   'google/gemini-2.5-pro'     -> 'google'
 *   bare 'gpt-5'                -> 'openai' (OpenAI-direct fallback)
 *
 * Drives the ChatUsage.provider column and Usage page breakdown. Per-
 * provider caching support on OpenRouter:
 *   - anthropic: explicit `cache_control` markers, ~90% discount on
 *     cached input after first hit.
 *   - google (Phase 3): same `cache_control` markers as Anthropic on
 *     OpenRouter, ~75% discount. Min cache write ~4096 tokens.
 *   - openai / deepseek: automatic on stable prefixes >1024 tokens,
 *     ~50% discount.
 *   - xai / moonshotai / qwen: no caching path today; Phase 1 trim is
 *     the only saving.
 */
export function detectProvider(model: string | null | undefined): string {
  if (!model) return 'unknown';
  if (!model.includes('/')) return 'openai';
  const prefix = model.split('/', 1)[0].toLowerCase().replace(/-/g, '');
  return prefix || 'unknown';
}

/**
 * Human-friendly provider labels for the Usage page breakdown. Anything
 * not in the table renders as the raw prefix.
 */
export const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic Claude',
  openai: 'OpenAI',
  xai: 'xAI Grok',
  deepseek: 'DeepSeek',
  google: 'Google Gemini',
  moonshotai: 'Moonshot Kimi',
  qwen: 'Qwen',
  unknown: 'Other',
};

/**
 * Providers where OpenRouter caches input tokens. The realtor should see
 * a meaningful hit rate over time on these. xAI / Moonshot / Qwen fall
 * back to Phase 1's prompt trim only, so a 0% rate there is correct —
 * not a bug worth surfacing. Google Gemini was added in Phase 3 once the
 * cache_control proxy was extended to forward Anthropic-shape markers
 * to Gemini on OpenRouter.
 */
export const CACHING_PROVIDERS = new Set([
  'anthropic',
  'openai',
  'deepseek',
  'google',
]);
