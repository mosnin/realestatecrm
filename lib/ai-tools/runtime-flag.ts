/**
 * Runtime flag that decides which chat backend serves a request.
 *
 * `'modal'` — the existing path. `app/api/ai/task/route.ts` proxies to the
 * Modal/Python sandbox. This is the default, and any value other than the
 * exact string `'ts'` resolves to it. A misconfigured environment must NOT
 * silently flip the chat onto an unfinished runtime.
 *
 * `'ts'` — the new in-process path built in `lib/ai-tools/sdk-chat.ts` on
 * top of `@openai/agents`. Reads the env var at call time so flips don't
 * require a redeploy — useful when we want to dark-launch the new runtime
 * for one space at a time via a side-channel switch.
 */
export type ChatRuntime = 'modal' | 'ts';

export function chatRuntime(): ChatRuntime {
  const v = process.env.CHIPPI_CHAT_RUNTIME;
  return v === 'ts' ? 'ts' : 'modal';
}
