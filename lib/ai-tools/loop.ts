/**
 * The on-demand agent turn loop.
 *
 * One call to `runTurn` executes as many OpenAI round-trips as it takes for
 * the model to answer the user — each tool call needs a new round because
 * we feed the tool result back into the context.
 *
 *   1. Opens a streaming completion with the tools array from the registry.
 *   2. Streams text deltas directly into events + the current text block.
 *   3. Buffers any tool calls (OpenAI streams their JSON args in fragments).
 *   4. When OpenAI finishes a turn with `finish_reason === 'tool_calls'`:
 *      - For each buffered call:
 *          - Read-only: emit tool_call_start, run executeTool,
 *            emit tool_call_result, append tool message.
 *          - Mutating: emit permission_required, return paused with the
 *            messages-so-far plus the pending call — the caller stashes
 *            this state (Redis, Phase 3) and resumes via continueTurn()
 *            once the user approves.
 *   5. When `finish_reason === 'stop'`, return the accumulated blocks.
 *
 * The loop never owns the HTTP response — the route handler wires the
 * event pusher + handles SSE framing. That keeps `runTurn` unit-testable
 * with a fake pusher.
 */

import crypto from 'crypto';
import type OpenAI from 'openai';
import { logger } from '@/lib/logger';
import type { MessageBlock, TextBlock, ToolCallBlock } from './blocks';
import { executeTool, executionToModelMessage } from './execute';
import type { PushableEvent } from './events';
import { AGENT_MODEL } from './openai-client';
import { allToolsForOpenAI } from './openai-format';
import { getTool, listTools } from './registry';
import type { ToolContext } from './types';

type ChatMsg = OpenAI.Chat.Completions.ChatCompletionMessageParam;

/** Cap on model <-> tool round-trips per turn. Guards against infinite
 *  tool-loops where the model keeps asking without concluding. */
const MAX_ROUNDS = 8;

/** Parsed-args shape for a single tool call that the model issued. */
export interface DeferredToolCall {
  callId: string;
  name: string;
  args: Record<string, unknown>;
}

/**
 * State handed back to the caller when the loop pauses for user approval.
 * Phase 3 persists this to Redis keyed by `requestId`; the approval
 * endpoint feeds it (plus possibly edited args) into `continueTurn()`.
 */
export interface PendingApprovalState {
  requestId: string;
  /** The call the user must approve before the loop can continue. */
  pending: DeferredToolCall;
  /**
   * Other calls the model issued in the SAME batch that we haven't run
   * yet. Order-preserving; the resumer should process them sequentially
   * after the approved one. Empty in the common single-call case.
   */
  remainingCalls: DeferredToolCall[];
  /**
   * Messages array at pause point: system + history + user + assistant
   * with tool_calls + any completed tool-result messages. Missing the
   * tool-result for `pending` (and for `remainingCalls`) — the resumer
   * appends those as they execute.
   */
  messages: ChatMsg[];
}

export interface RunTurnInput {
  openai: OpenAI;
  ctx: ToolContext;
  /** System prompt + message history + the new user message, already built. */
  messages: ChatMsg[];
  /** Called for every AgentEvent the loop emits. Callee owns the wire. */
  pushEvent: (event: PushableEvent) => Promise<void>;
}

export interface RunTurnOutput {
  /** Ordered transcript blocks for the assistant's side of this turn. */
  blocks: MessageBlock[];
  /** What the caller should report in the `turn_complete` event. */
  reason: 'complete' | 'paused' | 'aborted';
  /** Set when `reason === 'paused'`. Caller persists this + resumes later. */
  pendingApproval?: PendingApprovalState;
}

/** One-liner describing what a mutating call would do. Used as the prompt's
 *  human-readable summary in the permission card. Delegates to each tool's
 *  `summariseCall` when defined so prompts speak the tool's domain language;
 *  a buggy summariser falls through to a safe generic line rather than
 *  tearing down the approval flow. */
