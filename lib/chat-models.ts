/**
 * Chat model registry — pure data, no SDK imports.
 *
 * Lives apart from `lib/llm.ts` so client components (the Settings model
 * picker) can import the model list without pulling the OpenAI SDK into
 * the browser bundle. Keep in sync with agent/llm.py CHAT_MODELS and the
 * price table in lib/usage/record-chat-usage.ts.
 */

export interface ChatModelOption {
  /** OpenRouter model slug — persisted in AgentSettings.chatModel. */
  id: string;
  /** Short human label shown on the picker chip. */
  label: string;
  /** One-line description of when to reach for this model. */
  tagline: string;
}

// Chippi runs on one fixed model — the user-facing picker was removed. Kept as a
// one-entry registry so isValidChatModel / resolveChatModel still validate the
// persisted AgentSettings.chatModel and fall stale picks back to the default.
// Qwen3.7 Plus is multimodal, so image turns stay on it (see VISION_FALLBACK_MODEL
// in lib/chat/multimodal.ts); the autonomous swarm uses its own worker model.
export const CHAT_MODELS: ChatModelOption[] = [
  {
    id: 'qwen/qwen3.7-plus',
    label: 'Qwen3.7 Plus',
    tagline: 'Chippi runs on Qwen3.7 Plus.',
  },
];

/** The model used for chat. */
export const DEFAULT_CHAT_MODEL = 'qwen/qwen3.7-plus';

/** Allowlist check — gate user-supplied model slugs before persisting. */
export function isValidChatModel(value: unknown): value is string {
  return typeof value === 'string' && CHAT_MODELS.some((m) => m.id === value);
}
