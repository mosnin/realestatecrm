/**
 * `delegate_task` — Claude Code / Cowork-style Task tool.
 *
 * The parent chat turn hands a self-contained brief to an isolated specialist
 * and WAITS for a briefing. The child runs in a fresh context with its own
 * tool budget so a long job does not replay the parent transcript on every
 * step. Progress heartbeats keep the thinking indicator and idle watchdog
 * alive. The parent then answers the realtor from the briefing.
 *
 * Modal swarm launch remains available for voice / floor-manager specialists
 * (`createAndEnqueueSwarmRun`). Interactive chat uses the waiting child so
 * the realtor gets one answer, not a "I kicked it off" dead-end.
 *
 * Scoped to ctx.space.id. The handler ignores any spaceId in args.
 */

import { z } from 'zod';
import { assertSpaceEnabled } from '@/lib/agent/kill-switch';
import { runDelegatedChildTurn } from '../delegate-run';
import { defineTool, type ToolContext } from '../types';

const parameters = z.object({
  goal: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .describe(
      'The full task for the sub-agent to carry out, written as a self-contained brief. ' +
        'Include everything it needs — the sub-agent does NOT see the chat history. ' +
        'Use for in-depth, multi-step work (deep research, pipeline sweeps, multi-contact ' +
        'analysis). For a simple question you can answer directly, do NOT delegate.',
    ),
});

type DelegateArgs = z.infer<typeof parameters>;

export interface DelegateTaskData {
  /** Present only for legacy fire-and-forget swarm launches. */
  runId?: string;
  goal: string;
}

/** The tool name, exported so the stream pump + UI can recognize delegate
 *  results without a string literal scattered across files. */
export const DELEGATE_TASK_TOOL_NAME = 'delegate_task';

/**
 * Machine marker appended to the model-facing summary so the stream pump can
 * recover the SwarmRun id (which is minted server-side inside the handler and
 * is otherwise lost — the SDK only forwards the summary STRING to the model).
 * The pump parses + strips this before the realtor ever sees the summary.
 * Format: `⟦chippi:subagent runId=<id>⟧`
 */
const RUN_ID_MARKER = /⟦chippi:subagent runId=([A-Za-z0-9-]+)⟧/;

export function encodeSubagentRunId(runId: string): string {
  return `⟦chippi:subagent runId=${runId}⟧`;
}

/** Extract the SwarmRun id from a delegate_task summary, or null. */
export function parseSubagentRunId(summary: string): string | null {
  const m = RUN_ID_MARKER.exec(summary);
  return m ? m[1] : null;
}

/** Remove the machine marker so the realtor-facing summary stays clean. */
export function stripSubagentMarker(summary: string): string {
  return summary.replace(RUN_ID_MARKER, '').replace(/\s+$/, '');
}

/**
 * Built as a factory so it has no hidden module-level state and so tests can
 * construct it in isolation. Returns a read-only ToolDefinition.
 */
export function buildDelegateTaskTool() {
  return defineTool<typeof parameters, DelegateTaskData>({
    name: 'delegate_task',
    description:
      'Hand a long or multi-step job to an isolated specialist and WAIT for its briefing. ' +
      'Use when the work needs more than a few tool calls, a sweep across many people or deals, ' +
      'or would overflow this turn. The specialist does not see this chat — write a self-contained ' +
      'brief. After this tool returns, answer the realtor from the briefing. Do not redo the work. ' +
      'Do not use this for a single lookup or one-step send.',
    parameters,
    riskLevel: 'safe',
    requiresApproval: false,
    handler: async (args: DelegateArgs, ctx: ToolContext): Promise<{
      summary: string;
      data?: DelegateTaskData;
      display?: 'plain' | 'error';
    }> => {
      const goal = args.goal.trim();
      if (!goal) {
        return { summary: 'Error: no task brief provided to delegate.', display: 'error' };
      }

      // Honor the kill-switch — a disabled space can't spawn background work.
      try {
        await assertSpaceEnabled(ctx.space.id);
      } catch {
        return {
          summary: 'Error: this workspace is paused, so I can’t start a delegated task right now.',
          display: 'error',
        };
      }

      const child = await runDelegatedChildTurn({ ctx, goal });
      if (!child.ok) {
        return {
          summary: child.summary,
          display: 'error',
        };
      }
      return {
        summary: child.summary,
        data: { goal },
        display: 'plain',
      };
    },
  });
}
