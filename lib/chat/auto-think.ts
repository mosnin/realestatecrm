/**
 * Auto-think — adaptive reasoning effort for chat turns.
 *
 * A 2026 agent doesn't run at one fixed depth: it spends thinking tokens
 * where the turn needs them and none where it doesn't. This module is the
 * TS twin of `agent/llm.py:decide_reasoning_effort` (keep the signal lists
 * in sync) and the single place the TS paths decide, per turn:
 *
 *   1. how hard to think — `decideReasoningEffort()`, a deterministic
 *      zero-latency heuristic over the user message (no extra LLM call);
 *   2. whether the active model can think at all — `supportsReasoning()`;
 *   3. the request-body shape that turns thinking on — `reasoningBodyParams()`,
 *      OpenRouter's unified `reasoning` extension on chat completions.
 *
 * Surfaces differ in their floor, not their ceiling:
 *   - the DIRECT path (Q&A, no tools) is Fast mode and floors at 'none' — a phone-number
 *     lookup must keep its sub-second time-to-first-token;
 *   - the AGENT/Work path floors at 'low' — acting
 *     turns always get some deliberation, matching the Modal/Python agent.
 *
 * Reasoning deltas stream to the client as `reasoning_delta` events, so an
 * engaged thinking phase reads as a live trace, never a silent gap
 * (product non-negotiable #1).
 */

export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high';

/**
 * Lowercased signals that lift a turn to 'medium' — phrases implying the
 * realtor wants the model to STRUCTURE its thinking, not just answer.
 * Ported verbatim from `agent/llm.py:_PLANNING_SIGNALS`; additions cost
 * reasoning tokens on every matching turn, so new entries should buy
 * demonstrable quality. Trailing spaces are meaningful ("audit " avoids
 * "audited").
 */
const PLANNING_SIGNALS = [
  'build a plan',
  'build me a plan',
  'make a plan',
  'make me a plan',
  'create a plan',
  'plan out',
  'plan this',
  'step by step',
  'step-by-step',
  'walk me through',
  'think through',
  'research ',
  'deep research',
  'investigate',
  'audit ',
  'compare ',
  'analyze ',
  'analyse ',
  'evaluate ',
  'assess ',
  'diagnose',
  'root cause',
  'strategy for',
  'should i ',
] as const;

/**
 * Signals that lift a turn to 'high' — the realtor explicitly asked for
 * depth, or the ask is the kind of structuring work (negotiation, deal
 * math, exhaustive review) where shallow answers are visibly wrong.
 * Mirrored in `agent/llm.py:_DEEP_SIGNALS`.
 */
const DEEP_SIGNALS = [
  'think hard',
  'think deeply',
  'think carefully',
  'think really',
  'deep dive',
  'deep research',
  'comprehensive',
  'exhaustive',
  'thorough',
  'root cause',
  'negotiation strategy',
  'negotiate ',
  'counter-offer strategy',
  'structure the deal',
  'structure this deal',
] as const;

const VALID_EFFORTS: ReadonlyArray<string> = ['low', 'medium', 'high'];

/**
 * Decide this turn's reasoning effort from the user message.
 *
 * `surface` sets the floor: 'agent' turns never go below 'low' (they act —
 * plans, tools, multi-step), 'direct' turns default to 'none' so trivial
 * Q&A keeps today's latency exactly.
 *
 * The env var CHIPPI_REASONING_EFFORT ('low'|'medium'|'high') overrides the
 * heuristic — same escape hatch, same semantics as the Python agent (cost
 * emergency → force 'low'; demo → force 'high'). Invalid values fall
 * through silently so a typo can't break every turn.
 */
export function decideReasoningEffort(
  userMessage: string | null | undefined,
  opts: { surface: 'direct' | 'agent' },
): ReasoningEffort {
  const override = (process.env.CHIPPI_REASONING_EFFORT || '').trim().toLowerCase();
  if (VALID_EFFORTS.includes(override)) return override as ReasoningEffort;

  const floor: ReasoningEffort = opts.surface === 'agent' ? 'low' : 'none';
  if (!userMessage) return floor;
  const text = userMessage.toLowerCase();

  for (const signal of DEEP_SIGNALS) {
    if (text.includes(signal)) return 'high';
  }
  // Several distinct questions in one message is multi-part synthesis work
  // even without a keyword — "Which of these three should I push? What's
  // the risk on each? Who do I call first?".
  const questionMarks = (text.match(/\?/g) || []).length;
  for (const signal of PLANNING_SIGNALS) {
    if (text.includes(signal)) return questionMarks >= 3 ? 'high' : 'medium';
  }
  if (questionMarks >= 3) return 'medium';
  return floor;
}

/**
 * Model families where OpenRouter honors the unified `reasoning` request
 * extension on chat completions. Conservative allowlist: an entry here
 * means "this family thinks when asked" — everything else gets no
 * reasoning field at all, which is exactly today's request shape (a model
 * that can't think is never sent a param it might reject).
 */
export function supportsReasoning(model: string | null | undefined): boolean {
  const m = (model || '').toLowerCase();
  if (!m) return false;
  return (
    m.startsWith('qwen/qwen3') || // hybrid thinking — the Chippi default
    m.startsWith('anthropic/') || // extended thinking (3.7+ / 4 / 5)
    m.startsWith('openai/gpt-5') ||
    m.startsWith('openai/o') || // o1 / o3 / o4 families
    m.startsWith('x-ai/grok-4') ||
    m.startsWith('deepseek/deepseek-r') ||
    m.startsWith('google/gemini-2.5') ||
    m.startsWith('google/gemini-3') ||
    m.startsWith('z-ai/glm-4.5') ||
    m.startsWith('z-ai/glm-5') ||
    m.includes('thinking') // e.g. moonshotai/kimi-k2-thinking
  );
}

/**
 * The request-body fields that control thinking for this call — OpenRouter's
 * unified `reasoning` parameter (normalized per provider: effort→budget for
 * Anthropic/Gemini/Qwen, `reasoning_effort` for OpenAI, etc.).
 *
 * For a reasoning-capable model this ALWAYS returns an explicit state:
 * `{ effort }` to think, `{ enabled: false }` to not. The off state matters
 * as much as the on state — hybrid models (Qwen3 family, Chippi's default)
 * think BY DEFAULT when the request says nothing, and on the direct path's
 * tight completion cap that default can spend the entire token budget on
 * thinking and return an EMPTY visible answer (the "agent doesn't respond"
 * failure). Deterministic beats provider-default.
 *
 * Empty object only when the model can't think at all, or OpenRouter isn't
 * the active provider (the OpenAI-direct fallback model would reject the
 * unknown param — same gating idiom as `usageAccountingParams()`). Spread
 * the result into `chat.completions.create` bodies.
 */
export function reasoningBodyParams(
  model: string | null | undefined,
  effort: ReasoningEffort,
): { reasoning?: { effort: 'low' | 'medium' | 'high' } | { enabled: false } } {
  if (!process.env.OPENROUTER_API_KEY) return {};
  if (!supportsReasoning(model)) return {};
  if (effort === 'none') return { reasoning: { enabled: false } };
  return { reasoning: { effort } };
}
