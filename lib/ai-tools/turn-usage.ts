/**
 * Sum token + exact-cost usage from an Agents SDK streamed result.
 *
 * Shared by the parent chat pump and the isolated specialist so every
 * in-process model call can land on ChatUsage with the same shape.
 */

export interface SdkUsageLike {
  inputTokens?: number;
  outputTokens?: number;
  inputTokensDetails?: Record<string, number> | Array<Record<string, number>>;
  /** OpenRouter exact request cost when usage accounting is on. */
  cost?: number;
  costUsd?: number;
}

export interface SdkResultUsageLike {
  rawResponses?: ReadonlyArray<{ usage?: SdkUsageLike }>;
}

export interface SummedTurnUsage {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  costUsd?: number;
}

/** Sum token usage across every model call in the turn. Returns zeros when
 *  the provider didn't report usage (recordChatUsage no-ops on all-zero, so
 *  this is safe to call unconditionally). Reads the cached-input count from
 *  inputTokensDetails in either the object or array shape the SDK uses. */
export function sumSdkTurnUsage(result: SdkResultUsageLike): SummedTurnUsage {
  let promptTokens = 0;
  let completionTokens = 0;
  let cachedTokens = 0;
  let costUsd: number | undefined;
  for (const r of result.rawResponses ?? []) {
    const u = r?.usage;
    if (!u) continue;
    promptTokens += u.inputTokens ?? 0;
    completionTokens += u.outputTokens ?? 0;
    const d = u.inputTokensDetails;
    const details = Array.isArray(d) ? d : d ? [d] : [];
    for (const entry of details) {
      cachedTokens +=
        Number(entry?.cached_tokens ?? entry?.cachedTokens ?? 0) || 0;
    }
    const cost = u.cost ?? u.costUsd;
    if (typeof cost === 'number' && Number.isFinite(cost) && cost >= 0) {
      costUsd = (costUsd ?? 0) + cost;
    }
  }
  return { promptTokens, completionTokens, cachedTokens, costUsd };
}
