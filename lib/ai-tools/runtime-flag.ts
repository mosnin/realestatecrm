/**
 * Runtime flag that decides which chat backend serves a request.
 *
 * `'ts'` — the in-process path in `lib/ai-tools/sdk-chat.ts` built on
 * `@openai/agents`. **Default** as of the cutover.
 *
 * `'modal'` — the legacy path that proxied to a Python sandbox. The proxy
 * code itself was removed in the cutover commit; this value is kept for
 * one cycle so a deploy-time emergency flip can opt back into the legacy
 * path *if* we ever revert the route. After one cycle of stability, this
 * flag becomes vestigial and the file goes too.
 *
 * Reads at call time so flips don't require a redeploy.
 */
export type ChatRuntime = 'modal' | 'ts';

export function chatRuntime(): ChatRuntime {
  const v = process.env.CHIPPI_CHAT_RUNTIME;
  return v === 'modal' ? 'modal' : 'ts';
}
