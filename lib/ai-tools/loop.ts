/**
 * The on-demand agent turn loop.
 *
 * One call to `runTurn` executes as many OpenAI round-trips as it takes for
 * the model to answer the user — each tool call needs a new round because
 * we feed the tool result back into the context. The loop:
 *
 *   1. Opens a streaming completion with the tools array from the registry.
 *   2. Streams text deltas directly into events + the current text block.
 *   3. Buffers any tool calls (OpenAI streams their JSON args in fragments).
 *   4. When OpenAI finishes a turn with `finish_reason === 'tool_calls'`:
 *      - For each buffered call, emit `tool_call_start`, run `executeTool`,
 *        emit `tool_call_result`, append the tool result message, and
 *        continue to the next round.
 *   5. When `finish_reason === 'stop'`, return the accumulated blocks.
 *
 * The loop never owns the HTTP response — the route handler wires the
 * event pusher + handles SSE framing. That keeps `runTurn` unit-testable
 * with a fake pusher.
 *
 * Phase 3 will teach this loop to emit `permission_required` and pause for
 * mutating tools; today every registered tool is read-only, so we fast-path
 * straight into `executeTool`.
 */

import type OpenAI from 'openai';
import { logger } from '@/lib/logger';
import type { MessageBlock, TextBlock, ToolCallBlock } from './blocks';
import { executeTool, executionToModelMessage } from './execute';
import type { AgentEvent } from './events';
import { AGENT_MODEL } from './openai-client';
import { allToolsForOpenAI } from './openai-format';
import { getTool, listTools } from './registry';
import type { ToolContext } from './types';

type ChatMsg = OpenAI.Chat.Completions.ChatCompletionMessageParam;

/** Cap on model <-> tool round-trips per turn. Guards against infinite
 *  tool-loops where the model keeps asking without concluding. */
const MAX_ROUNDS = 8;

export interface RunTurnInput {
  openai: OpenAI;
  ctx: ToolContext;
  /** System prompt + message history + the new user message, already built. */
  messages: ChatMsg[];
  /** Called for every AgentEvent the loop emits. Callee owns the wire. */
  pushEvent: (event: Omit<AgentEvent, 'seq' | 'ts'>) => Promise<void>;
}

export interface RunTurnOutput {
  /** Ordered transcript blocks for the assistant's side of this turn. */
  blocks: MessageBlock[];
  /** What the caller should report in the `turn_complete` event. */
  reason: 'complete' | 'paused' | 'aborted';
}

/**
 * Execute one full turn. Pushes events as side effects; returns the
 * assembled block list for persistence.
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
    /** Buffered fragments for each tool call, keyed by the `index` OpenAI uses. */
    const toolCallBuffers = new Map<
      number,
      { id: string; name: string; argsJson: string }
    >();
    let finishReason: string | null = null;
    /**
     * The assistant message we have to push back into `messages` for the
     * next round. Assembled incrementally as deltas arrive.
     */
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
          // Any new tool call ends the current text run; the model won't
          // interleave text with tool calls within a single response.
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

    // Reconstruct the assistant message for this round so the NEXT round
    // has the right history. For tool-calling rounds we include the tool
    // calls; for plain-text rounds we just store the content.
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

    // Tool-call round: execute each buffered call, append tool results,
    // loop back for another round.
    if (toolCallBuffers.size > 0) {
      for (const buf of toolCallBuffers.values()) {
        if (!buf.id || !buf.name) continue; // skip malformed entries defensively

        // Parse args. A parse failure falls through to executeTool which
        // will produce a structured invalid_args error — better than
        // fabricating one here, since the zod schema is the source of truth.
        let args: Record<string, unknown>;
        try {
          args = JSON.parse(buf.argsJson || '{}') as Record<string, unknown>;
        } catch {
          args = {};
        }

        const tool = getTool(buf.name);

        // Phase 3 lands here for approval-gated tools. Today: refuse.
        if (tool?.requiresApproval === true) {
          const toolCallBlock: ToolCallBlock = {
            type: 'tool_call',
            callId: buf.id,
            name: buf.name,
            args,
            status: 'denied',
            result: {
              ok: false,
              summary: 'Approval-gated tools are not yet available.',
              error: 'not_implemented',
            },
          };
          blocks.push(toolCallBlock);
          await pushEvent({
            type: 'tool_call_result',
            callId: buf.id,
            ok: false,
            summary: toolCallBlock.result!.summary,
            error: 'Approval-gated tools land in Phase 3.',
          });
          messages.push({
            role: 'tool',
            tool_call_id: buf.id,
            content: 'ERROR: this tool requires user approval, which is not implemented yet.',
          });
          continue;
        }

        await pushEvent({
          type: 'tool_call_start',
          callId: buf.id,
          name: buf.name,
          args,
        });

        // Pre-populate the block so it appears in the transcript immediately;
        // we'll mutate it with the result below.
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

    // No tool calls + no 'stop' finish. Unusual (e.g. 'length' without text)
    // — surface and return.
    logger.warn('[tools.loop] unexpected end-of-stream', { finishReason, round });
    break;
  }

  return { blocks, reason: 'complete' };
}
