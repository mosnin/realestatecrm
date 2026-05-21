/**
 * recordChatUsage — write one ChatUsage row per completed chat turn.
 *
 * Called by the TS chat runtime (sdk-chat-stream.ts). The Modal runtime
 * has its own equivalent insert in agent/modal_app.py — both target the
 * same table. Fire-and-forget at the call site: a telemetry write must
 * never block or fail a chat turn.
 *
 * Cost is derived here from CHAT_MODEL_PRICES so the Usage page can SUM a
 * precomputed `costUsd` column instead of re-deriving at query time.
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

/**
 * USD per 1M tokens. Mirrors agent/ledger.py MODEL_PRICES and the table in
 * lib/usage/queries.ts. Keep the three in sync when prices change.
 * Covers both bare OpenAI slugs and OpenRouter-style slugs so whichever
 * the runtime reports resolves cleanly.
 */
const CHAT_MODEL_PRICES: Record<string, { in: number; out: number }> = {
  'gpt-5-mini': { in: 0.75, out: 4.5 },
  'gpt-5.4-mini': { in: 0.75, out: 4.5 },
  'gpt-4.1-mini': { in: 0.4, out: 1.6 },
  'gpt-4o': { in: 2.5, out: 10.0 },
  'gpt-4.1': { in: 2.0, out: 8.0 },
  'gpt-4o-mini': { in: 0.15, out: 0.6 },
  'openai/gpt-5.5': { in: 5.0, out: 30.0 },
  'x-ai/grok-4.3': { in: 1.25, out: 2.5 },
  'anthropic/claude-opus-4.7': { in: 5.0, out: 25.0 },
  'moonshotai/kimi-k2.6': { in: 0.73, out: 3.49 },
  'qwen/qwen3.6-flash': { in: 0.19, out: 1.13 },
};
const DEFAULT_PRICE = { in: 2.5, out: 10.0 };

/** Derive the USD cost of a turn from its token counts. */
export function chatTurnCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const p = CHAT_MODEL_PRICES[model] ?? DEFAULT_PRICE;
  const cost =
    (promptTokens / 1_000_000) * p.in + (completionTokens / 1_000_000) * p.out;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export interface RecordChatUsageInput {
  spaceId: string;
  userId?: string | null;
  conversationId?: string | null;
  model: string;
  promptTokens: number;
  completionTokens: number;
  runtime: 'modal' | 'ts';
}

/**
 * Insert one ChatUsage row. Never throws — logs and swallows. Token counts
 * of 0/0 are skipped (a paused turn with no model call isn't billable
 * usage and would just be noise on the Usage page).
 */
export async function recordChatUsage(input: RecordChatUsageInput): Promise<void> {
  const promptTokens = Math.max(0, Math.round(input.promptTokens || 0));
  const completionTokens = Math.max(0, Math.round(input.completionTokens || 0));
  if (promptTokens === 0 && completionTokens === 0) return;

  const costUsd = chatTurnCost(input.model, promptTokens, completionTokens);

  try {
    const { error } = await supabase.from('ChatUsage').insert({
      spaceId: input.spaceId,
      userId: input.userId ?? null,
      conversationId: input.conversationId ?? null,
      model: input.model,
      promptTokens,
      completionTokens,
      costUsd,
      runtime: input.runtime,
    });
    if (error) {
      logger.warn('[usage] ChatUsage insert failed', { spaceId: input.spaceId }, error);
    }
  } catch (err) {
    logger.warn('[usage] ChatUsage insert threw', { spaceId: input.spaceId }, err as Error);
  }
}
