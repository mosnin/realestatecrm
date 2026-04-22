/**
 * `runSubAgent` — executes one sub-agent turn to completion.
 *
 * Architectural note on context rot: this function is the hard boundary
 * between the orchestrator's conversation and the sub-agent's work. Inputs
 * are a Skill (persona) + a task string; output is a single summary string.
 * None of the sub-agent's messages, tool calls, or tool results leak back
 * into the orchestrator — they exist only for the duration of this call.
 * That's exactly the "scrapped once the task is done" property from the
 * Modal + OpenAI Agents SDK post, implemented without Modal (our tools
 * are DB queries, not sandboxed code, so no sandbox runtime is needed).
 *
 * What this function does NOT do:
 *   - Stream tokens to the client — sub-agents are synchronous from the
 *     orchestrator's perspective; only the final summary shows up in the
 *     transcript as a ToolCallBlock.result.
 *   - Allow mutating tools — validateSkill refuses those at registration
 *     time; this is a second guard at execution time in case a future
 *     skill misdeclares.
 *   - Persist messages to the DB — sub-agent messages don't belong in
 *     the conversation history.
 *
 * Respect for ctx.signal is explicit: every round re-checks abort before
 * the OpenAI call, so a cancelled orchestrator turn tears down the
 * sub-agent promptly.
 */

import type OpenAI from 'openai';
import { logger } from '@/lib/logger';
import { executeTool, executionToModelMessage } from '../execute';
import { AGENT_MODEL } from '../openai-client';
import { allToolsForOpenAI } from '../openai-format';
import { getTool } from '../registry';
import type { ToolContext, ToolDefinition } from '../types';
import type { Skill } from './types';

type ChatMsg = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export interface RunSubAgentInput {
  skill: Skill;
  task: string;
  ctx: ToolContext;
  openai: OpenAI;
}

export interface RunSubAgentOutput {
  summary: string;
  /** Count of tool calls the sub-agent made. Useful for cost / observability. */
  toolCalls: number;
  /** Why the loop stopped. */
  reason: 'complete' | 'max_rounds' | 'aborted' | 'error';
  /** Present when reason === 'error'. */
  error?: string;
}

/** Default per-skill cap. Research skills finish well under this. */
const DEFAULT_MAX_ROUNDS = 4;

/**
 * Harness preamble prepended to every skill's systemPrompt. Centralises the
 * identity + output-format rules so each skill can stay domain-specific.
 * The "end with a one-paragraph summary" instruction is load-bearing —
 * the orchestrator reads that paragraph as the tool result.
 */
function buildSystemPrompt(skill: Skill, spaceName: string): string {
  return `You are a sub-agent ("${skill.name}") helping a real-estate CRM orchestrator in the "${spaceName}" workspace.

You have a narrow, read-only scope. When you have enough information, reply with ONE short paragraph (≤ 3 sentences) summarising what you found or concluding why you couldn't find it. Do not list raw data; synthesise.

${skill.systemPrompt}`;
}

/**
 * Collect only the registered tools the skill is allowed to use. Any tool
 * that isn't in the registry is dropped with a warning — at worst the
 * sub-agent gets a smaller toolset than promised, never a stale one.
 */
function resolveAllowedTools(skill: Skill): ToolDefinition[] {
  const allowed: ToolDefinition[] = [];
  for (const name of skill.toolAllowlist) {
    const tool = getTool(name);
    if (!tool) {
      logger.warn('[skill] tool in allowlist not registered', { skill: skill.name, tool: name });
      continue;
    }
    if (tool.requiresApproval !== false) {
      // Defence-in-depth — validateSkill rejected this at registration, but
      // if the registry changes out from under us between boot and now,
      // keep the read-only invariant.
      logger.error('[skill] allowlisted tool became mutating', {
        skill: skill.name,
        tool: name,
      });
      continue;
    }
    allowed.push(tool);
  }
  return allowed;
}

