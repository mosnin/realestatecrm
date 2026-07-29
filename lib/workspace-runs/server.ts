import 'server-only';
import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { inngest } from '@/lib/inngest/client';
import type { WorkspaceRunTaskPlanStep, WorkspaceRunTaskView, WorkspaceRunView } from './types';
import { getObjectText } from '@/lib/storage';
import { rankWorkspaceComparisons, selectWorkspaceTarget, type WorkspaceProperty } from './packet';

const MAX_GOAL = 1_000;
const LAUNCH_LEASE_MS = 120_000;
const MAX_TASK_FILES = 16;
const MAX_TASK_FILE_BYTES = 32_000;
function cell(value: unknown): string { return typeof value === 'string' || typeof value === 'number' ? String(value).replace(/[\r\n,]/g, ' ').slice(0, 180) : ''; }
function evidence(value: unknown): string { if (!value) return 'No property analysis was available.'; const raw = typeof value === 'string' ? value : JSON.stringify(value); const urls = raw.match(/https?:\/\/[^\s"']+/g)?.slice(0, 4) ?? []; return `${raw.replace(/\s+/g, ' ').slice(0, 700)}${urls.length ? ` Sources: ${urls.join(', ')}` : ''}`; }
async function preparePacket(spaceId: string, goal: string) {
  const [{ data: space }, { data: properties }] = await Promise.all([
    supabase.from('Space').select('name').eq('id', spaceId).maybeSingle(),
    supabase.from('Property').select('*').eq('spaceId', spaceId).order('updatedAt', { ascending: false }).limit(50),
  ]);
  const sourceRows = (properties ?? []) as WorkspaceProperty[];
  const target = selectWorkspaceTarget(goal, sourceRows);
  const comparisons = rankWorkspaceComparisons(target, sourceRows);
  const targetLabel = target ? `${cell(target.address)}${target.mlsNumber ? ` (MLS ${cell(target.mlsNumber)})` : ''}` : 'Unresolved target — review the candidate comparison set.';
  const propertyNotes = comparisons.length ? comparisons.map(({ row, basis }) => `- ${cell(row.address)}${row.city ? `, ${cell(row.city)}` : ''} — ${basis}`).join('\n') : '- No tenant-scoped comparison candidates were available.';
  const rows = comparisons.map(({ row }) => ({ address: cell(row.address), city: cell(row.city), state: cell(row.stateRegion), price: cell(row.listPrice ?? row.price), status: cell(row.listingStatus) }));
  return {
    brief: `# Listing Intelligence Brief\n\n**Workspace:** ${cell(space?.name) || 'Chippy'}\n\n**Objective:** ${goal}\n\n## Target selection\n${targetLabel}\n\n## Candidate comparison basis\n${propertyNotes}\n\n## Available evidence\n${evidence(target?.analysis ?? target?.areaReport)}\n\n## Decision frame\nConfirm the target property, pricing narrative, required disclosures, and launch owner before external publication.\n`,
    checklist: `# Launch Checklist\n\n- Confirm target listing facts, disclosures, and seller approval\n- Verify media rights, photography, and public-facing copy\n- Review pricing narrative against current comparable evidence\n- Assign launch owner and approval checkpoint\n- Schedule communications only after explicit approval\n`,
    comps: `address,city,state,list_price,status\n${rows.map((row) => [row.address,row.city,row.state,row.price,row.status].map((v) => `"${v.replace(/"/g,'""')}"`).join(',')).join('\n')}\n`,
    handoff: `# Handoff\n\nThis packet was prepared from the tenant-scoped Chippy workspace context for: ${goal}\n\nNo CRM records, messages, listings, or external systems were changed. Verify factual data and approve any action before publishing.\n`,
  };
}
export async function createWorkspaceRun(input: { id: string; workSessionId: string; spaceId: string; goal: string }) {
  const { data, error } = await supabase.from('WorkspaceRun').insert({ id: input.id, workSessionId: input.workSessionId, spaceId: input.spaceId, goal: input.goal.slice(0, MAX_GOAL) }).select('*').maybeSingle();
  if (data) return data;
  if (error && error.code !== '23505') throw error;
  const { data: existing, error: lookupError } = await supabase.from('WorkspaceRun').select('*').eq('workSessionId', input.workSessionId).eq('spaceId', input.spaceId).single();
  if (!existing) throw lookupError ?? new Error('workspace run was not persisted'); return existing;
}
export async function getWorkspaceRun(runId: string, spaceId: string): Promise<WorkspaceRunView | null> {
  const { data: run } = await supabase.from('WorkspaceRun').select('*').eq('id', runId).eq('spaceId', spaceId).maybeSingle(); if (!run) return null;
  const [{ data: events }, { data: files }, { data: taskRows }] = await Promise.all([supabase.from('WorkspaceRunEvent').select('*').eq('runId', runId).order('sequence').limit(100), supabase.from('WorkspaceRunFile').select('*').eq('runId', runId).eq('spaceId', spaceId).order('createdAt').limit(16), supabase.from('WorkspaceRunTask').select('*').eq('runId', runId).eq('spaceId', spaceId).order('sequence').limit(12)]);
  const tasks = await hydrateWorkspaceTasks(taskRows ?? [], spaceId);
  // A partially published packet is never a deliverable. The terminal RPC is
  // the only authority allowed to expose the manifest.
  return { ...run, events: events ?? [], files: run.status === 'completed' ? files ?? [] : [], tasks } as WorkspaceRunView;
}

async function hydrateWorkspaceTasks(rows: any[], spaceId: string): Promise<WorkspaceRunTaskView[]> {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const [{ data: events }, { data: files }] = await Promise.all([
    supabase.from('WorkspaceRunTaskEvent').select('*').in('taskId', ids).order('sequence').limit(120),
    supabase.from('WorkspaceRunTaskFile').select('*').in('taskId', ids).eq('spaceId', spaceId).order('createdAt').limit(24),
  ]);
  return rows.map((row) => ({
    ...row,
    commandPlan: Array.isArray(row.commandPlan) ? row.commandPlan : [],
    events: (events ?? []).filter((event: any) => event.taskId === row.id),
    files: row.status === 'completed' ? (files ?? []).filter((file: any) => file.taskId === row.id) : [],
  })) as WorkspaceRunTaskView[];
}

export function planWorkspaceRunTask(instruction: string): WorkspaceRunTaskPlanStep[] {
  const summary = instruction.replace(/\s+/g, ' ').trim().slice(0, 180);
  return [
    { command: 'python /workspace/continue_workspace.py --inspect', description: 'Inspect the current private workspace files.' },
    { command: 'python /workspace/continue_workspace.py --apply', description: `Apply: ${summary}` },
    { command: 'python /workspace/continue_workspace.py --validate', description: 'Validate and package the private follow-up file.' },
  ];
}

export async function enqueueWorkspaceRunTask(input: { runId: string; spaceId: string; taskId: string; idempotencyKey: string; instruction: string; commandPlan: WorkspaceRunTaskPlanStep[] }) {
  const { data, error } = await supabase.rpc('enqueue_workspace_run_task', {
    p_run_id: input.runId, p_space_id: input.spaceId, p_task_id: input.taskId,
    p_idempotency_key: input.idempotencyKey, p_instruction: input.instruction,
    p_command_plan: input.commandPlan,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.taskId) throw new Error('Workspace continuation is unavailable.');
  return { taskId: String(row.taskId), created: row.created === true, status: String(row.status) };
}

async function workspaceTaskFiles(runId: string, spaceId: string): Promise<Array<{ name: string; content: string }>> {
  const { data: completedTasks } = await supabase.from('WorkspaceRunTask').select('id').eq('runId', runId).eq('spaceId', spaceId).eq('status', 'completed').limit(MAX_TASK_FILES);
  const taskIds = (completedTasks ?? []).map((task: any) => task.id);
  const taskFileQuery = taskIds.length
    ? supabase.from('WorkspaceRunTaskFile').select('name,fileId').eq('spaceId', spaceId).in('taskId', taskIds).order('createdAt').limit(MAX_TASK_FILES)
    : Promise.resolve({ data: [] as any[] });
  const [{ data: rootFiles }, { data: taskFiles }] = await Promise.all([
    supabase.from('WorkspaceRunFile').select('name,fileId').eq('runId', runId).eq('spaceId', spaceId).order('createdAt').limit(MAX_TASK_FILES),
    taskFileQuery,
  ]);
  const rows = [...(rootFiles ?? []), ...(taskFiles ?? [])].filter((row: any) => typeof row.fileId === 'string').slice(0, MAX_TASK_FILES);
  if (!rows.length) throw new Error('The completed workspace has no private files to continue.');
  const ids = [...new Set(rows.map((row: any) => row.fileId))];
  const { data: objects, error } = await supabase.from('File').select('id,name,storageKey,sizeBytes').in('id', ids).eq('spaceId', spaceId).limit(MAX_TASK_FILES);
  if (error) throw error;
  const byId = new Map((objects ?? []).map((file: any) => [file.id, file]));
  const result: Array<{ name: string; content: string }> = [];
  for (const row of rows) {
    const file = byId.get(row.fileId) as any;
    if (!file || typeof file.storageKey !== 'string' || !Number.isInteger(file.sizeBytes) || file.sizeBytes < 0 || file.sizeBytes > MAX_TASK_FILE_BYTES) throw new Error('Workspace file manifest is unsafe.');
    const name = String(row.name ?? '');
    if (!/^(brief\.md|launch-checklist\.md|comps\.csv|handoff\.md|workspace-follow-up-[1-9][0-9]*\.md)$/.test(name)) throw new Error('Workspace file manifest is unsafe.');
    const content = await getObjectText(file.storageKey);
    if (Buffer.byteLength(content, 'utf8') > MAX_TASK_FILE_BYTES) throw new Error('Workspace file is too large to continue safely.');
    result.push({ name, content });
  }
  return result;
}

export async function dispatchWorkspaceRunTask(input: { taskId: string; runId: string; spaceId: string }): Promise<void> {
  const launchToken = crypto.randomUUID();
  const { data: claimed, error: claimError } = await supabase.rpc('claim_workspace_run_task_launch', { p_task_id: input.taskId, p_space_id: input.spaceId, p_token: launchToken });
  if (claimError) throw claimError;
  if (!claimed) {
    const { data: pending } = await supabase.from('WorkspaceRunTask').select('status,launchToken').eq('id', input.taskId).eq('spaceId', input.spaceId).maybeSingle();
    if (pending?.status === 'launching' && pending.launchToken) await scheduleWorkspaceTaskRecovery(input.taskId, input.runId, input.spaceId, pending.launchToken);
    return;
  }
  let task: any; let files: Array<{ name: string; content: string }>;
  try {
    const resolved = await Promise.all([
      supabase.from('WorkspaceRunTask').select('sequence,instruction,commandPlan').eq('id', input.taskId).eq('spaceId', input.spaceId).maybeSingle(),
      workspaceTaskFiles(input.runId, input.spaceId),
    ]);
    task = resolved[0].data; files = resolved[1];
  } catch (error) {
    await markWorkspaceTaskTerminal(input, 'failed', error instanceof Error ? error.message.slice(0, 1000) : 'Workspace continuation could not load its private files.');
    return;
  }
  if (!task) { await markWorkspaceTaskTerminal(input, 'failed', 'Workspace continuation is unavailable.'); return; }
  const endpoint = process.env.MODAL_WORKSPACE_RUN_TASK_URL; const secret = process.env.CHIPPI_WORKSPACE_MODAL_SECRET;
  if (!endpoint || !secret) { await markWorkspaceTaskTerminal(input, 'failed', 'Workspace continuation runtime is not configured.'); return; }
  let url: URL; try { url = new URL(endpoint); } catch { await markWorkspaceTaskTerminal(input, 'failed', 'Workspace continuation runtime URL is invalid.'); return; }
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.modal.run')) { await markWorkspaceTaskTerminal(input, 'failed', 'Workspace continuation runtime URL is invalid.'); return; }
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-chippy-workspace-request': crypto.createHash('sha256').update(input.taskId).digest('hex') }, body: JSON.stringify({ secret, task_id: input.taskId, run_id: input.runId, space_id: input.spaceId, task_sequence: task.sequence, instruction: task.instruction, command_plan: task.commandPlan, files, launch_token: launchToken }), signal: AbortSignal.timeout(10_000) });
    if (response.status !== 202) await markWorkspaceTaskTerminal(input, 'failed', `Workspace continuation runtime rejected launch (${response.status}).`);
  } catch (error) { logger.error('[workspace-run-task] Modal launch outcome is unknown; lease recovery will decide', { taskId: input.taskId }, error); }
  await scheduleWorkspaceTaskRecovery(input.taskId, input.runId, input.spaceId, launchToken);
}

export async function scheduleWorkspaceTaskRecovery(taskId: string, runId: string, spaceId: string, launchToken: string): Promise<void> {
  await inngest.send({ id: `workspace-task-recovery:${taskId}:${launchToken}`, name: 'workspace-run-task/execute', ts: Date.now() + LAUNCH_LEASE_MS + 5_000, data: { taskId, runId, spaceId } });
}
export async function markWorkspaceTaskTerminal(input: { taskId: string; spaceId: string }, status: 'failed' | 'completed' | 'cancelled', error: string | null) {
  await supabase.rpc('finish_workspace_run_task', { p_task_id: input.taskId, p_space_id: input.spaceId, p_outcome: status, p_error: error });
}

/** The enqueue commit precedes dispatch. Inngest closes that crash window;
 * previews use Next's request-lifetime continuation with the identical claim. */
export async function kickWorkspaceRunTask(input: { taskId: string; runId: string; spaceId: string }): Promise<void> {
  if (process.env.INNGEST_EVENT_KEY) {
    await inngest.send({ id: `workspace-run-task:${input.taskId}`, name: 'workspace-run-task/execute', data: input });
    return;
  }
  const { after } = await import('next/server');
  after(async () => { await dispatchWorkspaceRunTask(input); });
}
export async function requestWorkspaceRunCancellation(runId: string, spaceId: string): Promise<boolean> {
  const { data: run, error: lookupError } = await supabase.from('WorkspaceRun').select('workSessionId').eq('id', runId).eq('spaceId', spaceId).maybeSingle();
  if (lookupError || !run) return false;
  const { data, error } = await supabase.rpc('cancel_workspace_run_and_session', { p_session_id: run.workSessionId, p_space_id: spaceId });
  if (error) throw error; return data === true;
}
/** Awaited acceptance: callers never report a started workspace before Modal returns HTTP acceptance. */
export async function dispatchWorkspaceRun(input: { runId: string; spaceId: string; workSessionId: string; goal: string; answer?: string | null }): Promise<void> {
  // Atomic launch fence: only the queued winner is allowed to contact Modal.
  // Retried Inngest execution sees launching/running and reuses that run.
  const launchToken = crypto.randomUUID();
  const { data: claimed, error: claimError } = await supabase.rpc('claim_workspace_launch', { p_run_id: input.runId, p_space_id: input.spaceId, p_token: launchToken });
  if (claimError) throw claimError;
  if (!claimed) {
    // A prior delivery may have claimed the lease but crashed before queuing
    // recovery. Repair that precise send window using its durable token.
    const { data: pending, error: pendingError } = await supabase.from('WorkspaceRun').select('status,launchToken').eq('id', input.runId).eq('spaceId', input.spaceId).maybeSingle();
    if (pendingError) throw pendingError;
    if (pending?.status === 'launching' && pending.launchToken) await scheduleWorkspaceLaunchRecovery(input.workSessionId, input.runId, pending.launchToken);
    return;
  }
  const endpoint = process.env.MODAL_WORKSPACE_RUN_URL; const secret = process.env.CHIPPI_WORKSPACE_MODAL_SECRET;
  if (!endpoint || !secret) { await markWorkspaceTerminal(input, 'failed', 'Workspace runtime is not configured.'); return; }
  let url: URL; try { url = new URL(endpoint); } catch { await markWorkspaceTerminal(input, 'failed', 'Workspace runtime URL is invalid.'); return; }
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.modal.run')) { await markWorkspaceTerminal(input, 'failed', 'Workspace runtime URL is invalid.'); return; }
  const requestId = crypto.createHash('sha256').update(input.runId).digest('hex');
  try {
    const resolvedGoal = [input.goal, input.answer ? `Property clarification: ${input.answer}` : ''].filter(Boolean).join('\n');
    const packet = await preparePacket(input.spaceId, resolvedGoal);
    const response = await fetch(url, { method: 'POST', headers: { 'content-type':'application/json','x-chippy-workspace-request': requestId }, body: JSON.stringify({ secret, run_id: input.runId, space_id: input.spaceId, work_session_id: input.workSessionId, goal: resolvedGoal.slice(0, MAX_GOAL), packet, launch_token: launchToken }), signal: AbortSignal.timeout(10_000) });
    if (response.status !== 202) {
      await markWorkspaceTerminal(input, 'failed', `Workspace runtime rejected launch (${response.status}).`);
      return;
    }
  } catch (error) {
    logger.error('[workspace-run] Modal launch outcome is unknown; lease recovery will decide', { runId: input.runId }, error);
  }
  // A 202 only proves the acceptor replied. It can still crash before its
  // spawned worker emits callbacks, so every launch has this same recovery.
  // If this send throws, an Inngest retry reaches the !claimed repair above.
  await scheduleWorkspaceLaunchRecovery(input.workSessionId, input.runId, launchToken);
}

export async function scheduleWorkspaceLaunchRecovery(sessionId: string, runId: string, launchToken: string): Promise<void> {
  const at = Date.now() + LAUNCH_LEASE_MS + 5_000;
  await inngest.send({ id: `workspace-launch-recovery:${runId}:${launchToken}`, name: 'work-session/execute', ts: at, data: { sessionId, workspaceRunId: runId, reason: 'launch_lease_recovery' } });
}
export async function markWorkspaceTerminal(input: { runId: string; spaceId: string; workSessionId: string }, status: 'failed' | 'completed' | 'cancelled', error: string | null) {
  await supabase.rpc('finish_workspace_run_and_session', { p_run_id: input.runId, p_space_id: input.spaceId, p_outcome: status, p_error: error });
}
