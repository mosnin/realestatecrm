/**
 * Pause / resume helpers for an isolated specialist that hits a tool
 * approval while the parent `delegate_task` handler is still waiting.
 *
 * The parent ConversationTurn stays `running` — we must not call
 * resumePausedConversationTurnV2. The realtor's decision is written onto
 * this AgentPausedRun row; the waiting handler (or a stale-waiter takeover
 * on the resume route) continues the child.
 *
 * No new columns: the child envelope lives in `runState`, the decision
 * rides on `approvals[]`, and the waiter heartbeats `updatedAt`.
 */

import { after } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { encodeEvent, createSeqCounter, type AgentEvent, type PushableEvent } from './events';
import { saveAssistantMessage } from './persistence';
import {
  extractApprovals,
  serializeRunState,
  type ApprovalDecision,
  type ApprovalPrompt,
} from './sdk-bridge';
import { ALL_TOOLS } from './tools';
import type { ToolContext } from './types';

export const DELEGATE_CHILD_STATE_PREFIX = 'chippi:delegate-child:v1:';
export const DELEGATE_CHILD_RESULT_PREFIX = 'chippi:delegate-child-result:v1:';
export const DELEGATE_CHILD_APPROVAL_KIND = 'delegate_child';

export const CHILD_WAITER_STALE_MS = 25_000;
export const CHILD_APPROVAL_POLL_MS = 1_500;
export const CHILD_APPROVAL_MAX_WAIT_MS = 10 * 60 * 1000;

export interface ChildPausedEnvelope {
  goal: string;
  state: string;
}

export interface ChildApprovalDecision {
  callId: string;
  approved: boolean;
  message?: string;
}

export interface ChildStoredApproval extends ApprovalPrompt {
  kind?: string;
  delegateGoal?: string;
  decision?: { approved: boolean; message?: string };
}

export function wrapChildRunState(envelope: ChildPausedEnvelope): string {
  return `${DELEGATE_CHILD_STATE_PREFIX}${JSON.stringify(envelope)}`;
}

export function unwrapChildRunState(runState: string): ChildPausedEnvelope | null {
  if (!runState.startsWith(DELEGATE_CHILD_STATE_PREFIX)) return null;
  try {
    const parsed = JSON.parse(runState.slice(DELEGATE_CHILD_STATE_PREFIX.length)) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const rec = parsed as Record<string, unknown>;
    if (typeof rec.goal !== 'string' || rec.goal.trim().length < 1) return null;
    if (typeof rec.state !== 'string' || rec.state.length < 1) return null;
    return { goal: rec.goal, state: rec.state };
  } catch {
    return null;
  }
}

export function wrapChildResult(result: { ok: boolean; summary: string }): string {
  return `${DELEGATE_CHILD_RESULT_PREFIX}${JSON.stringify(result)}`;
}

export function unwrapChildResult(runState: string): { ok: boolean; summary: string } | null {
  if (!runState.startsWith(DELEGATE_CHILD_RESULT_PREFIX)) return null;
  try {
    const parsed = JSON.parse(runState.slice(DELEGATE_CHILD_RESULT_PREFIX.length)) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const rec = parsed as Record<string, unknown>;
    if (typeof rec.ok !== 'boolean' || typeof rec.summary !== 'string') return null;
    return { ok: rec.ok, summary: rec.summary };
  } catch {
    return null;
  }
}

export function isDelegateChildPausedRun(row: {
  runState?: string;
  approvals?: unknown;
}): boolean {
  if (typeof row.runState === 'string' && unwrapChildRunState(row.runState)) return true;
  if (!Array.isArray(row.approvals)) return false;
  return row.approvals.some((approval) => (
    !!approval
    && typeof approval === 'object'
    && (approval as { kind?: unknown }).kind === DELEGATE_CHILD_APPROVAL_KIND
  ));
}

export function markApprovalsAsChild(approvals: ApprovalPrompt[], goal: string): ChildStoredApproval[] {
  return approvals.map((approval, index) => ({
    ...approval,
    kind: DELEGATE_CHILD_APPROVAL_KIND,
    ...(index === 0 ? { delegateGoal: goal } : {}),
  }));
}

export function readChildDecision(approvals: ChildStoredApproval[] | undefined): ChildApprovalDecision | null {
  for (const approval of approvals ?? []) {
    if (!approval.decision || typeof approval.decision.approved !== 'boolean') continue;
    return {
      callId: approval.callId,
      approved: approval.decision.approved,
      message: approval.decision.message,
    };
  }
  return null;
}

