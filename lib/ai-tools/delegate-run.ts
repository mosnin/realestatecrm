/**
 * Isolated specialist run used by `delegate_task`.
 *
 * The parent chat turn stays small: it hands over a self-contained brief and
 * waits for one briefing. The child starts a fresh context (no parent
 * transcript, no `delegate_task`) so a 20-step job does not replay the
 * realtor's whole thread on every inner step.
 */

import { Agent, run } from '@openai/agents';
import { getAgentModel } from './agent-model';
import { toSdkTool } from './sdk-bridge';
import { getChatTools, selectDirectExecutionToolNames } from './toolsets';
import { withLoopGuard } from './loop-guard';
import { mapSdkEvent, type SdkStreamEventLike } from './sdk-event-mapper';
import type { ToolContext, ToolDefinition } from './types';
import { isWorkbenchEnabled } from '@/lib/chippi/workbench-flag';

/** Child budget. Isolated context makes this affordable; the parent loop
 *  stays at CHAT/WORK_MAX_TURNS. */
export const DELEGATE_CHILD_MAX_TURNS = 24;

const CHILD_SUMMARY_CAP = 4_000;

const BLOCKED_CHILD_TOOLS = new Set([
  'delegate_task',
  'start_work_session',
  'continue_workspace_run',
]);

export function buildDelegateChildTools(ctx: ToolContext, goal: string): ToolDefinition[] {
  const selected = getChatTools(goal, {
    workMode: ctx.workMode,
    conversationGoal: goal,
  }).filter((tool) => !BLOCKED_CHILD_TOOLS.has(tool.name));
  return selected.filter(
    (tool) =>
      !['open_spreadsheet_in_workbench', 'inspect_workbook', 'apply_workbook_transformation'].includes(
        tool.name,
      ) || isWorkbenchEnabled(),
  );
}

export function buildDelegateChildPrompt(ctx: ToolContext, goal: string): string {
  return [
    `You are a Chippi specialist working one delegated job for workspace "${ctx.space.name}".`,
    `Complete this goal, then return a dense briefing the parent agent will read — not a chat reply to the realtor.`,
    `Use tools. Never invent CRM data. If a read returns nothing, say so.`,
    `Do not ask the realtor questions. If you are blocked, say what is missing.`,
    `The briefing must include: what you did, the concrete facts (names, dates, numbers), and any recommended next action.`,
    ``,
    `Goal:`,
    goal,
  ].join('\n');
}

function readableToolName(name: string): string {
  return name.replace(/_/g, ' ');
}

export interface DelegatedChildResult {
  ok: boolean;
  summary: string;
  toolNames: string[];
}

export async function runDelegatedChildTurn(input: {
  ctx: ToolContext;
  goal: string;
}): Promise<DelegatedChildResult> {
  const goal = input.goal.trim();
  const selected = buildDelegateChildTools(input.ctx, goal);
  const childCtx: ToolContext = {
    ...input.ctx,
    conversationGoal: goal,
    directExecutionToolNames:
      input.ctx.workMode === true && input.ctx.workExecutionMode !== 'review'
        ? selectDirectExecutionToolNames(goal, selected)
        : [],
    onProgress: undefined,
  };

  const tools = withLoopGuard(selected.map((tool) => toSdkTool(tool, childCtx)));
  const agent = new Agent({
    name: 'Chippi Specialist',
    instructions: buildDelegateChildPrompt(input.ctx, goal),
    tools,
    model: getAgentModel(),
    modelSettings: {
      maxTokens: 4_096,
      parallelToolCalls: false,
    },
  });

  input.ctx.onProgress?.('Specialist started');
  const toolNames: string[] = [];

  try {
    const result = await run(agent, goal, {
      stream: true,
      signal: input.ctx.signal,
      maxTurns: DELEGATE_CHILD_MAX_TURNS,
    });

    for await (const event of result.toStream()) {
      const mapped = mapSdkEvent(event as SdkStreamEventLike);
      if (mapped?.type === 'tool_call_start') {
        toolNames.push(mapped.name);
        input.ctx.onProgress?.(`Specialist: ${readableToolName(mapped.name)}`);
      }
    }
    await result.completed;

    const text = (result.finalOutput ?? '').toString().trim().slice(0, CHILD_SUMMARY_CAP);
    if (!text) {
      return {
        ok: false,
        summary: 'The specialist finished without a briefing. Continue the work yourself.',
        toolNames,
      };
    }
    return { ok: true, summary: text, toolNames };
  } catch (err) {
    if (input.ctx.signal.aborted) {
      return { ok: false, summary: 'The specialist was stopped before it finished.', toolNames };
    }
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      summary: `The specialist hit an error (${message.slice(0, 180)}). Continue the work yourself.`,
      toolNames,
    };
  }
}
