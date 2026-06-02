/**
 * Runtime flag that selects which chat backend handles a request.
 *
 * `'modal'` — **default**. Proxies the whole chat turn to the Modal Python
 * sandbox (MODAL_CHAT_URL), which runs gpt-5-mini. This is the known-good path.
 *
 * `'ts'` — opt-in (CHIPPI_CHAT_RUNTIME=ts). The in-process TypeScript runtime
 * on `@openai/agents` + direct OpenAI gpt-5-mini (no Modal cold start, fast
 * first token) with the full tool set, approval gates, and the `delegate_task`
 * orchestrator. TEMPORARILY NOT the default: in production it hangs the turn
 * until the function times out (no thrown error, so nothing in the logs). Kept
 * reachable behind the flag so the hang can be diagnosed and re-enabled without
 * blocking chat for everyone.
 *
 * Reads at call time so an env flip takes effect without a redeploy.
 */
export type ChatRuntime = 'modal' | 'ts';

export function chatRuntime(): ChatRuntime {
  const v = process.env.CHIPPI_CHAT_RUNTIME;
  return v === 'ts' ? 'ts' : 'modal';
}
