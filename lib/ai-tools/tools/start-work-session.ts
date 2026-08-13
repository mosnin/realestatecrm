import crypto from 'crypto';
import { z } from 'zod';
import { defineTool } from '../types';

const parameters = z
  .object({
    goal: z
      .string()
      .trim()
      .min(10)
      .max(1000)
      .describe(
        'A self-contained outcome with enough context to know when the work is finished.',
      ),
    kind: z
      .enum(['research', 'workspace'])
      .optional()
      .describe(
        "Use 'research' for analysis and a finished report. Use 'workspace' only when the user needs a private multi-file deliverable or terminal-backed workspace.",
      ),
  })
  .strict();

export interface StartedWorkSessionData {
  sessionId: string;
  goal: string;
  status: string;
  kind: 'research' | 'workspace';
  workspaceRunId?: string;
}

/** Stable UUID-shaped idempotency key for one Work-mode turn and goal. */
export function workSessionIdForTurn(input: {
  spaceId: string;
  turnSeed: string;
  goal: string;
  kind: 'research' | 'workspace';
}): string {
  const hex = crypto
    .createHash('sha256')
    .update(`${input.spaceId}\0${input.turnSeed}\0${input.kind}\0${input.goal.trim()}`)
    .digest('hex')
    .slice(0, 32)
    .split('');
  hex[12] = '4';
  hex[16] = ((Number.parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
  const value = hex.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

/**
 * Natural-language bridge from Work mode into the durable WorkSession engine.
 * The user already authorized background work by selecting Work and sending
 * the outcome, so this tool does not add a second form or confirmation step.
 */
export const startWorkSessionTool = defineTool<
  typeof parameters,
  StartedWorkSessionData
>({
  name: 'start_work_session',
  riskLevel: 'safe',
  description:
    'Start durable background work for a substantial multi-step outcome or finished deliverable. Use only in Work mode; handle quick requests directly. Progress appears in the current chat.',
  parameters,
  requiresApproval: false,
  async handler(args, ctx) {
    if (!ctx.workMode) {
      return {
        summary: 'Background work can only be started after the user selects Work mode.',
        display: 'warning',
      };
    }
    if (!ctx.conversationId || !ctx.continuationIdempotencySeed) {
      return {
        summary: 'This message is not attached to a durable conversation turn.',
        display: 'error',
      };
    }

    const kind = args.kind ?? 'research';
    const { isWorkspaceRunsEnabledForSpace } = await import(
      '@/lib/chippi/workspace-run-flag'
    );
    if (kind === 'workspace' && !isWorkspaceRunsEnabledForSpace(ctx.space.id)) {
      return {
        summary:
          'The private terminal workspace is not enabled for this workspace. Continue with a research deliverable instead.',
        display: 'warning',
      };
    }

    const id = workSessionIdForTurn({
      spaceId: ctx.space.id,
      turnSeed: ctx.continuationIdempotencySeed,
      goal: args.goal,
      kind,
    });

    try {
      // Late import avoids pulling the workspace LLM/runtime graph into the
      // tool registry while that registry is still initializing.
      const { startWorkSession } = await import('@/lib/work-sessions/start');
      const { session, created } = await startWorkSession({
        id,
        spaceId: ctx.space.id,
        conversationId: ctx.conversationId,
        goal: args.goal,
        autonomy: 'just_go',
        allowQuestions: true,
        kind,
      });
      return {
        summary: created
          ? 'Started working in the background. Progress will stay visible in this conversation.'
          : 'This work is already running in the background.',
        data: {
          sessionId: session.id,
          goal: session.goal,
          status: session.status,
          kind,
          ...(session.workspaceRunId ? { workspaceRunId: session.workspaceRunId } : {}),
        },
        display: 'success',
      };
    } catch {
      return {
        summary: 'I could not start durable background work for this request.',
        display: 'error',
      };
    }
  },
});