function summarisePendingCall(name: string, args: Record<string, unknown>): string {
  const tool = getTool(name);
  if (tool?.summariseCall) {
    try {
      return (tool.summariseCall as (a: unknown) => string)(args);
    } catch (err) {
      logger.warn('[loop] summariseCall threw', { tool: name }, err);
    }
  }
  return `Run ${name}`;
}

// `continue-turn.ts` re-exports this so the approve path uses the same
// summaries as the initial pause.
export { summarisePendingCall };

/**
 * Execute one full turn. Pushes events as side effects; returns the
 * assembled block list plus — when a mutating tool surfaces — pending-
 * approval state for the caller to persist.
 */
export async function runTurn(input: RunTurnInput): Promise<RunTurnOutput> {
  const { openai, ctx, pushEvent } = input;
  const messages: ChatMsg[] = [...input.messages];
  const blocks: MessageBlock[] = [];
  const tools = allToolsForOpenAI(listTools());

  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (ctx.signal.aborted) return { blocks, reason: 'aborted' };

    const stream = await openai.chat.completions.create({
      model: AGENT_MODEL,
      temperature: 0.2,
      stream: true,
      messages,
      tools: tools.length > 0 ? tools : undefined,
    });

    // Per-round accumulators.
    let currentTextBlock: TextBlock | null = null;
    /** Buffered fragments for each tool call, keyed by OpenAI's `index`. */
    const toolCallBuffers = new Map<
      number,
      { id: string; name: string; argsJson: string }
    >();
    let finishReason: string | null = null;
    let assistantContent = '';

    try {
      for await (const chunk of stream) {
        if (ctx.signal.aborted) return { blocks, reason: 'aborted' };

        const choice = chunk.choices[0];
        const delta = choice?.delta;

        if (delta?.content) {
          assistantContent += delta.content;
          if (!currentTextBlock) {
            currentTextBlock = { type: 'text', content: '' };
            blocks.push(currentTextBlock);
          }
          currentTextBlock.content += delta.content;
          await pushEvent({ type: 'text_delta', delta: delta.content });
        }

        if (delta?.tool_calls) {
          // A tool-call start ends the current text run; OpenAI doesn't
          // interleave text with tool calls within one response.
          currentTextBlock = null;
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            const buf = toolCallBuffers.get(idx) ?? { id: '', name: '', argsJson: '' };
            if (tc.id) buf.id = tc.id;
            if (tc.function?.name) buf.name = tc.function.name;
            if (tc.function?.arguments) buf.argsJson += tc.function.arguments;
            toolCallBuffers.set(idx, buf);
          }
        }

        if (choice?.finish_reason) {
          finishReason = choice.finish_reason;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[tools.loop] OpenAI stream failed', { round }, err);
      await pushEvent({
        type: 'error',
        message,
        code: message.toLowerCase().includes('rate') ? 'rate_limited' : 'internal',
      });
      return { blocks, reason: 'aborted' };
    }

    // Push the assistant message reconstructed from this round into the
    // messages array so the NEXT round has the right history. Tool-calling
    // rounds include tool_calls; plain-text rounds just include content.
    if (toolCallBuffers.size > 0) {
      messages.push({
        role: 'assistant',
        content: assistantContent || null,
        tool_calls: Array.from(toolCallBuffers.values())
          .filter((b) => b.id && b.name)
          .map((b) => ({
            id: b.id,
            type: 'function' as const,
            function: { name: b.name, arguments: b.argsJson || '{}' },
          })),
      });
    } else if (assistantContent) {
      messages.push({ role: 'assistant', content: assistantContent });
    }

    // Natural stop: the model is done, return.
    if (finishReason === 'stop' || (finishReason === 'length' && toolCallBuffers.size === 0)) {
      return { blocks, reason: 'complete' };
    }

    // Tool-call round: process each buffered call. Order matters — the
    // model can request multiple tools in one response (parallel function
    // calling); we execute them sequentially so the iteration order of
    // toolCallBuffers mirrors the model's intent.
    if (toolCallBuffers.size > 0) {
      const orderedBufs = Array.from(toolCallBuffers.entries())
        .sort(([a], [b]) => a - b)
        .map(([, buf]) => buf);

      for (let i = 0; i < orderedBufs.length; i++) {
        const buf = orderedBufs[i];
        if (!buf.id || !buf.name) continue; // skip malformed entries defensively

        let args: Record<string, unknown>;
        try {
          args = JSON.parse(buf.argsJson || '{}') as Record<string, unknown>;
        } catch {
          args = {};
        }

        const tool = getTool(buf.name);

        // ── Mutating tool path: pause the loop, return paused state ──────
        if (tool?.requiresApproval === true) {
          const requestId = crypto.randomUUID();
          const callId = buf.id;
          const pendingCall: DeferredToolCall = { callId, name: buf.name, args };
          const remaining: DeferredToolCall[] = orderedBufs
            .slice(i + 1)
            .filter((b) => b.id && b.name)
            .map((b) => {
              let a: Record<string, unknown>;
              try {
                a = JSON.parse(b.argsJson || '{}') as Record<string, unknown>;
              } catch {
                a = {};
              }
              return { callId: b.id, name: b.name, args: a };
            });

          const summary = summarisePendingCall(buf.name, args);

          // Include any OTHER mutating calls in the batch so the client
          // can surface cascade-denied blocks live (not just after
          // refresh). Read-only remaining calls run without prompting
          // during the approval resume, so they don't need to be
          // enumerated here — only approval-gated ones.
          const otherPendingCalls = remaining
            .filter((c) => {
              const t = getTool(c.name);
              return t?.requiresApproval !== false;
            })
            .map((c) => ({
              callId: c.callId,
              name: c.name,
              args: c.args,
              summary: summarisePendingCall(c.name, c.args),
            }));

          await pushEvent({
            type: 'permission_required',
            requestId,
            callId,
            name: buf.name,
            args,
            summary,
            ...(otherPendingCalls.length > 0 ? { otherPendingCalls } : {}),
          });

          return {
            blocks,
            reason: 'paused',
            pendingApproval: {
              requestId,
              pending: pendingCall,
              remainingCalls: remaining,
              messages,
            },
          };
        }

        // ── Read-only tool path: execute immediately ─────────────────────
        await pushEvent({
          type: 'tool_call_start',
          callId: buf.id,
          name: buf.name,
          args,
        });

        const toolCallBlock: ToolCallBlock = {
          type: 'tool_call',
          callId: buf.id,
          name: buf.name,
          args,
          status: 'complete',
        };
        blocks.push(toolCallBlock);

        const exec = await executeTool(buf.name, args, ctx);

        if (exec.ok && exec.result) {
          toolCallBlock.result = {
            ok: true,
            summary: exec.result.summary,
            data: exec.result.data,
          };
          toolCallBlock.display = exec.result.display;
          toolCallBlock.status = 'complete';
        } else {
          toolCallBlock.result = {
            ok: false,
            summary: exec.error?.message ?? 'Tool error',
            error: exec.error?.message,
          };
          toolCallBlock.status = exec.error?.code === 'aborted' ? 'skipped' : 'error';
        }

        await pushEvent({
          type: 'tool_call_result',
          callId: buf.id,
          ok: exec.ok,
          summary: toolCallBlock.result.summary,
          data: toolCallBlock.result.data,
          error: exec.ok ? undefined : toolCallBlock.result.error,
        });

        messages.push({
          role: 'tool',
          tool_call_id: buf.id,
          content: executionToModelMessage(exec),
        });

        if (exec.error?.code === 'aborted') {
          return { blocks, reason: 'aborted' };
        }
      }
      // Continue to the next OpenAI round so the model can react to the
      // tool results.
      continue;
    }

    // No tool calls + no 'stop' finish. Unusual — surface and return.
    logger.warn('[tools.loop] unexpected end-of-stream', { finishReason, round });
    break;
  }

  return { blocks, reason: 'complete' };
}
