/**
 * Agent-scoped model wrapper for the in-process chat runtime.
 *
 * The interactive chat agent runs on the SAME provider the rest of the app
 * uses — `getLLMClient()` from `lib/llm.ts`, which is OpenRouter-first and
 * falls back to OpenAI direct. This is the fix for the keystone failure mode:
 * the old version hardcoded `gpt-5-mini` on the OpenAI **Responses API** with
 * a direct-OpenAI client, so every chat turn on an OpenRouter-only deploy
 * threw `MissingAgentKeyError` before a single token streamed — and even with
 * an OpenAI key, the realtor's chosen model (`x-ai/grok-4.3`) was ignored.
 *
 * Now:
 *   - One client, the app-wide `getLLMClient()` (OpenRouter or OpenAI).
 *   - The realtor's workspace model, resolved through `resolveChatModel()` so
 *     a provider/model mismatch is structurally impossible.
 *   - `OpenAIChatCompletionsModel` (chat completions), NOT the Responses API.
 *     Chat completions streams reliably across every OpenRouter provider
 *     (Grok, Claude, Gemini, GPT) and never wedges on a reasoning-model
 *     `max_output_tokens` mismatch — the prior hang.
 *
 * We hand the SDK an `OpenAIChatCompletionsModel` built against our own client
 * rather than mutating the SDK's global default client. Local instance = no
 * cross-request bleed, no global state, fully reversible.
 */

import { OpenAIChatCompletionsModel } from '@openai/agents';
import type { Model } from '@openai/agents';
import { getLLMClient, resolveChatModel } from '@/lib/llm';

/**
 * Cache one Model wrapper per resolved model slug. The OpenAI client is
 * stateless per-request and safe to share; rebuilding the wrapper per turn
 * would re-pay client setup for no benefit. Keyed by slug so a workspace that
 * switches models (or a deploy that flips provider) gets a fresh wrapper
 * instead of a stale one.
 */
const cache = new Map<string, Model>();

/**
 * The SDK `Model` the agent runs on: the realtor's workspace model (resolved
 * to something the active provider can actually serve) over the app-wide LLM
 * client, via chat completions.
 *
 * @param modelSlug The workspace's configured chat model. When omitted, the
 *   default chat model is used. Always passed through `resolveChatModel()`.
 */
type LlmClient = ReturnType<typeof getLLMClient>;

/**
 * Providers that honor explicit `cache_control` on OpenRouter. Anthropic and
 * Google Gemini accept the Anthropic-shape ephemeral marker; OpenAI auto-caches
 * stable prefixes with NO marker; xAI/Grok and the rest have no caching path.
 * Mirrors `agent/llm.py:_CACHE_MARKER_PROVIDERS`.
 */
export function isCacheCapable(modelSlug: string): boolean {
  const m = (modelSlug || '').toLowerCase();
  return m.startsWith('anthropic/') || m.startsWith('google/') || m.includes('claude') || m.includes('gemini');
}

/**
 * Mutate an outgoing chat-completions body so the static prefix (system prompt
 * + tool list) is marked cacheable. One marker on the system message and one on
 * the last tool cover the whole prefix; the provider then bills the repeated
 * prefix at a deep discount on every turn after the first. Idempotent. Ported
 * from `agent/llm.py:_apply_cache_markers`.
 */
export function applyCacheMarkers(body: { messages?: unknown; tools?: unknown } | undefined): void {
  if (!body) return;
  const marker = { type: 'ephemeral' as const };
  const messages = body.messages;
  if (Array.isArray(messages)) {
    for (const msg of messages as Array<Record<string, unknown>>) {
      if (msg && msg.role === 'system' && typeof msg.content === 'string') {
        msg.content = [{ type: 'text', text: msg.content, cache_control: marker }];
        break; // one system message; first hit wins
      }
    }
  }
  const tools = body.tools;
  if (Array.isArray(tools) && tools.length > 0) {
    const last = tools[tools.length - 1] as Record<string, unknown>;
    if (last && typeof last === 'object' && !('cache_control' in last)) {
      last.cache_control = marker;
    }
  }
}

/**
 * Wrap the LLM client so `chat.completions.create` injects cache markers on the
 * way out — the SDK builds the messages/tools inline, so we intercept the one
 * call it makes rather than copy its converter. Only used for cache-capable
 * providers; everyone else gets the plain client. Mirrors the Python
 * `_CacheMarkerClient` proxy.
 */
function withCacheMarkers(client: LlmClient): LlmClient {
  const chat = (client as unknown as { chat: { completions: { create: (...a: unknown[]) => unknown } } }).chat;
  const completions = chat.completions;
  const origCreate = completions.create.bind(completions);
  const wrappedCompletions = new Proxy(completions, {
    get(target, prop, recv) {
      if (prop === 'create') {
        return (...args: unknown[]) => {
          applyCacheMarkers(args[0] as { messages?: unknown; tools?: unknown });
          return origCreate(...args);
        };
      }
      return Reflect.get(target, prop, recv);
    },
  });
  const wrappedChat = new Proxy(chat, {
    get(target, prop, recv) {
      if (prop === 'completions') return wrappedCompletions;
      return Reflect.get(target, prop, recv);
    },
  });
  return new Proxy(client as object, {
    get(target, prop, recv) {
      if (prop === 'chat') return wrappedChat;
      return Reflect.get(target, prop, recv);
    },
  }) as LlmClient;
}

export function getAgentModel(modelSlug?: string | null): Model {
  const resolved = resolveChatModel(modelSlug);
  const cached = cache.get(resolved);
  if (cached) return cached;
  // Prompt caching (token redesign L4): wrap the client to mark the static
  // prefix cacheable for providers that honor it (Anthropic / Gemini). For the
  // Grok default and OpenAI (which auto-caches) this is a strict no-op — the
  // plain client, unchanged — so it can't affect the current model.
  const client = isCacheCapable(resolved) ? withCacheMarkers(getLLMClient()) : getLLMClient();
  const model = new OpenAIChatCompletionsModel(client, resolved);
  cache.set(resolved, model);
  return model;
}
