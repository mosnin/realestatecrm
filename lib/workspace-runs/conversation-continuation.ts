import 'server-only';
import crypto from 'node:crypto';
import { supabase } from '@/lib/supabase';
import { isWorkspaceRunFollowUpsEnabledForSpace } from '@/lib/chippi/workspace-run-flag';
import { enqueueWorkspaceRunTask, findWorkspaceRunTaskByIdempotency, getWorkspaceRun, kickWorkspaceRunTask, planWorkspaceRunTask, workspaceTaskFiles } from './server';

export type WorkspaceContinuation =
  | { ok: true; runId: string; taskId: string; status: string; reused: boolean }
  | { ok: false; code: 'not_found' | 'not_completed' | 'active' | 'conflict' | 'planning_unavailable' | 'failed'; error: string };

export type ConversationContinuation =
  | WorkspaceContinuation
  | { ok: false; code: 'disabled'; error: string };

function normalizedInstruction(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 1000);
}

/** A persisted message id distinguishes intentional repeated chat turns. */
export function chatContinuationIdempotencySeed(messageId: string): string {
  return `chat:${messageId}`;
}

function isIdempotencyConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null &&
    typeof (error as { message?: unknown }).message === 'string' &&
    (error as { message: string }).message.includes('workspace continuation idempotency conflict');
}

async function completedRunForConversation(spaceId: string, conversationId: string): Promise<{ id: string } | null> {
  const { data: sessions } = await supabase.from('WorkSession').select('workspaceRunId').eq('spaceId', spaceId).eq('conversationId', conversationId).eq('kind', 'workspace').order('createdAt', { ascending: false }).limit(20);
  const ids = (sessions ?? []).map((row: any) => row.workspaceRunId).filter((id: unknown): id is string => typeof id === 'string');
  if (!ids.length) return null;
  const { data: runs } = await supabase.from('WorkspaceRun').select('id').eq('spaceId', spaceId).in('id', ids).eq('status', 'completed');
  const completed = new Set((runs ?? []).map((run: any) => run.id));
  return ids.map((id) => completed.has(id) ? { id } : null).find(Boolean) ?? null;
}

export async function isConversationWorkspaceContinuationEligible(spaceId: string, conversationId: string | null): Promise<boolean> {
  return Boolean(conversationId && isWorkspaceRunFollowUpsEnabledForSpace(spaceId) && await completedRunForConversation(spaceId, conversationId));
}

/** One tenant-scoped, completed-run, idempotent enqueue seam for every UI. */
export async function continueCompletedWorkspaceRun(input: { spaceId: string; runId: string; instruction: string; idempotencyKey: string }): Promise<WorkspaceContinuation> {
  const instruction = normalizedInstruction(input.instruction);
  if (instruction.length < 3) return { ok: false, code: 'failed', error: 'Describe what to continue in a few words.' };
  const view = await getWorkspaceRun(input.runId, input.spaceId);
  if (!view) return { ok: false, code: 'not_found', error: 'Workspace is unavailable.' };
  if (view.status !== 'completed') return { ok: false, code: 'not_completed', error: 'Only completed workspaces can be continued.' };
  const existing = await findWorkspaceRunTaskByIdempotency(input.runId, input.spaceId, input.idempotencyKey);
  if (existing) {
    if (normalizedInstruction(existing.instruction) !== instruction) return { ok: false, code: 'conflict', error: 'This continuation key was already used for a different request.' };
    if (existing.status === 'queued') await kickWorkspaceRunTask({ taskId: existing.id, runId: input.runId, spaceId: input.spaceId });
    return { ok: true, runId: input.runId, taskId: existing.id, status: existing.status, reused: true };
  }
  if (view.tasks.some((task) => ['queued', 'launching', 'running'].includes(task.status))) return { ok: false, code: 'active', error: 'A workspace continuation is already running.' };
  try {
    const files = await workspaceTaskFiles(input.runId, input.spaceId);
    const planned = await planWorkspaceRunTask({ instruction, files });
    const task = await enqueueWorkspaceRunTask({ runId: input.runId, spaceId: input.spaceId, taskId: crypto.randomUUID(), idempotencyKey: input.idempotencyKey, instruction, commandPlan: planned.commandPlan, executionPlan: planned.executionPlan });
    if (task.created || task.status === 'queued') await kickWorkspaceRunTask({ taskId: task.taskId, runId: input.runId, spaceId: input.spaceId });
    return { ok: true, runId: input.runId, taskId: task.taskId, status: task.status, reused: !task.created };
  } catch (error) {
    if (isIdempotencyConflict(error)) return { ok: false, code: 'conflict', error: 'This continuation key was already used for a different request.' };
    const message = error instanceof Error ? error.message : '';
    if (message.includes('No LLM key') || message.includes('planning')) return { ok: false, code: 'planning_unavailable', error: 'Workspace continuation planning is unavailable. Try again shortly.' };
    if (message.includes('already active')) return { ok: false, code: 'active', error: 'A workspace continuation is already running.' };
    return { ok: false, code: 'failed', error: 'Could not start the workspace continuation.' };
  }
}

export async function continueWorkspaceForConversation(input: { spaceId: string; conversationId: string; instruction: string; idempotencySeed: string }): Promise<ConversationContinuation> {
  if (!isWorkspaceRunFollowUpsEnabledForSpace(input.spaceId)) return { ok: false, code: 'disabled', error: 'Workspace continuation is not enabled for this workspace.' };
  const run = await completedRunForConversation(input.spaceId, input.conversationId);
  if (!run) return { ok: false, code: 'not_completed', error: 'There is no completed workspace in this conversation to continue.' };
  const key = crypto.createHash('sha256').update(['workspace-conversation-continuation-v1', input.spaceId, input.conversationId, input.idempotencySeed].join('\0')).digest('base64url').slice(0, 64);
  return continueCompletedWorkspaceRun({ spaceId: input.spaceId, runId: run.id, instruction: input.instruction, idempotencyKey: key });
}
