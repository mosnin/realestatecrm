/**
 * Isolated specialist run used by `delegate_task`.
 *
 * The parent chat turn stays small: it hands over a self-contained brief and
 * waits for one briefing. The child starts a fresh context (no parent
 * transcript, no `delegate_task`) so a 20-step job does not replay the
 * realtor's whole thread on every inner step.
 */

import { Agent, run, type Tool as SdkTool } from '@openai/agents';
import { getAgentModel } from './agent-model';
import {
  applyApprovalDecision,
  findRunInterruption,
  restoreRunState,
  toSdkTool,
} from './sdk-bridge';
import { getChatTools, selectDirectExecutionToolNames } from './toolsets';
import { withLoopGuard } from './loop-guard';
import { mapSdkEvent, type SdkStreamEventLike } from './sdk-event-mapper';
import type { ToolContext, ToolDefinition } from './types';
import { isWorkbenchEnabled } from '@/lib/chippi/workbench-flag';
import { loadIntegrationMetaTools } from './integration-meta-tools';
import { recordChatUsage } from '@/lib/usage/record-chat-usage';
import { DEFAULT_CHAT_MODEL } from '@/lib/chat-models';
import { sumSdkTurnUsage, type SdkResultUsageLike } from './turn-usage';
import {
  childDecisionToApproval,
  persistChildPausedRun,
  storeChildPausedResult,
  waitForChildApprovalDecision,
} from './delegate-child-pause';
import { withApprovalDisplayArgs } from './permission-enrich';

/** Child budget. Isolated context makes this affordable; the parent loop
 *  stays at CHAT/WORK_MAX_TURNS. */
export const DELEGATE_CHILD_MAX_TURNS = 24;

const CHILD_SUMMARY_CAP = 4_000;
const CHILD_APPROVAL_ROUNDS = 8;

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

export function buildDelegateChildPrompt(
  ctx: ToolContext,
  goal: string,
  liveToolkits: string[] = [],
): string {
  const connected = liveToolkits.length > 0
    ? `Connected apps on this turn: ${liveToolkits.join(', ')}. For those apps, call find_integration_tool then call_integration_tool. If nothing matches, say so.`
    : 'Connected-app tools are not attached this turn. Use the native tools in your list. Do not call find_integration_tool, and do not tell the realtor their apps or your tools are missing.';
  return [
    `You are a Chippi specialist working one delegated job for workspace "${ctx.space.name}".`,
    `Complete this goal, then return a dense briefing the parent agent will read — not a chat reply to the realtor.`,
    `Use tools. Never invent CRM data. If a read returns nothing, say so.`,
    `Do not ask the realtor questions. If you are blocked, say what is missing.`,
    `The briefing must include: what you did, the concrete facts (names, dates, numbers), and any recommended next action.`,
    connected,
    ``,
    `Goal:`,
    goal,
  ].join('\n');
}

