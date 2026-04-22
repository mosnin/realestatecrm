/**
 * Type definitions for the on-demand agent's tool-use loop.
 *
 * A tool is:
 *   - named (short snake_case, surfaced to the model)
 *   - described (helps the model choose)
 *   - zod-validated on its arguments (both for the model's safety AND ours)
 *   - either auto-running (read-only) or permission-gated (mutations)
 *   - executed with a ToolContext that carries the caller's identity + space
 *
 * Read-only tools run immediately inside the loop. Mutating tools emit a
 * `permission_required` SSE event and pause until the user approves — see
 * lib/ai-tools/events.ts and phase 3.
 *
 * Tools return a `ToolResult` — a content payload plus optional metadata the
 * UI can render (a contact card, a deal preview, etc.). The content is what
 * goes back into the model's context; the metadata is a hint for the
 * block-renderer so we don't have to re-query to show something.
 */

import type { z } from 'zod';

// ── Context the loop passes to every handler ──────────────────────────────

/**
 * Passed into every tool handler. `space` is pre-resolved so the handler
 * doesn't need to do its own auth check — the loop resolves the caller's
 * space once per turn and uses it for all tool calls in that turn.
 */
export interface ToolContext {
  /** Clerk userId of the caller. */
  userId: string;
  /** The Chippi space the caller owns (or manages via broker role). */
  space: {
    id: string;
    slug: string;
    name: string;
    ownerId: string;
  };
  /** The AbortSignal for the current turn — handlers should respect it. */
  signal: AbortSignal;
}

// ── Tool result ───────────────────────────────────────────────────────────

/**
 * The model-facing result. `summary` is what the model sees; `data` is
 * structured output the UI can render without re-querying. `display` is a
 * hint for how to render the tool-call block ("contacts" → a small
 * contact-list card, etc.).
 */
export interface ToolResult<TData = unknown> {
  summary: string;
  data?: TData;
  /**
   * How the block renderer should tint this result.
   *
   * - `success`  → green: the mutation landed cleanly.
   * - `error`    → red:   the handler failed (but turn is still alive).
   * - `warning`  → amber: the tool finished but with an important caveat
   *                       (e.g. a sub-agent hit its tool budget and only
   *                       returned a partial summary — the orchestrator
   *                       shouldn't silently act on it).
   * - `contacts` / `deals` / `tours` / `notes` / `plain` — future-facing
   *   hints for rich inline cards. Currently unstyled beyond neutral.
   */
  display?: 'contacts' | 'deals' | 'tours' | 'notes' | 'plain' | 'success' | 'error' | 'warning';
}

// ── Tool definition ────────────────────────────────────────────────────────

export type ToolHandler<TArgs = unknown, TData = unknown> = (
  args: TArgs,
  ctx: ToolContext,
) => Promise<ToolResult<TData>>;

export interface ToolDefinition<
  // We'd love `TSchema extends z.ZodTypeAny` + inferred arg types, but the
  // registry stores tools as a heterogeneous Record<string, ToolDefinition>
  // and narrowing per-entry is not worth the type gymnastics. Callers cast
  // args inside their handlers.
  TArgs = unknown,
  TData = unknown,
> {
  /** Snake_case; exposed to the model. Must be unique across the registry. */
  name: string;
  /** One-sentence description for the model. */
  description: string;
  /** Zod schema for the arguments object. Runtime-validated before the handler runs. */
  parameters: z.ZodType<TArgs>;
  /**
   * `false` → auto-run (read-only).
   * `true`  → pause and prompt the user before executing.
   * `'maybe'` → inspect args before deciding (e.g. a batch tool where >10
   *             recipients should prompt but 1 can auto-run).
   */
  requiresApproval: boolean | 'maybe';
  /** Optional finer-grained approval resolver for the 'maybe' case. */
  shouldApprove?: (args: TArgs, ctx: ToolContext) => boolean;
  /**
   * One-line "what will happen if you approve?" summary. Rendered in the
   * PermissionPromptView. Per-tool override so each tool can speak in
   * domain-specific terms ("Email jane@x — subject: Tour Friday") instead
   * of a generic fallback ("Run send_email"). Called with the validated
   * args — it's safe to read any schema field here.
   */
  summariseCall?: (args: TArgs) => string;
  /**
   * Per-user rate limit for this tool. Checked by executeTool BEFORE the
   * handler runs. Enforces a tighter blast-radius cap than the
   * per-conversation limit on the /api/ai/task route — that route bounds
   * turns/hour, this bounds specific tool firings.
   */
  rateLimit?: { max: number; windowSeconds: number };
  /** The actual work. Must respect ctx.signal for cancellation. */
  handler: ToolHandler<TArgs, TData>;
}

// ── Convenience builders ───────────────────────────────────────────────────

/**
 * Factory that preserves argument typing inside the handler so callers don't
 * have to annotate `args` themselves. Each tool file calls `defineTool` and
 * exports the returned definition.
 */
export function defineTool<TSchema extends z.ZodType, TData = unknown>(def: {
  name: string;
  description: string;
  parameters: TSchema;
  requiresApproval: boolean | 'maybe';
  shouldApprove?: (args: z.infer<TSchema>, ctx: ToolContext) => boolean;
  summariseCall?: (args: z.infer<TSchema>) => string;
  rateLimit?: { max: number; windowSeconds: number };
  handler: (args: z.infer<TSchema>, ctx: ToolContext) => Promise<ToolResult<TData>>;
}): ToolDefinition<z.infer<TSchema>, TData> {
  return def as ToolDefinition<z.infer<TSchema>, TData>;
}
