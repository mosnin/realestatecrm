/**
 * Runtime flag that selects which chat backend handles a request.
 *
 * `'ts'` — **default**. The in-process TypeScript runtime built on
 * `@openai/agents`, running on direct OpenAI gpt-5-mini (see
 * `lib/ai-tools/agent-model.ts`). This is the primary path: no Modal cold
 * start, first token arrives fast. It carries the full Chippi tool set, the
 * draft/approval gates, rate limits, tool-call logging, AND the orchestrator's
 * `delegate_task` tool — which spins deeper work out to Modal sub-agents when
 * the agent judges a task needs depth.
 *
 * `'modal'` — opt-in. Proxies the WHOLE chat turn to the Modal Python sandbox
 * (MODAL_CHAT_URL). Kept fully reachable and reversible: set
 * CHIPPI_CHAT_RUNTIME=modal to route every turn through Modal again (e.g. to
 * fall back if the in-app path has a problem, or to run heavy turns entirely
 * in the sandbox). Requires MODAL_CHAT_URL; deploy with
 * `modal deploy agent/modal_app.py`.
 *
 * Reads at call time so an env flip takes effect without a redeploy.
 */
export type ChatRuntime = 'modal' | 'ts';

export function chatRuntime(): ChatRuntime {
  const v = process.env.CHIPPI_CHAT_RUNTIME;
  return v === 'modal' ? 'modal' : 'ts';
}
