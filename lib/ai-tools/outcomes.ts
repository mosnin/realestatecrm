import { after } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type { ToolContext, ToolResult } from './types';
import {
  emit,
  maybeEmitFirstAction,
  SIDE_EFFECTING_TOOLS,
} from '@/lib/telemetry';

export type ToolOutcome =
  | 'completed'
  | 'drafted'
  | 'failed'
  | 'uncertain'
  | 'read';

/** Completion is based on the handler receipt, never the assistant's claim. */
export function classifyToolOutcome(
  name: string,
  result: ToolResult,
): ToolOutcome {
  if (result.durableExecutionDisposition === 'reconciliation_required')
    return 'uncertain';
  if (
    result.display === 'error' ||
    result.durableExecutionDisposition === 'terminal_failure'
  )
    return 'failed';
  if (result.display === 'message-draft' || /(?:^|_)draft(?:_|$)/.test(name))
    return 'drafted';
  if (result.display === 'warning') return 'uncertain';
  if (name === 'schedule_tour' && result.display === 'tours') {
    const tours = (result.data as { tours?: Array<{ tourId?: string }> } | undefined)?.tours;
    if (tours?.some(tour => typeof tour.tourId === 'string' && tour.tourId.length > 0)) return 'completed';
  }
  if (SIDE_EFFECTING_TOOLS.has(name) && result.display === 'success')
    return 'completed';
  return 'read';
}

export function recordToolOutcome(
  name: string,
  result: ToolResult,
  ctx: ToolContext,
  callId?: string,
): void {
  const outcome = classifyToolOutcome(name, result);
  // Internal observer supports unattended runs without exposing payloads or PII.
  try {
    ctx.onToolOutcome?.({ name, outcome });
  } catch {
    /* observers cannot change an execution receipt */
  }
  if (outcome === 'read') return;
  void recordActivityOutcome({
    spaceId: ctx.space.id,
    name,
    outcome,
    runId: ctx.conversationId,
    callId,
  });
  void emit({
    event: 'agent_action_result',
    spaceId: ctx.space.id,
    userId: ctx.userId,
    payload: {
      toolName: name,
      outcome,
      conversationId: ctx.conversationId ?? null,
      background: ctx.backgroundRun === true,
    },
  });
  if (outcome === 'completed') {
    void maybeEmitFirstAction({
      spaceId: ctx.space.id,
      userId: ctx.userId,
      toolName: name,
    });
  }
}

/** Feed the same real receipts to Today and the activity timeline. Drafts
 * remain pending work and therefore never enter completed-action totals. */
type ActivityOutcomeInput = {
  spaceId: string;
  name: string;
  outcome: ToolOutcome;
  runId?: string;
  callId?: string;
};

export async function recordActivityOutcome(
  input: ActivityOutcomeInput,
): Promise<void> {
  const task = persistActivityOutcome(input);
  try {
    after(() => task);
  } catch {
    /* Outside a Next.js request, the caller awaits the same task. */
  }
  await task;
}

async function persistActivityOutcome(
  input: ActivityOutcomeInput,
): Promise<void> {
  if (input.outcome === 'read') return;
  try {
    const { error } = await supabase.from('AgentActivityLog').insert({
      id: input.callId
        ? `ts:${input.spaceId}:${input.callId}`
        : crypto.randomUUID(),
      spaceId: input.spaceId,
      runId: input.runId ?? input.callId ?? crypto.randomUUID(),
      agentType: 'workspace',
      actionType: input.name,
      outcome:
        input.outcome === 'completed'
          ? 'completed'
          : input.outcome === 'drafted'
            ? 'queued_for_approval'
            : 'failed',
      reasoning:
        input.outcome === 'completed'
          ? 'Confirmed by the action receipt.'
          : input.outcome === 'drafted'
            ? 'Prepared for review; not sent.'
            : 'Action needs attention. Check the run before retrying.',
      reversible: false,
      metadata: { runtime: 'ts', disposition: input.outcome },
    });
    if (error && error.code !== '23505')
      logger.warn('[agent/activity] receipt could not be saved', {
        spaceId: input.spaceId,
        toolName: input.name,
      });
  } catch {
    logger.warn('[agent/activity] receipt could not be saved', {
      spaceId: input.spaceId,
      toolName: input.name,
    });
  }
}
