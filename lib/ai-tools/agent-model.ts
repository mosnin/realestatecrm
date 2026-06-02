/**
 * Agent-scoped model client — direct OpenAI, gpt-5-mini.
 *
 * The interactive chat agent runs on OpenAI DIRECT (not OpenRouter). This is
 * deliberate and scoped: only the in-app agent runtime resolves its model
 * here. Every OTHER caller — draft-writing, lead-scoring, embeddings, the
 * legacy RAG route — still goes through `lib/llm.ts` (OpenRouter-first).
 *
 * Why a separate path: OpenRouter adds a network hop and a cold-start tax on
 * the first token of every chat turn. The agent is the one surface where that
 * latency is felt directly by the realtor mid-conversation, so we cut the hop
 * and talk to OpenAI directly with `gpt-5-mini`. We do NOT flip the app-wide
 * client — that would silently re-route scoring/embeddings/drafts and break
 * the pinned 1536-dim embedding corpus.
 *
 * We hand the SDK an `OpenAIChatCompletionsModel` built against our own client
 * rather than mutating the SDK's global default client. Local instance = no
 * cross-request bleed, no global state, fully reversible.
 */

import OpenAI from 'openai';
import { OpenAIChatCompletionsModel } from '@openai/agents';
import type { Model } from '@openai/agents';

/** The model the in-app chat agent runs on. Direct OpenAI slug (bare, no
 *  vendor prefix — that prefixing is an OpenRouter convention). */
export const AGENT_CHAT_MODEL = 'gpt-5-mini';

/** Cache the client + model wrapper across turns. The OpenAI client is
 *  stateless per-request and safe to share; rebuilding it per turn would
 *  re-pay TLS/agent setup for no benefit. */
let cachedClient: OpenAI | null = null;
let cachedModel: Model | null = null;

export class MissingAgentKeyError extends Error {
  constructor() {
    super('OPENAI_API_KEY is not set — the in-app chat agent needs it for gpt-5-mini.');
    this.name = 'MissingAgentKeyError';
  }
}

/**
 * Build (or reuse) the direct-OpenAI client the agent runtime uses. Throws
 * `MissingAgentKeyError` when `OPENAI_API_KEY` is absent so the route can
 * surface a clear 503 instead of a generic SDK failure.
 */
export function getAgentOpenAIClient(): OpenAI {
  if (cachedClient) return cachedClient;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new MissingAgentKeyError();
  cachedClient = new OpenAI({ apiKey: key });
  return cachedClient;
}

/**
 * The SDK `Model` the agent runs on: `gpt-5-mini` over the direct-OpenAI
 * client. Pass the result straight into `new Agent({ model })`. Cached so
 * every turn reuses one wrapper.
 */
export function getAgentModel(): Model {
  if (cachedModel) return cachedModel;
  const client = getAgentOpenAIClient();
  cachedModel = new OpenAIChatCompletionsModel(client, AGENT_CHAT_MODEL);
  return cachedModel;
}