export function applyDecisionToApprovals(
  approvals: ChildStoredApproval[],
  callId: string,
  decision: ApprovalDecision,
): ChildStoredApproval[] {
  return approvals.map((approval) =>
    approval.callId === callId
      ? {
          ...approval,
          decision: decision.approved
            ? { approved: true }
            : { approved: false, message: decision.message },
        }
      : approval,
  );
}

export function isChildWaiterFresh(updatedAt: string | null | undefined, now = Date.now()): boolean {
  if (!updatedAt) return false;
  const ts = new Date(updatedAt).getTime();
  if (!Number.isFinite(ts)) return false;
  return now - ts < CHILD_WAITER_STALE_MS;
}

export async function persistChildPausedRun(input: {
  ctx: ToolContext;
  conversationId?: string;
  goal: string;
  state: { toString(): string };
  interruptions: ReadonlyArray<{
    rawItem: { callId?: string; id?: string };
    name?: string;
    arguments?: string;
  }>;
}): Promise<{ pausedRunId: string; approvals: ChildStoredApproval[] } | null> {
  try {
    const id = crypto.randomUUID();
    const approvals = markApprovalsAsChild(
      extractApprovals({ interruptions: input.interruptions }, ALL_TOOLS),
      input.goal,
    );
    if (approvals.length === 0) return null;
    const { error } = await supabase.from('AgentPausedRun').insert({
      id,
      spaceId: input.ctx.space.id,
      userId: input.ctx.userId,
      conversationId: input.conversationId ?? input.ctx.conversationId ?? null,
      runState: wrapChildRunState({
        goal: input.goal,
        state: serializeRunState(input.state),
      }),
      approvals,
      attachmentManifest: input.ctx.attachmentManifest
        ?? (input.ctx.attachmentIds ?? []).map((attachmentId) => ({ id: attachmentId, filename: '' })),
      status: 'pending',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    if (error) {
      logger.error('[delegate-child] persistPausedRun failed', {
        spaceId: input.ctx.space.id,
      }, error);
      return null;
    }
    return { pausedRunId: id, approvals };
  } catch (err) {
    logger.error('[delegate-child] persistPausedRun threw', {
      spaceId: input.ctx.space.id,
    }, err);
    return null;
  }
}

export async function writeChildApprovalDecision(input: {
  pausedRunId: string;
  spaceId: string;
  userId: string;
  approvals: ChildStoredApproval[];
  callId: string;
  decision: ApprovalDecision;
}): Promise<boolean> {
  const next = applyDecisionToApprovals(input.approvals, input.callId, input.decision);
  const { data, error } = await supabase
    .from('AgentPausedRun')
    .update({
      approvals: next,
      updatedAt: new Date().toISOString(),
    })
    .eq('id', input.pausedRunId)
    .eq('spaceId', input.spaceId)
    .eq('userId', input.userId)
    .eq('status', 'pending')
    .select('id');
  if (error) {
    logger.error('[delegate-child] write decision failed', {
      pausedRunId: input.pausedRunId,
      spaceId: input.spaceId,
    }, error);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

export async function claimChildPausedRun(input: {
  pausedRunId: string;
  spaceId: string;
}): Promise<boolean> {
  const { data, error } = await supabase
    .from('AgentPausedRun')
    .update({
      status: 'resumed',
      updatedAt: new Date().toISOString(),
    })
    .eq('id', input.pausedRunId)
    .eq('spaceId', input.spaceId)
    .eq('status', 'pending')
    .select('id');
  if (error) {
    logger.error('[delegate-child] claim failed', {
      pausedRunId: input.pausedRunId,
      spaceId: input.spaceId,
    }, error);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

export async function heartbeatChildPausedRun(input: {
  pausedRunId: string;
  spaceId: string;
}): Promise<void> {
  const { error } = await supabase
    .from('AgentPausedRun')
    .update({ updatedAt: new Date().toISOString() })
    .eq('id', input.pausedRunId)
    .eq('spaceId', input.spaceId)
    .eq('status', 'pending');
  if (error) {
    logger.warn('[delegate-child] heartbeat failed', {
      pausedRunId: input.pausedRunId,
      spaceId: input.spaceId,
    }, error);
  }
}

export async function storeChildPausedResult(input: {
  pausedRunId: string;
  spaceId: string;
  ok: boolean;
  summary: string;
}): Promise<void> {
  const { error } = await supabase
    .from('AgentPausedRun')
    .update({
      runState: wrapChildResult({ ok: input.ok, summary: input.summary }),
      status: 'resumed',
      updatedAt: new Date().toISOString(),
    })
    .eq('id', input.pausedRunId)
    .eq('spaceId', input.spaceId);
  if (error) {
    logger.warn('[delegate-child] store result failed', {
      pausedRunId: input.pausedRunId,
      spaceId: input.spaceId,
    }, error);
  }
}

async function loadChildPausedRow(input: {
  pausedRunId: string;
  spaceId: string;
}): Promise<{
  status: string;
  approvals: ChildStoredApproval[];
  runState: string;
} | null> {
  const { data, error } = await supabase
    .from('AgentPausedRun')
    .select('status, approvals, runState')
    .eq('id', input.pausedRunId)
    .eq('spaceId', input.spaceId)
    .maybeSingle();
  if (error) {
    logger.warn('[delegate-child] load paused row failed', {
      pausedRunId: input.pausedRunId,
      spaceId: input.spaceId,
    }, error);
    return null;
  }
  if (!data) return null;
  return {
    status: typeof data.status === 'string' ? data.status : 'pending',
    approvals: Array.isArray(data.approvals) ? data.approvals as ChildStoredApproval[] : [],
    runState: typeof data.runState === 'string' ? data.runState : '',
  };
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      return;
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Poll the child pause row until the realtor's decision lands, then claim
 * the row so a stale-waiter takeover cannot also continue the child.
 */
export async function waitForChildApprovalDecision(input: {
  pausedRunId: string;
  spaceId: string;
  signal: AbortSignal;
  onHeartbeat?: () => void;
}): Promise<ChildApprovalDecision | { lostClaim: true; result?: { ok: boolean; summary: string } } | null> {
  const started = Date.now();
  while (!input.signal.aborted) {
    if (Date.now() - started > CHILD_APPROVAL_MAX_WAIT_MS) return null;
    input.onHeartbeat?.();
    await heartbeatChildPausedRun({
      pausedRunId: input.pausedRunId,
      spaceId: input.spaceId,
    });
    const row = await loadChildPausedRow({
      pausedRunId: input.pausedRunId,
      spaceId: input.spaceId,
    });
    if (row) {
      const finished = unwrapChildResult(row.runState);
      if (finished) return { lostClaim: true, result: finished };
      const decision = readChildDecision(row.approvals);
      if (decision) {
        const claimed = await claimChildPausedRun({
          pausedRunId: input.pausedRunId,
          spaceId: input.spaceId,
        });
        if (!claimed) {
          const again = await loadChildPausedRow({
            pausedRunId: input.pausedRunId,
            spaceId: input.spaceId,
          });
          return {
            lostClaim: true,
            result: again ? unwrapChildResult(again.runState) ?? undefined : undefined,
          };
        }
        return decision;
      }
    }
    try {
      await sleep(CHILD_APPROVAL_POLL_MS, input.signal);
    } catch {
      return null;
    }
  }
  return null;
}

export function childDecisionToApproval(decision: ChildApprovalDecision): ApprovalDecision {
  return decision.approved
    ? { approved: true }
    : { approved: false, message: decision.message };
}

/** After a dead waiter, stream the specialist briefing as its own SSE turn. */
export function streamChildTakeoverBriefing(input: {
  conversationId: string;
  spaceId: string;
  summary: string;
  ok: boolean;
}): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let turnDone!: () => void;
      const turnDonePromise = new Promise<void>((resolve) => {
        turnDone = resolve;
      });
      try {
        after(() => turnDonePromise);
      } catch {
        /* tests / workers */
      }
      const nextSeq = createSeqCounter();
      const push = (event: PushableEvent) => {
        controller.enqueue(encodeEvent({
          ...event,
          seq: nextSeq(),
          ts: new Date().toISOString(),
        } as AgentEvent));
      };
      try {
        push({ type: 'status', label: 'Specialist finishing…' });
        if (input.summary) {
          push({ type: 'text_delta', delta: input.summary });
        }
        if (input.conversationId) {
          try {
            await saveAssistantMessage({
              spaceId: input.spaceId,
              conversationId: input.conversationId,
              blocks: [{ type: 'text', content: input.summary }],
            });
          } catch (err) {
            logger.warn('[delegate-child] takeover persist failed', {
              spaceId: input.spaceId,
            }, err);
          }
        }
        if (!input.ok) {
          push({ type: 'error', message: input.summary, code: 'internal' });
        }
        push({ type: 'turn_complete', reason: input.ok ? 'complete' : 'aborted' });
      } finally {
        turnDone();
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}
