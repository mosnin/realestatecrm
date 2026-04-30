/**
 * Resume a paused turn after the user approves or denies the pending call.
 *
 * Phases 2c/3a establish that pausing returns a `PendingApprovalState`
 * (saved to Redis). This module picks that state up, performs the user's
 * decision, and hands back off to the standard `runTurn` loop so the model
 * can react to the outcome.
 *
 * Flow:
 *   1. Emit `permission_resolved` so the UI can transition the card.
 *   2. Process the pending call + any remaining calls from the same batch:
 *        - Denied (pending): append an ERROR(denied) tool-result message;
 *          append a PermissionBlock to the transcript.
 *        - Denied (remaining): same outcome — once the user says no to one
 *          call in a batch, we don't nag about the others. They're marked
 *          skipped in the transcript and fed a short error for the model.
 *        - Approved: execute with the (possibly edited) args; emit the
 *          normal tool_call_start + tool_call_result pair; append the
 *          tool-result message.
 *        - Remaining mutating calls: if another approval-gated call is
 *          reached after the one the user just approved, we pause AGAIN
 *          with a fresh pendingApproval and return — the endpoint saves it
 *          to Redis and the UI shows another prompt.
 *   3. If we got through everything without pausing, defer to `runTurn`
 *      with the extended messages array. The model takes it from there.
 */

import crypto from 'crypto';
import type OpenAI from 'openai';
import { maybeEmitFirstAction } from '@/lib/telemetry';
import type { MessageBlock, PermissionBlock, ToolCallBlock } from './blocks';
import { executeTool, executionToModelMessage } from './execute';
import type { PushableEvent } from './events';
import type { DeferredToolCall, PendingApprovalState, RunTurnOutput } from './loop';
// Importing `summarisePendingCall` here keeps initial-pause and
// continuation-re-pause wording identical.
import { runTurn, summarisePendingCall } from './loop';
import { getTool } from './registry';
import type { ToolContext } from './types';

type ChatMsg = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export interface ContinueTurnInput {
  openai: OpenAI;
  ctx: ToolContext;
  pendingState: PendingApprovalState;
  decision: 'approved' | 'denied';
  /** Optional override of the pending call's args — Phase 3d edit flow. */
  editedArgs?: Record<string, unknown>;
  pushEvent: (event: PushableEvent) => Promise<void>;
}


/** Append the tool-result + transcript bits for a denied call. */
function recordDenied(
  call: DeferredToolCall,
  blocks: MessageBlock[],
  messages: ChatMsg[],
  reason: 'direct' | 'batch-cascade',
) {
  const block: PermissionBlock = {
    type: 'permission',
    callId: call.callId,
    name: call.name,
    args: call.args,
    summary: summarisePendingCall(call.name, call.args),
    decision: 'denied',
  };
  blocks.push(block);
  const content =
    reason === 'direct'
      ? 'ERROR (denied): The user did not approve this action.'
      : 'ERROR (skipped): A prior call in this batch was denied, so this was not run.';
  messages.push({ role: 'tool', tool_call_id: call.callId, content });
}