function readableToolName(name: string): string {
  return name.replace(/_/g, ' ');
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export interface DelegatedChildResult {
  ok: boolean;
  summary: string;
  toolNames: string[];
}

export async function runDelegatedChildTurn(input: {
  ctx: ToolContext;
  goal: string;
  resume?: {
    serializedState: string;
    callId: string;
    decision: { approved: true } | { approved: false; message?: string };
    pausedRunId?: string;
  };
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
    onPermissionRequired: undefined,
    onPermissionResolved: undefined,
  };

  const integrations = await loadIntegrationMetaTools(childCtx, { userMessage: goal });
  const nativeTools = selected.map((tool) => toSdkTool(tool, childCtx));
  const tools = withLoopGuard([
    ...nativeTools,
    ...(integrations.tools as SdkTool[]),
  ]);
  const agent = new Agent({
    name: 'Chippi Specialist',
    instructions: buildDelegateChildPrompt(input.ctx, goal, integrations.liveToolkits),
    tools,
    model: getAgentModel(),
    modelSettings: {
      maxTokens: 4_096,
      parallelToolCalls: false,
    },
  });

  const childRunId = crypto.randomUUID();
  const toolNames: string[] = [];
  let usageSegment = 0;

  const recordSegmentUsage = (result: SdkResultUsageLike) => {
    const usage = sumSdkTurnUsage(result);
    const seed = input.ctx.continuationIdempotencySeed;
    void recordChatUsage({
      spaceId: input.ctx.space.id,
      userId: input.ctx.userId,
      conversationId: input.ctx.conversationId ?? null,
      model: DEFAULT_CHAT_MODEL,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      cachedTokens: usage.cachedTokens,
      costUsd: usage.costUsd,
      route: 'agent',
      runtime: 'ts',
      idempotencyKey: seed
        ? `delegate-child:${seed}:${usageSegment}`
        : `delegate-child:${childRunId}:${usageSegment}`,
    }).catch(() => {});
    usageSegment += 1;
  };

  const pumpProgress = async (result: {
    toStream: () => AsyncIterable<unknown>;
  }) => {
    for await (const event of result.toStream()) {
      const mapped = mapSdkEvent(event as SdkStreamEventLike);
      if (mapped?.type === 'tool_call_start') {
        toolNames.push(mapped.name);
        input.ctx.onProgress?.(`Specialist: ${readableToolName(mapped.name)}`);
      }
    }
  };

  input.ctx.onProgress?.('Specialist started');

  try {
    let result = input.resume
      ? await resumeChildFromState(agent, input.resume, input.ctx.signal)
      : await run(agent, goal, {
          stream: true,
          signal: input.ctx.signal,
          maxTurns: DELEGATE_CHILD_MAX_TURNS,
        });

    for (let round = 0; round < CHILD_APPROVAL_ROUNDS; round++) {
      await pumpProgress(result);
      await result.completed;
      recordSegmentUsage(result);

      const interruptions = result.interruptions as
        | Array<{ rawItem: { callId?: string; id?: string }; name?: string; arguments?: string }>
        | undefined;
      if (!interruptions?.length || !result.state) {
        const text = (result.finalOutput ?? '').toString().trim().slice(0, CHILD_SUMMARY_CAP);
        if (!text) {
          return {
            ok: false,
            summary: 'The specialist finished without a briefing. Continue the work yourself.',
            toolNames,
          };
        }
        return { ok: true, summary: text, toolNames };
      }

      const persisted = await persistChildPausedRun({
        ctx: input.ctx,
        conversationId: input.ctx.conversationId,
        goal,
        state: result.state,
        interruptions,
      });
      if (!persisted) {
        return {
          ok: false,
          summary: 'The specialist needed approval but Chippi could not save the review checkpoint. No action was taken.',
          toolNames,
        };
      }

      const first = persisted.approvals[0];
      input.ctx.onProgress?.('Specialist waiting for your approval');
      const args = await withApprovalDisplayArgs(
        input.ctx.space.id,
        first.toolName,
        asRecord(first.arguments),
      );
      const otherPendingCalls = await Promise.all(
        persisted.approvals.slice(1).map(async (approval) => ({
          callId: approval.callId,
          name: approval.toolName,
          args: await withApprovalDisplayArgs(
            input.ctx.space.id,
            approval.toolName,
            asRecord(approval.arguments),
          ),
          summary: approval.summary,
        })),
      );
      input.ctx.onPermissionRequired?.({
        requestId: persisted.pausedRunId,
        callId: first.callId,
        name: first.toolName,
        args,
        summary: first.summary,
        inline: true,
        otherPendingCalls,
      });

      const waited = await waitForChildApprovalDecision({
        pausedRunId: persisted.pausedRunId,
        spaceId: input.ctx.space.id,
        signal: input.ctx.signal,
        onHeartbeat: () => input.ctx.onProgress?.('Specialist waiting for your approval'),
      });

      if (!waited) {
        return {
          ok: false,
          summary: 'The specialist stopped while waiting for approval. No action was taken.',
          toolNames,
        };
      }
      if ('lostClaim' in waited) {
        if (waited.result) return { ...waited.result, toolNames };
        return {
          ok: false,
          summary: 'The specialist approval was handled in another turn. Continue from that result.',
          toolNames,
        };
      }

      input.ctx.onPermissionResolved?.({
        requestId: persisted.pausedRunId,
        callId: waited.callId,
        decision: waited.approved ? 'approved' : 'denied',
      });

      result = await resumeChildFromState(
        agent,
        {
          serializedState: (result.state as { toString(): string }).toString(),
          callId: waited.callId,
          decision: childDecisionToApproval(waited),
        },
        input.ctx.signal,
      );
    }

    return {
      ok: false,
      summary: 'The specialist hit too many approval checkpoints. Continue the work yourself.',
      toolNames,
    };
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

async function resumeChildFromState(
  agent: Agent,
  resume: {
    serializedState: string;
    callId: string;
    decision: { approved: true } | { approved: false; message?: string };
  },
  signal: AbortSignal,
) {
  const state = await restoreRunState(agent, resume.serializedState);
  const item = findRunInterruption(state, resume.callId);
  if (!item) {
    throw new Error(`No pending specialist approval matching callId=${resume.callId}`);
  }
  applyApprovalDecision(state, item, resume.decision);
  return run(agent, state, {
    stream: true,
    signal,
    maxTurns: DELEGATE_CHILD_MAX_TURNS,
  });
}

/** Used by the resume route when the in-request waiter is gone. */
export async function continueDelegatedChildAfterDecision(input: {
  ctx: ToolContext;
  goal: string;
  serializedState: string;
  callId: string;
  decision: { approved: true } | { approved: false; message?: string };
  pausedRunId: string;
}): Promise<DelegatedChildResult> {
  const result = await runDelegatedChildTurn({
    ctx: input.ctx,
    goal: input.goal,
    resume: {
      serializedState: input.serializedState,
      callId: input.callId,
      decision: input.decision,
      pausedRunId: input.pausedRunId,
    },
  });
  await storeChildPausedResult({
    pausedRunId: input.pausedRunId,
    spaceId: input.ctx.space.id,
    ok: result.ok,
    summary: result.summary,
  });
  return result;
}
