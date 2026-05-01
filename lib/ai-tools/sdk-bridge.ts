/**
 * Bridge from our `ToolDefinition` shape (lib/ai-tools/types.ts) to the
 * OpenAI Agents SDK's `tool()` shape (`@openai/agents`).
 *
 * Why this file exists — Musk lens, in three sentences. We hand-rolled a
 * tool-use loop in `lib/ai-tools/loop.ts` for ~447 lines. The Python side
 * (`agent/`) uses the OpenAI Agents SDK proper. The TypeScript SDK exists,
 * we should be using it. This bridge is the wedge: the next PR cuts the
 * custom loop entirely and runs everything through `@openai/agents`.
 *
 * What lives here today:
 *   - `toSdkTool(def, ctx)` — converts one of our `ToolDefinition`s into
 *     the SDK's `FunctionTool` (zod parameters, strict, needsApproval,
 *     execute that wraps our handler and serializes our ToolResult to
 *     a model-readable string).
 *   - `runAgent({ systemPrompt, input, tools, ctx })` — thin convenience
 *     that builds an Agent and calls `run()`.
 *
 * What does NOT live here — yet:
 *   - The custom-loop's persistence/streaming/sub-agent wiring. Those
 *     stay on `loop.ts` until the cutover PR.
 *   - Rate limiting. We keep enforcement in our `executeTool` wrapper
 *     (the bridge's `execute` calls into our existing rate-limit gate
 *     so behavior is preserved across both code paths).
 *
 * Approval flow mapping:
 *   - our `requiresApproval: false`         → SDK `needsApproval: false`
 *   - our `requiresApproval: true`          → SDK `needsApproval: true`
 *   - our `requiresApproval: 'maybe'`       → SDK `needsApproval: async (...)` that
 *                                              calls our `shouldApprove(args, ctx)`
 *
 * The realtor-facing `summariseCall` is OUR concern, not the SDK's. The
 * caller of `run()` reads `result.interruptions` and renders the message
 * via the original tool definition's `summariseCall` — see
 * `summariseInterruption()` below.
 */

import { Agent, run, tool, type RunContext } from '@openai/agents';
import type { z } from 'zod';
import type { ToolContext, ToolDefinition, ToolResult } from './types';

const DEFAULT_MODEL = 'gpt-4.1-mini';

/**
 * Convert one of our tools into an SDK `FunctionTool`.
 *
 * The SDK's `execute` returns the model-visible string. We serialize our
 * structured `ToolResult` so the model still sees the `summary` (which is
 * what it actually reasons over) plus enough of `data` for follow-up
 * decisions. The UI renders `data` separately via the surrounding event
 * stream — same as today.
 */
export function toSdkTool<TArgs, TData>(def: ToolDefinition<TArgs, TData>, ctx: ToolContext) {
  const needsApproval =
    def.requiresApproval === false
      ? false
      : def.requiresApproval === 'maybe'
        ? async (_runCtx: RunContext, input: unknown) => {
            const mut = def as { shouldApprove?: (args: never, ctx: ToolContext) => boolean };
            return mut.shouldApprove ? mut.shouldApprove(input as never, ctx) : true;
          }
        : true;

  return tool({
    name: def.name,
    description: def.description,
    parameters: def.parameters as z.ZodObject<z.ZodRawShape>,
    strict: true,
    needsApproval,
    async execute(input) {
      const result: ToolResult = await def.handler(input as never, ctx);
      return serialiseResult(result);
    },
  });
}

/**
 * Format a `ToolResult` into the string the model actually reads. We keep
 * it short and deterministic so the model doesn't waste tokens parsing it.
 *   - On success: just the summary (the model rarely needs `data`; if a
 *     follow-up tool needs IDs, they came back in `data` and the loop's
 *     event stream surfaced them to the UI separately).
 *   - On error: prefix "Error: " so the model recognises the failure.
 */
function serialiseResult(result: ToolResult): string {
  if (result.display === 'error') return `Error: ${result.summary}`;
  return result.summary;
}

interface RunAgentInput {
  systemPrompt: string;
  /** Either a single user message or a full message array. */
  input: string | Parameters<typeof run>[1];
  tools: ToolDefinition[];
  ctx: ToolContext;
  /** Override the model. Defaults to `gpt-4.1-mini`. */
  model?: string;
}

/**
 * Run an SDK Agent over a single turn (or resume from `RunState`). Thin
 * wrapper — most consumers can call `new Agent({ ... })` and `run(...)`
 * directly. This exists for the cases where the bridge's tool conversion
 * is enough on its own.
 */
export async function runAgent({ systemPrompt, input, tools, ctx, model = DEFAULT_MODEL }: RunAgentInput) {
  const agent = new Agent({
    name: "Chippi",
    instructions: systemPrompt,
    tools: tools.map((t) => toSdkTool(t, ctx)),
    model,
  });
  return run(agent, input);
}

/**
 * Render a domain-specific approval prompt for an interrupted tool call.
 * The SDK gives us the tool name + raw args; the realtor sees the
 * `summariseCall` we attached on the original definition. If the tool
 * doesn't define one (read-only tools wouldn't), fall back to the name.
 */
/**
 * Narrow shape — we only need name + requiresApproval + summariseCall. The
 * `(args: never)` parameter shape is the contravariance escape hatch: it
 * lets a typed registry like `ToolDefinition<{ to: string }>[]` flow in
 * without type-system gymnastics. We cast args to never at the call site
 * because at runtime we genuinely don't know the shape until we look up
 * the tool by name — that's the whole point of an interrupt.
 */
type SummariseSource = {
  name: string;
  requiresApproval: boolean | 'maybe';
  summariseCall?: (args: never) => string;
};

export function summariseInterruption(
  toolName: string,
  args: unknown,
  registry: readonly SummariseSource[],
): string {
  const def = registry.find((t) => t.name === toolName);
  if (!def || def.requiresApproval === false || !def.summariseCall) {
    return `Run ${toolName}`;
  }
  return def.summariseCall(args as never);
}
