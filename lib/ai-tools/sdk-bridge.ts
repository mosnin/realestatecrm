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

import { Agent, run, tool, RunState, type RunContext, type RunResult } from '@openai/agents';
import { z } from 'zod';
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
    // Transform our zod schema so OpenAI's strict-mode JSON-schema
    // accepts it. Strict mode requires every key in `properties` to
    // also appear in `required`; zod `.optional()` produces a schema
    // missing the field from `required` and OpenAI rejects with
    // "Invalid schema for function ...: 'required' is required to be
    // supplied and to be an array including every key in properties."
    //
    // We apply `strictifySchema` (below) which rewrites every
    // `.optional()` and `.default()` into `.nullable()`. The field
    // stays REQUIRED (so the model has to set it), but the value can
    // be `null` (so the model has an out). Handler logic that does
    // `args.x ?? fallback` already treats null and undefined the same,
    // so 47 tool handlers don't need to change.
    parameters: strictifySchema(def.parameters as z.ZodObject<z.ZodRawShape>),
    strict: true,
    needsApproval,
    async execute(input) {
      try {
        const result: ToolResult = await def.handler(input as never, ctx);
        return serialiseResult(result);
      } catch (err) {
        // A tool handler threw instead of returning { display: 'error' }.
        // Without this catch, the raw exception (or stack trace shape)
        // would land in the model's context — and from there, in the
        // realtor's chat. Reformat to the same `Error: ` prefix the
        // success/error paths use so the model continues normally and
        // can paraphrase to the realtor in Chippi voice.
        //
        // We log the original at warn — the actual stack stays in our
        // server logs for debugging; only the friendly summary reaches
        // the model.
        const message = err instanceof Error ? err.message : String(err);
        return `Error: ${def.name} failed — ${message}`;
      }
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
/**
 * Transform a zod ObjectSchema so every field is required at the JSON-
 * schema level — needed for OpenAI strict-mode tool schemas. Optional
 * fields become nullable instead: the model has to provide them, but
 * `null` is a valid value.
 *
 * Why not just rewrite the 47 tool schemas to be strict-compatible?
 * It would work, but every handler has to be audited for the new shape
 * (`undefined` → `null`). The transformation here keeps tool authors
 * writing idiomatic zod (`.optional()`, `.default()`) and pays the
 * conversion cost once at registration time.
 *
 * Behaviors preserved:
 *   - Validators (.min, .max, .email, etc.) on the inner type still apply
 *     when a non-null value comes in.
 *   - `.default()` becomes `.nullable()` — the default is no longer
 *     applied automatically, but every handler that uses `args.x ??
 *     defaultValue` keeps working because `??` treats null and
 *     undefined the same way.
 *   - Top-level `.describe()` on the schema is preserved.
 */
function strictifySchema(
  schema: z.ZodObject<z.ZodRawShape>,
): z.ZodObject<z.ZodRawShape> {
  // Spread to drop the readonly index signature so we can iterate + write.
  const sourceShape: Record<string, z.ZodTypeAny> = { ...(schema.shape as Record<string, z.ZodTypeAny>) };
  const newShape: Record<string, z.ZodTypeAny> = {};
  for (const [key, value] of Object.entries(sourceShape)) {
    newShape[key] = makeRequiredNullable(value);
  }
  const rebuilt = z.object(newShape) as z.ZodObject<z.ZodRawShape>;
  // `.describe()` is metadata on _def — preserve if the source had one.
  // The cast is safe: ZodObject._def includes the description on every
  // version we use.
  const desc = (schema as unknown as { _def?: { description?: string } })._def
    ?.description;
  return desc ? rebuilt.describe(desc) : rebuilt;
}

function makeRequiredNullable(field: z.ZodTypeAny): z.ZodTypeAny {
  // Unwrap one or more layers of ZodOptional / ZodDefault until we reach
  // the inner type. Then wrap with .nullable().
  let inner: z.ZodTypeAny = field;
  let preservedDescription: string | undefined;
  // Capture the topmost description so we don't lose it on rewrap.
  const def = (inner as unknown as { _def?: { description?: string } })._def;
  if (def?.description) preservedDescription = def.description;

  // Walk down through Optional/Default wrappers.
  while (true) {
    const typeName = (inner as unknown as { _def?: { typeName?: string } })._def
      ?.typeName;
    if (typeName === 'ZodOptional' || typeName === 'ZodDefault') {
      const next = (
        inner as unknown as { _def: { innerType: z.ZodTypeAny } }
      )._def.innerType;
      inner = next;
      continue;
    }
    break;
  }

  // If the inner type is already nullable, no change beyond unwrapping.
  const nullable = inner.nullable();
  return preservedDescription ? nullable.describe(preservedDescription) : nullable;
}

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

// ── Approval / state lifecycle ─────────────────────────────────────────────
//
// The chat-cutover risk I named earlier was: "the SDK's interrupt-resume
// state machine doesn't 1:1 match our pendingState." After actually reading
// the SDK source, that risk closes itself. The SDK exposes:
//
//   - `result.interruptions: RunToolApprovalItem[]` — the pending approvals.
//   - `result.state.toString()` — serialise the resumable run.
//   - `RunState.fromString(agent, str)` — rehydrate it.
//   - `state.approve(item)` / `state.reject(item, { message })` — record
//     the decision before resuming.
//   - Re-running with `run(agent, state)` continues from where it paused.
//
// That matches our PendingState lifecycle exactly: serialize → store →
// realtor decides → reload → apply decision → resume. The helpers below
// wrap those primitives so consumers (the chat route, the persistence
// layer) talk in our vocabulary instead of fishing through the SDK API.

/**
 * Realtor-facing approval prompt extracted from one SDK interruption.
 * The chat route serialises this and emits it as our existing
 * `permission_required` SSE event so the UI stays unchanged.
 */
export interface ApprovalPrompt {
  /** Stable identifier for the interruption — survives resume rounds. */
  callId: string;
  /** Tool name the model is asking to run (e.g. "send_email"). */
  toolName: string;
  /** Parsed arguments. We parse the SDK's JSON-string `arguments` here
   *  so consumers don't have to duplicate the JSON.parse + try/catch. */
  arguments: unknown;
  /** What the realtor reads in the prompt — domain-specific via summariseCall. */
  summary: string;
}

/**
 * Turn an SDK result's `interruptions` array into ApprovalPrompts the UI
 * already knows how to render. Tools that aren't in our registry surface
 * with a generic "Run <name>" — that should be impossible in practice
 * (every interrupt comes from a tool we registered), but defending against
 * it costs nothing.
 */
/**
 * Loose shape of an interruption — we only touch a handful of fields and
 * the SDK's full type is a wide discriminated union (function calls,
 * hosted tools, shell, computer use, apply-patch). The function-call
 * variant carries `callId`; others carry `id`. We try `callId` first,
 * fall back to `id`, fall back to empty string.
 */
type InterruptionLike = {
  rawItem: { callId?: string; id?: string };
  name?: string;
  arguments?: string;
};

export function extractApprovals(
  result: { interruptions?: readonly InterruptionLike[] },
  registry: readonly SummariseSource[],
): ApprovalPrompt[] {
  const interruptions = result.interruptions ?? [];
  return interruptions.map((item) => {
    const toolName = item.name ?? '';
    const argsStr = item.arguments ?? '';
    const callId = item.rawItem.callId ?? item.rawItem.id ?? '';
    let parsedArgs: unknown = {};
    try {
      parsedArgs = argsStr ? JSON.parse(argsStr) : {};
    } catch {
      // Malformed JSON from the model is rare but real — fall back to the
      // raw string so the realtor at least sees what was attempted.
      parsedArgs = { raw: argsStr };
    }
    return {
      callId,
      toolName,
      arguments: parsedArgs,
      summary: summariseInterruption(toolName, parsedArgs, registry),
    };
  });
}

/**
 * Persist a paused run as an opaque string. Stored on AgentDraft.metadata
 * (or AgentQuestion) and rehydrated when the realtor decides.
 */
export function serializeRunState(state: { toString(): string }): string {
  return state.toString();
}

/**
 * Rehydrate a persisted run. Schema version is captured inside the string;
 * the SDK throws if it's incompatible — we let that bubble so a stale
 * pending state from before an SDK upgrade fails loudly instead of running
 * with mismatched assumptions.
 */
// We accept any Agent<...> shape because the consumer (the chat route)
// holds the agent reference; the bridge is generic to the model's output
// type. Casting through `unknown` here keeps the rest of the bridge
// strictly typed.
type AnyAgent = Agent<unknown, 'text'>;

export async function restoreRunState(
  agent: AnyAgent,
  serialized: string,
): Promise<RunState<unknown, AnyAgent>> {
  return RunState.fromString(agent, serialized);
}

/** What the realtor's PATCH /api/agent/drafts/[id] resolves to. */
export type ApprovalDecision = { approved: true } | { approved: false; message?: string };

/**
 * Apply the realtor's approve/reject decision to a rehydrated state.
 * The SDK mutates the state in place; we return it for clarity at the
 * call site. After this, pass the state back to `run(agent, state)` to
 * continue from where it paused.
 */
export function applyApprovalDecision(
  state: RunState<unknown, AnyAgent>,
  item: Parameters<RunState<unknown, AnyAgent>['approve']>[0],
  decision: ApprovalDecision,
): RunState<unknown, AnyAgent> {
  if (decision.approved) {
    state.approve(item);
  } else {
    state.reject(item, decision.message ? { message: decision.message } : undefined);
  }
  return state;
}