export async function continueTurn(input: ContinueTurnInput): Promise<RunTurnOutput> {
  const { openai, ctx, pendingState, decision, editedArgs, pushEvent } = input;
  const messages: ChatMsg[] = [...pendingState.messages];
  const blocks: MessageBlock[] = [];

  // 1. Tell the UI the pending card resolved.
  await pushEvent({
    type: 'permission_resolved',
    requestId: pendingState.requestId,
    callId: pendingState.pending.callId,
    decision,
    editedArgs,
  });

  // 2. Handle the pending call + any remaining ones in order.

  // Denial path — cascade: no further prompting in the same batch.
  if (decision === 'denied') {
    recordDenied(pendingState.pending, blocks, messages, 'direct');
    for (const rem of pendingState.remainingCalls) {
      recordDenied(rem, blocks, messages, 'batch-cascade');
    }
    // Fall through to runTurn — the model gets one round to acknowledge.
    return finishWithRunTurn(openai, ctx, messages, blocks, pushEvent);
  }

  // Approval path — run the approved call, then process remaining ones
  // (pausing if another mutation appears).
  const approvedArgs = editedArgs ?? pendingState.pending.args;
  const approvedOutcome = await runCall(
    { ...pendingState.pending, args: approvedArgs },
    ctx,
    messages,
    blocks,
    pushEvent,
    /* forceApprovedExecution */ true,
  );
  if (approvedOutcome.status === 'aborted') {
    return { blocks, reason: 'aborted' };
  }

  for (const rem of pendingState.remainingCalls) {
    const tool = getTool(rem.name);
    if (tool?.requiresApproval === true) {
      // Re-pause for this one. The endpoint saves the new state and the
      // UI prompts again.
      const requestId = crypto.randomUUID();
      // Remaining calls after this one: the ones we haven't started yet.
      const furtherRemaining = pendingState.remainingCalls.slice(
        pendingState.remainingCalls.indexOf(rem) + 1,
      );
      // Cascade-deny preview for the client — same rationale as the initial
      // pause in loop.ts: if the user denies, the transcript should reflect
      // every skipped call immediately, not only after a refresh.
      const otherPendingCalls = furtherRemaining
        .filter((c) => getTool(c.name)?.requiresApproval !== false)
        .map((c) => ({
          callId: c.callId,
          name: c.name,
          args: c.args,
          summary: summarisePendingCall(c.name, c.args),
        }));
      await pushEvent({
        type: 'permission_required',
        requestId,
        callId: rem.callId,
        name: rem.name,
        args: rem.args,
        summary: summarisePendingCall(rem.name, rem.args),
        ...(otherPendingCalls.length > 0 ? { otherPendingCalls } : {}),
      });
      return {
        blocks,
        reason: 'paused',
        pendingApproval: {
          requestId,
          pending: rem,
          remainingCalls: furtherRemaining,
          messages,
        },
      };
    }
    const outcome = await runCall(rem, ctx, messages, blocks, pushEvent, false);
    if (outcome.status === 'aborted') {
      return { blocks, reason: 'aborted' };
    }
  }

  // All calls resolved. Let runTurn do the next model round.
  return finishWithRunTurn(openai, ctx, messages, blocks, pushEvent);
}

/**
 * Execute one tool call (the approved one or a subsequent read-only
 * remaining one) and append to blocks/messages/events.
 *
 * `forceApprovedExecution=true` is a marker — it doesn't re-check
 * `requiresApproval`, because the caller already handled that decision.
 * Phase 3c's send_email is the first non-trivial consumer.
 */
async function runCall(
  call: DeferredToolCall,
  ctx: ToolContext,
  messages: ChatMsg[],
  blocks: MessageBlock[],
  pushEvent: (event: PushableEvent) => Promise<void>,
  forceApprovedExecution: boolean,
): Promise<{ status: 'done' | 'aborted' }> {
  void forceApprovedExecution; // tracked for clarity; executeTool doesn't need it

  await pushEvent({
    type: 'tool_call_start',
    callId: call.callId,
    name: call.name,
    args: call.args,
  });

  const toolCallBlock: ToolCallBlock = {
    type: 'tool_call',
    callId: call.callId,
    name: call.name,
    args: call.args,
    status: 'complete',
  };
  blocks.push(toolCallBlock);

  const exec = await executeTool(call.name, call.args, ctx);

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
    callId: call.callId,
    ok: exec.ok,
    summary: toolCallBlock.result.summary,
    data: toolCallBlock.result.data,
    error: exec.ok ? undefined : toolCallBlock.result.error,
  });

  // Phase 2 telemetry: gate-emit agent_first_action_completed when an
  // approved (or read-only remaining) call lands successfully. Fire-and-
  // forget; the helper handles the side-effecting-tools allowlist and the
  // first-time-per-space gate internally.
  if (exec.ok) {
    void maybeEmitFirstAction({
      spaceId: ctx.space.id,
      userId: ctx.userId,
      toolName: call.name,
    });
  }

  messages.push({
    role: 'tool',
    tool_call_id: call.callId,
    content: executionToModelMessage(exec),
  });

  return { status: exec.error?.code === 'aborted' ? 'aborted' : 'done' };
}

/**
 * Run the standard `runTurn` loop with the messages we've assembled so far,
 * then merge its output blocks into ours.
 */
async function finishWithRunTurn(
  openai: OpenAI,
  ctx: ToolContext,
  messages: ChatMsg[],
  blocks: MessageBlock[],
  pushEvent: (event: PushableEvent) => Promise<void>,
): Promise<RunTurnOutput> {
  const downstream = await runTurn({ openai, ctx, messages, pushEvent });
  return {
    blocks: [...blocks, ...downstream.blocks],
    reason: downstream.reason,
    pendingApproval: downstream.pendingApproval,
  };
}