export async function runSubAgent(input: RunSubAgentInput): Promise<RunSubAgentOutput> {
  const { skill, task, ctx, openai } = input;
  const maxRounds = skill.maxRounds ?? DEFAULT_MAX_ROUNDS;
  const allowed = resolveAllowedTools(skill);
  const toolsForOpenAI = allToolsForOpenAI(allowed);
  // If the skill lists tools but none resolved, the sub-agent can still
  // answer from its system prompt. `allowed.length === 0` is not an error.

  const messages: ChatMsg[] = [
    { role: 'system', content: buildSystemPrompt(skill, ctx.space.name) },
    { role: 'user', content: task },
  ];

  let toolCalls = 0;
  const startedAt = Date.now();

  for (let round = 0; round < maxRounds; round++) {
    if (ctx.signal.aborted) {
      logger.info('[skill.usage]', {
        skill: skill.name,
        reason: 'aborted',
        toolCalls,
        durationMs: Date.now() - startedAt,
      });
      return { summary: '', toolCalls, reason: 'aborted' };
    }

    let completion: OpenAI.Chat.Completions.ChatCompletion;
    try {
      completion = await openai.chat.completions.create({
        model: AGENT_MODEL,
        // Sub-agents don't stream — the orchestrator doesn't show their
        // deltas anywhere. Blocking calls keep the control flow simple
        // and still cheap: maxRounds caps total latency.
        stream: false,
        messages,
        ...(toolsForOpenAI.length > 0
          ? { tools: toolsForOpenAI, tool_choice: 'auto' as const }
          : {}),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[skill] openai call failed', { skill: skill.name }, err);
      return { summary: '', toolCalls, reason: 'error', error: message };
    }

    const choice = completion.choices[0];
    if (!choice) {
      return { summary: '', toolCalls, reason: 'error', error: 'Empty completion' };
    }
    const msg = choice.message;

    // The model can reply with plain text, tool calls, or both. We mirror
    // the main loop: if there are tool calls, execute them and loop; if
    // the model just talks, treat that as the final answer.
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      // Persist the assistant's "I'm calling these tools" message BEFORE
      // adding tool responses — OpenAI rejects a tool response that
      // references a tool_call_id the API hasn't seen yet.
      messages.push({
        role: 'assistant',
        content: msg.content ?? null,
        tool_calls: msg.tool_calls,
      });

      for (const call of msg.tool_calls) {
        if (call.type !== 'function') continue;
        toolCalls += 1;
        let parsed: unknown = {};
        try {
          parsed = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        } catch {
          parsed = { __parse_error: true };
        }

        const exec = await executeTool(call.function.name, parsed, ctx);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: executionToModelMessage(exec),
        });
      }
      continue;
    }

    // No tool calls → this is the summary round.
    const summary = (msg.content ?? '').trim();
    logger.info('[skill.usage]', {
      skill: skill.name,
      reason: 'complete',
      toolCalls,
      durationMs: Date.now() - startedAt,
      summaryLength: summary.length,
    });
    return {
      summary: summary || '(The sub-agent finished without a summary.)',
      toolCalls,
      reason: 'complete',
    };
  }

  // Budget exhausted. Ask for a best-effort summary in a final,
  // tools-disabled round so the orchestrator at least gets SOMETHING.
  messages.push({
    role: 'user',
    content:
      'You have exhausted your tool budget. Reply with one short paragraph summarising what you learned and what remains uncertain.',
  });
  try {
    const finalCompletion = await openai.chat.completions.create({
      model: AGENT_MODEL,
      stream: false,
      messages,
    });
    const summary = (finalCompletion.choices[0]?.message?.content ?? '').trim();
    logger.info('[skill.usage]', {
      skill: skill.name,
      reason: 'max_rounds',
      toolCalls,
      durationMs: Date.now() - startedAt,
    });
    return {
      summary: summary || 'Sub-agent exhausted its tool budget without a conclusion.',
      toolCalls,
      reason: 'max_rounds',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      summary: 'Sub-agent hit its tool budget and failed to produce a summary.',
      toolCalls,
      reason: 'error',
      error: message,
    };
  }
}

// Re-export for downstream modules that want direct access to the
// registry-filtering helper (e.g. tests).
export { resolveAllowedTools };
