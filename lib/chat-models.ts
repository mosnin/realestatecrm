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

export const CHAT_MODELS: ChatModelOption[] = [
  {
    id: 'openai/gpt-5.5',
    label: 'Chippi Default',
    tagline: 'GPT-5.5 — fast, balanced, the right call for almost everything.',
  },
  {
    id: 'anthropic/claude-opus-4.7',
    label: 'Claude Opus 4.7',
    tagline: 'Deepest reasoning — reach for it on long, intricate work.',
  },
  {
    id: 'x-ai/grok-4.3',
    label: 'Grok 4.3',
    tagline: 'Quick and direct, strong with fresh real-world context.',
  },
  {
    id: 'moonshotai/kimi-k2.6',
    label: 'Kimi K2.6',
    tagline: 'Long-context specialist — large documents and histories.',
  },
  {
    id: 'qwen/qwen3.6-flash',
    label: 'Qwen3.6 Flash',
    tagline: 'Fastest and lowest cost — high-volume, simple turns.',
  },
];

/** The model used when a workspace hasn't picked one. */
export const DEFAULT_CHAT_MODEL = 'openai/gpt-5.5';

/** Allowlist check — gate user-supplied model slugs before persisting. */
export function isValidChatModel(value: unknown): value is string {
  return typeof value === 'string' && CHAT_MODELS.some((m) => m.id === value);
}
