import 'server-only';
import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { inngest } from '@/lib/inngest/client';
import { enqueueWorkerTask } from '@/lib/queue';
import type { WorkspaceRunTaskPlanStep, WorkspaceRunTaskView, WorkspaceRunView } from './types';
import { getObjectText } from '@/lib/storage';
import { getLLMClient, resolveChatModel } from '@/lib/llm';
import { rankWorkspaceComparisons, selectWorkspaceTarget, type WorkspaceProperty } from './packet';
import { commandPlanForPersistedWorkspaceTask, commandPlanForWorkspaceTask, isSafeWorkspaceInputName, type WorkspaceTaskExecutionPlan, validatePersistedWorkspaceTaskPlan, validateWorkspaceTaskPlan } from './typed-plan';
import {
  isWorkspaceRunRecoveryEnabled,
  isWorkspaceRunsEnabledForSpace,
} from '@/lib/chippi/workspace-run-flag';
import { tenantTable } from '@/lib/tenant-db';

const MAX_GOAL = 1_000;
const LAUNCH_LEASE_MS = 120_000;
const MAX_TASK_FILES = 16;
const MAX_TASK_FILE_BYTES = 32_000;
const TASK_PLAN_LEASE_SECONDS = 180;
const RECOVERY_DELAY_SECONDS = Math.ceil((LAUNCH_LEASE_MS + 5_000) / 1_000);
const TASK_ACCEPTED_SILENCE_MS = 5 * 60_000;
// The RPC owns the fixed threshold; this queue margin prevents normal clock
// and provider-response skew from waking before five accepted minutes elapsed.
const TASK_ACCEPTED_SILENCE_DELAY_SECONDS = Math.ceil(
  (TASK_ACCEPTED_SILENCE_MS + 30_000) / 1_000,
);
function workerConfigured(): boolean {
  return Boolean(process.env.WORKER_URL?.trim() && process.env.WORKER_SECRET?.trim());
}
function inngestConfigured(): boolean {
  return Boolean(
    process.env.INNGEST_EVENT_KEY?.trim() &&
      process.env.INNGEST_SIGNING_KEY?.trim(),
  );
}
async function enqueueWorkspaceTask(task: string, payload: unknown, delaySeconds?: number): Promise<void> {
  const accepted = delaySeconds === undefined
    ? await enqueueWorkerTask(task, payload)
    : await enqueueWorkerTask(task, payload, { delaySeconds });
  if (!accepted) throw new Error(`Cloudflare queue did not accept ${task}`);
}
function cell(value: unknown): string { return typeof value === 'string' || typeof value === 'number' ? String(value).replace(/[\r\n,]/g, ' ').slice(0, 180) : ''; }
function evidence(value: unknown): string { if (!value) return 'No property analysis was available.'; const raw = typeof value === 'string' ? value : JSON.stringify(value); const urls = raw.match(/https?:\/\/[^\s"']+/g)?.slice(0, 4) ?? []; return `${raw.replace(/\s+/g, ' ').slice(0, 700)}${urls.length ? ` Sources: ${urls.join(', ')}` : ''}`; }
async function preparePacket(spaceId: string, goal: string) {
  const [spaceResult, propertiesResult] = await Promise.all([
    supabase.from('Space').select('name').eq('id', spaceId).maybeSingle(),
    tenantTable(supabase, 'Property', { spaceId }).select('*').order('updatedAt', { ascending: false }).limit(50),
  ]);
  if (spaceResult.error) throw spaceResult.error;
  if (propertiesResult.error) throw propertiesResult.error;
  const space = spaceResult.data;
  const properties = propertiesResult.data;
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
  const { data, error } = await tenantTable(supabase, 'WorkspaceRun', { spaceId: input.spaceId }).insert({ id: input.id, workSessionId: input.workSessionId, spaceId: input.spaceId, goal: input.goal.slice(0, MAX_GOAL) }).select('*').maybeSingle();
  if (data) return data;
  if (error && error.code !== '23505') throw error;
  const { data: existing, error: lookupError } = await tenantTable(supabase, 'WorkspaceRun', { spaceId: input.spaceId }).select('*').eq('workSessionId', input.workSessionId).single();
  if (!existing) throw lookupError ?? new Error('workspace run was not persisted'); return existing;
}
export async function getWorkspaceRun(runId: string, spaceId: string): Promise<WorkspaceRunView | null> {
  const { data: run, error: runError } = await tenantTable(supabase, 'WorkspaceRun', { spaceId }).select('*').eq('id', runId).maybeSingle();
  if (runError) throw runError;
  if (!run) return null;
  const receiptQuery = isWorkspaceRunRecoveryEnabled() && isWorkspaceRunsEnabledForSpace(spaceId)
    ? tenantTable(supabase, 'WorkspaceRunLaunchReceipt', { spaceId }).select('attempt,state,reason,createdAt').eq('runId', runId).order('createdAt', { ascending: false }).limit(3)
    : Promise.resolve({ data: [], error: null });
  const [eventResult, fileResult, taskResult, receiptResult] = await Promise.all([
    supabase.from('WorkspaceRunEvent').select('*').eq('runId', runId).order('sequence').limit(100),
    tenantTable(supabase, 'WorkspaceRunFile', { spaceId }).select('*').eq('runId', runId).order('createdAt', { ascending: false }).limit(16),
    tenantTable(supabase, 'WorkspaceRunTask', { spaceId }).select('id,sequence,instruction,commandPlan,executionPlan,status,output,error,cancellationRequestedAt,createdAt').eq('runId', runId).order('sequence', { ascending: false }).limit(12),
    receiptQuery,
  ]);
  const dependencyError = eventResult.error ?? fileResult.error ?? taskResult.error ?? receiptResult.error;
  if (dependencyError) throw dependencyError;
  const events = eventResult.data;
  const files = fileResult.data;
  const taskRows = taskResult.data;
  const launchReceipts = receiptResult.data;
  const tasks = await hydrateWorkspaceTasks(taskRows ?? [], spaceId);
  // A partially published packet is never a deliverable. The terminal RPC is
  // the only authority allowed to expose the manifest.
  return { ...run, events: events ?? [], files: run.status === 'completed' ? files ?? [] : [], tasks, launchReceipts: launchReceipts ?? [] } as WorkspaceRunView;
}

async function hydrateWorkspaceTasks(rows: any[], spaceId: string): Promise<WorkspaceRunTaskView[]> {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const [{ data: events }, { data: files }] = await Promise.all([
    supabase.from('WorkspaceRunTaskEvent').select('*').in('taskId', ids).order('createdAt', { ascending: false }).limit(120),
    tenantTable(supabase, 'WorkspaceRunTaskFile', { spaceId }).select('*').in('taskId', ids).order('createdAt', { ascending: false }).limit(24),
  ]);
  return rows.map((row) => ({
    ...row,
    commandPlan: Array.isArray(row.commandPlan) ? row.commandPlan : [],
    operations: Array.isArray(row.executionPlan?.operations) ? row.executionPlan.operations.filter((operation: unknown): operation is { id: string; type: 'grounded_markdown_report' | 'comps_csv_projection' | 'json_action_register' } => {
      if (!operation || typeof operation !== 'object') return false;
      const candidate = operation as { id?: unknown; type?: unknown };
      return typeof candidate.id === 'string' && ['grounded_markdown_report', 'comps_csv_projection', 'json_action_register'].includes(String(candidate.type));
    }).map((operation: { id: string; type: 'grounded_markdown_report' | 'comps_csv_projection' | 'json_action_register' }) => ({ id: operation.id, type: operation.type })) : [],
    events: (events ?? []).filter((event: any) => event.taskId === row.id).sort((a: any, b: any) => a.sequence - b.sequence),
    files: row.status === 'completed' ? (files ?? []).filter((file: any) => file.taskId === row.id) : [],
  })) as WorkspaceRunTaskView[];
}

export { validateWorkspaceTaskPlan } from './typed-plan';
const TASK_PLAN_PROMPT = `You create a bounded private workspace continuation plan. Return ONLY JSON with keys summary, title, evidence, nextSteps, operations. evidence must be 1-3 exact verbatim quotes from supplied private files, each as {"file":"exact supplied filename","quote":"exact text from that file"}. nextSteps must be 1-5 short grounded recommendations. operations must contain 2-3 unique entries selected only from: {"id":"report","type":"grounded_markdown_report"}; {"id":"comps","type":"comps_csv_projection","source":"comps.csv","columns":["exact header"],"sort":{"column":"selected header","direction":"asc"},"rowLimit":1}; {"id":"actions","type":"json_action_register"}. Include the CSV operation only when comps.csv is supplied. Do not invent facts, code, commands, paths, or operation types. The fixed isolated interpreter revalidates the plan.`;

export async function findWorkspaceRunTaskByIdempotency(runId: string, spaceId: string, idempotencyKey: string): Promise<{ id: string; status: string; instruction: string } | null> {
  const { data } = await tenantTable(supabase, 'WorkspaceRunTask', { spaceId }).select('id,status,instruction').eq('runId', runId).eq('idempotencyKey', idempotencyKey).maybeSingle();
  return data as { id: string; status: string; instruction: string } | null;
}

export type WorkspaceRunTaskPlanReservation =
  | { state: 'claimed'; planningToken: string }
  | { state: 'pending' }
  | { state: 'existing'; taskId: string; status: string; instruction: string };

/** Atomically reserves the billable planning turn before private file loading
 * or model invocation. The database serializes this with final task enqueue. */
export async function reserveWorkspaceRunTaskPlan(input: {
  runId: string;
  spaceId: string;
  idempotencyKey: string;
  instruction: string;
}): Promise<WorkspaceRunTaskPlanReservation> {
  const planningToken = crypto.randomUUID();
  const { data, error } = await supabase.rpc('reserve_workspace_run_task_plan', {
    p_run_id: input.runId,
    p_space_id: input.spaceId,
    p_idempotency_key: input.idempotencyKey,
    p_instruction: input.instruction,
    p_planning_token: planningToken,
    p_lease_seconds: TASK_PLAN_LEASE_SECONDS,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (row?.state === 'claimed' && row.planningToken === planningToken) {
    return { state: 'claimed', planningToken };
  }
  if (row?.state === 'pending') return { state: 'pending' };
  if (row?.state === 'existing' && row.taskId && row.status && row.instruction) {
    return {
      state: 'existing',
      taskId: String(row.taskId),
      status: String(row.status),
      instruction: String(row.instruction),
    };
  }
  throw new Error('Workspace continuation planning reservation is unavailable.');
}

/** Releases only the current planning token. The durable claim row remains so
 * the same idempotency key cannot be repurposed for another instruction. */
export async function releaseWorkspaceRunTaskPlan(input: {
  runId: string;
  spaceId: string;
  idempotencyKey: string;
  planningToken: string;
}): Promise<boolean> {
  const { data, error } = await supabase.rpc('release_workspace_run_task_plan', {
    p_run_id: input.runId,
    p_space_id: input.spaceId,
    p_idempotency_key: input.idempotencyKey,
    p_planning_token: input.planningToken,
  });
  if (error) throw error;
  return data === true;
}

export async function planWorkspaceRunTask(input: { instruction: string; files: Array<{ name: string; content: string }> }): Promise<{ commandPlan: WorkspaceRunTaskPlanStep[]; executionPlan: WorkspaceTaskExecutionPlan }> {
  // Planning needs representative private context, not an unbounded prompt.
  // The fixed interpreter later reads the complete bounded files inside the VM.
  const source = input.files.slice(0, 6).map((file) => `--- ${file.name} ---\n${file.content.slice(0, 8_000)}`).join('\n');
  const llm = getLLMClient();
  const response = await llm.chat.completions.create({ model: resolveChatModel(), response_format: { type: 'json_object' }, temperature: 0.1, max_tokens: 1400, messages: [
    { role: 'system', content: TASK_PLAN_PROMPT },
    { role: 'user', content: `Instruction:\n${input.instruction}\n\nPrivate source files:\n${source}` },
  ] });
  let parsed: unknown; try { parsed = JSON.parse(response.choices[0]?.message?.content ?? ''); } catch { throw new Error('Workspace continuation planning returned unreadable output.'); }
  const executionPlan = validateWorkspaceTaskPlan(parsed, input.files);
  return { commandPlan: commandPlanForWorkspaceTask(executionPlan), executionPlan };
}

export async function enqueueWorkspaceRunTask(input: { runId: string; spaceId: string; taskId: string; idempotencyKey: string; instruction: string; commandPlan: WorkspaceRunTaskPlanStep[]; executionPlan: WorkspaceTaskExecutionPlan; planningToken: string }) {
  const { data, error } = await supabase.rpc('enqueue_reserved_workspace_run_task_with_plan', {
    p_run_id: input.runId, p_space_id: input.spaceId, p_task_id: input.taskId,
    p_idempotency_key: input.idempotencyKey, p_instruction: input.instruction,
    p_command_plan: input.commandPlan, p_execution_plan: input.executionPlan,
    p_planning_token: input.planningToken,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.taskId) throw new Error('Workspace continuation is unavailable.');
  return { taskId: String(row.taskId), created: row.created === true, status: String(row.status) };
}

export async function workspaceTaskFiles(runId: string, spaceId: string): Promise<Array<{ name: string; content: string }>> {
  const { data: completedTasks, error: completedTasksError } = await tenantTable(supabase, 'WorkspaceRunTask', { spaceId }).select('id').eq('runId', runId).eq('status', 'completed').order('sequence', { ascending: false }).limit(MAX_TASK_FILES);
  if (completedTasksError) throw completedTasksError;
  const taskIds = (completedTasks ?? []).map((task: any) => task.id);
  const taskFileQuery = taskIds.length
    ? tenantTable(supabase, 'WorkspaceRunTaskFile', { spaceId }).select('name,fileId').in('taskId', taskIds).order('createdAt', { ascending: false }).limit(MAX_TASK_FILES)
    : Promise.resolve({ data: [] as any[] });
  const [rootFileResult, taskFileResult] = await Promise.all([
    tenantTable(supabase, 'WorkspaceRunFile', { spaceId }).select('name,fileId').eq('runId', runId).order('createdAt', { ascending: false }).limit(MAX_TASK_FILES),
    taskFileQuery,
  ]);
  if (rootFileResult.error) throw rootFileResult.error;
  if ('error' in taskFileResult && taskFileResult.error) throw taskFileResult.error;
  const rootFiles = rootFileResult.data;
  const taskFiles = taskFileResult.data;
  const rows = [...(rootFiles ?? []), ...(taskFiles ?? [])].filter((row: any) => typeof row.fileId === 'string').slice(0, MAX_TASK_FILES);
  if (!rows.length) throw new Error('The completed workspace has no private files to continue.');
  const ids = [...new Set(rows.map((row: any) => row.fileId))];
  const { data: objects, error } = await tenantTable(supabase, 'File', { spaceId }).select('id,name,storageKey,sizeBytes').in('id', ids).limit(MAX_TASK_FILES);
  if (error) throw error;
  const byId = new Map((objects ?? []).map((file: any) => [file.id, file]));
  const result: Array<{ name: string; content: string }> = [];
  for (const row of rows) {
    const file = byId.get(row.fileId) as any;
    if (!file || typeof file.storageKey !== 'string' || !Number.isInteger(file.sizeBytes) || file.sizeBytes < 0 || file.sizeBytes > MAX_TASK_FILE_BYTES) throw new Error('Workspace file manifest is unsafe.');
    const name = String(row.name ?? '');
    if (!isSafeWorkspaceInputName(name)) throw new Error('Workspace file manifest is unsafe.');
    const content = await getObjectText(file.storageKey);
    if (Buffer.byteLength(content, 'utf8') > MAX_TASK_FILE_BYTES) throw new Error('Workspace file is too large to continue safely.');
    result.push({ name, content });
  }
  return result;
}

export async function dispatchWorkspaceRunTask(input: { taskId: string; runId: string; spaceId: string }): Promise<void> {
  const launchToken = crypto.randomUUID();
  const terminalInput = { taskId: input.taskId, spaceId: input.spaceId, launchToken };
  const { data: claimed, error: claimError } = await supabase.rpc('claim_workspace_run_task_launch', { p_task_id: input.taskId, p_space_id: input.spaceId, p_token: launchToken });
  if (claimError) throw claimError;
  if (!claimed) {
    const { data: pending, error: pendingError } = await tenantTable(supabase, 'WorkspaceRunTask', { spaceId: input.spaceId }).select('status,launchToken,modalAcceptedAt').eq('id', input.taskId).maybeSingle();
    if (pendingError) throw pendingError;
    if (pending?.status === 'launching' && pending.launchToken && !pending.modalAcceptedAt) {
      await scheduleWorkspaceTaskRecovery(input.taskId, input.runId, input.spaceId, pending.launchToken);
    }
    if ((pending?.status === 'launching' || pending?.status === 'running') && pending.launchToken) {
      await scheduleWorkspaceTaskAcceptedSilenceTimeout(input.taskId, input.spaceId, pending.launchToken);
    }
    return;
  }
  let task: any; let files: Array<{ name: string; content: string }>;
  try {
    const resolved = await Promise.all([
      tenantTable(supabase, 'WorkspaceRunTask', { spaceId: input.spaceId }).select('sequence,instruction,commandPlan,executionPlan').eq('id', input.taskId).maybeSingle(),
      workspaceTaskFiles(input.runId, input.spaceId),
    ]);
    if (resolved[0].error) throw resolved[0].error;
    task = resolved[0].data; files = resolved[1];
  } catch (error) {
    await markWorkspaceTaskTerminal(terminalInput, 'failed', error instanceof Error ? error.message.slice(0, 1000) : 'Workspace continuation could not load its private files.');
    return;
  }
  if (!task) { await markWorkspaceTaskTerminal(terminalInput, 'failed', 'Workspace continuation is unavailable.'); return; }
  const endpoint = process.env.MODAL_WORKSPACE_RUN_TASK_URL; const secret = process.env.CHIPPI_WORKSPACE_MODAL_SECRET;
  if (!endpoint || !secret) { await markWorkspaceTaskTerminal(terminalInput, 'failed', 'Workspace continuation runtime is not configured.'); return; }
  let url: URL; try { url = new URL(endpoint); } catch { await markWorkspaceTaskTerminal(terminalInput, 'failed', 'Workspace continuation runtime URL is invalid.'); return; }
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.modal.run')) { await markWorkspaceTaskTerminal(terminalInput, 'failed', 'Workspace continuation runtime URL is invalid.'); return; }
  let executionPlan: WorkspaceTaskExecutionPlan | import('./typed-plan').WorkspaceLegacyExecutionPlan;
  try { executionPlan = validatePersistedWorkspaceTaskPlan(task.executionPlan, files); } catch { await markWorkspaceTaskTerminal(terminalInput, 'failed', 'Workspace continuation plan is unavailable.'); return; }
  const commandPlan = commandPlanForPersistedWorkspaceTask(executionPlan);
  let response: Response | null = null;
  try {
    response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-chippy-workspace-request': crypto.createHash('sha256').update(input.taskId).digest('hex') }, body: JSON.stringify({ secret, task_id: input.taskId, run_id: input.runId, space_id: input.spaceId, task_sequence: task.sequence, instruction: task.instruction, command_plan: commandPlan, execution_plan: executionPlan, files, launch_token: launchToken }), signal: AbortSignal.timeout(10_000) });
  } catch (error) {
    logger.error('[workspace-run-task] Modal launch outcome is unknown; lease recovery will decide', { taskId: input.taskId }, error);
  }
  if (response && response.status !== 202) {
    await markWorkspaceTaskTerminal(terminalInput, 'failed', `Workspace continuation runtime rejected launch (${response.status}).`);
    return;
  }
  await scheduleWorkspaceTaskRecovery(input.taskId, input.runId, input.spaceId, launchToken);
  await scheduleWorkspaceTaskAcceptedSilenceTimeout(input.taskId, input.spaceId, launchToken);
}

export async function scheduleWorkspaceTaskRecovery(taskId: string, runId: string, spaceId: string, launchToken: string): Promise<void> {
  const payload = { taskId, runId, spaceId };
  if (workerConfigured()) {
    await enqueueWorkspaceTask('workspace-run-task-recovery', payload, RECOVERY_DELAY_SECONDS);
    return;
  }
  if (inngestConfigured()) {
    await inngest.send({ id: `workspace-task-recovery:${taskId}:${launchToken}`, name: 'workspace-run-task/execute', ts: Date.now() + LAUNCH_LEASE_MS + 5_000, data: payload });
    return;
  }
  // Previews without a durable rail still retain the request-lifetime
  // continuation contract. The delay is best-effort; the same claim/lease
  // makes an early callback harmless and a later retry idempotent.
  const { after } = await import('next/server');
  after(async () => {
    await new Promise((resolve) => setTimeout(resolve, (LAUNCH_LEASE_MS + 5_000)));
    await dispatchWorkspaceRunTask(payload);
  });
}
export async function scheduleWorkspaceTaskAcceptedSilenceTimeout(taskId: string, spaceId: string, launchToken: string): Promise<void> {
  // Cloudflare Queues is the only durable delayed rail for this dedicated
  // handler. Inngest/request-lifetime fallbacks continue to cover lease
  // recovery, but must not masquerade as a durable multi-minute timeout.
  if (!workerConfigured()) return;
  await enqueueWorkspaceTask(
    'workspace-run-task-accepted-silence-timeout',
    { taskId, spaceId, launchToken },
    TASK_ACCEPTED_SILENCE_DELAY_SECONDS,
  );
}
export async function failSilentAcceptedWorkspaceRunTask(input: { taskId: string; spaceId: string; launchToken: string }): Promise<boolean> {
  const { data, error } = await supabase.rpc('fail_silent_accepted_workspace_run_task', {
    p_task_id: input.taskId,
    p_space_id: input.spaceId,
    p_launch_token: input.launchToken,
  });
  if (error) throw error;
  return data === true;
}
export async function rearmRunningWorkspaceTaskTimeout(input: { taskId: string; spaceId: string; launchToken: string }): Promise<boolean> {
  const { data, error } = await tenantTable(supabase, 'WorkspaceRunTask', { spaceId: input.spaceId })
    .select('status, launchToken, modalAcceptedAt, cancellationRequestedAt')
    .eq('id', input.taskId)
    .maybeSingle();
  if (error) throw error;
  const task = data as {
    status?: unknown;
    launchToken?: unknown;
    modalAcceptedAt?: unknown;
    cancellationRequestedAt?: unknown;
  } | null;
  if (
    task?.status !== 'running'
    || task.launchToken !== input.launchToken
    || typeof task.modalAcceptedAt !== 'string'
    || task.cancellationRequestedAt != null
  ) return false;
  if (!workerConfigured()) {
    throw new Error('Cloudflare queue is required to rearm a running Workspace continuation timeout');
  }
  await enqueueWorkspaceTask(
    'workspace-run-task-accepted-silence-timeout',
    input,
    TASK_ACCEPTED_SILENCE_DELAY_SECONDS,
  );
  return true;
}
export async function markWorkspaceTaskTerminal(input: { taskId: string; spaceId: string; launchToken: string }, status: 'failed' | 'completed' | 'cancelled', error: string | null) {
  const { error: terminalError } = await supabase.rpc('finish_workspace_run_task', { p_task_id: input.taskId, p_space_id: input.spaceId, p_launch_token: input.launchToken, p_outcome: status, p_error: error });
  if (terminalError) throw terminalError;
}
export async function cancelWorkspaceRunTask(input: { taskId: string; spaceId: string }): Promise<boolean> {
  const { data, error } = await supabase.rpc('cancel_workspace_run_task', { p_task_id: input.taskId, p_space_id: input.spaceId });
  if (error) throw error;
  return data === true;
}

/** The enqueue commit precedes dispatch. Cloudflare is the authoritative
 * durable rail when configured; Inngest remains an explicit legacy fallback;
 * previews use Next's request-lifetime continuation with the identical claim. */
export async function kickWorkspaceRunTask(input: { taskId: string; runId: string; spaceId: string }): Promise<void> {
  if (workerConfigured()) {
    await enqueueWorkspaceTask('workspace-run-task', input);
    return;
  }
  if (inngestConfigured()) {
    await inngest.send({ id: `workspace-run-task:${input.taskId}`, name: 'workspace-run-task/execute', data: input });
    return;
  }
  const { after } = await import('next/server');
  after(async () => { await dispatchWorkspaceRunTask(input); });
}
export async function requestWorkspaceRunCancellation(runId: string, spaceId: string): Promise<boolean> {
  const { data: run, error: lookupError } = await tenantTable(supabase, 'WorkspaceRun', { spaceId }).select('workSessionId').eq('id', runId).maybeSingle();
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
    const { data: pending, error: pendingError } = await tenantTable(supabase, 'WorkspaceRun', { spaceId: input.spaceId }).select('status,launchToken').eq('id', input.runId).maybeSingle();
    if (pendingError) throw pendingError;
    if (pending?.status === 'launching' && pending.launchToken) await scheduleWorkspaceLaunchRecovery(input.workSessionId, input.runId, pending.launchToken);
    return;
  }
  const endpoint = process.env.MODAL_WORKSPACE_RUN_URL; const secret = process.env.CHIPPI_WORKSPACE_MODAL_SECRET;
  const terminalInput = { ...input, launchToken };
  if (!endpoint || !secret) { await markWorkspaceTerminal(terminalInput, 'failed', 'Workspace runtime is not configured.'); return; }
  let url: URL; try { url = new URL(endpoint); } catch { await markWorkspaceTerminal(terminalInput, 'failed', 'Workspace runtime URL is invalid.'); return; }
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.modal.run')) { await markWorkspaceTerminal(terminalInput, 'failed', 'Workspace runtime URL is invalid.'); return; }
  const requestId = crypto.createHash('sha256').update(input.runId).digest('hex');
  const recordReceipt = async (state: 'accepted' | 'recovering' | 'failed', reason: string | null): Promise<boolean> => {
    const { data, error } = await supabase.rpc('record_workspace_launch_receipt', {
      p_run_id: input.runId,
      p_space_id: input.spaceId,
      p_token: launchToken,
      p_state: state,
      p_reason: reason,
    });
    if (error || data !== true) {
      logger.error('[workspace-run] durable launch receipt unavailable', {
        runId: input.runId,
        state,
        error: error?.message ?? null,
      });
      return false;
    }
    return true;
  };
  try {
    const resolvedGoal = [input.goal, input.answer ? `Property clarification: ${input.answer}` : ''].filter(Boolean).join('\n');
    const packet = await preparePacket(input.spaceId, resolvedGoal);
    const response = await fetch(url, { method: 'POST', headers: { 'content-type':'application/json','x-chippy-workspace-request': requestId }, body: JSON.stringify({ secret, run_id: input.runId, space_id: input.spaceId, work_session_id: input.workSessionId, goal: resolvedGoal.slice(0, MAX_GOAL), packet, launch_token: launchToken }), signal: AbortSignal.timeout(10_000) });
    if (response.status !== 202) {
      await recordReceipt('failed', `runtime rejected (${response.status})`);
      await markWorkspaceTerminal(terminalInput, 'failed', `Workspace runtime rejected launch (${response.status}).`);
      return;
    }
    if (!await recordReceipt('accepted', null)) {
      await markWorkspaceTerminal(terminalInput, 'failed', 'Workspace launch acceptance could not be verified.');
      return;
    }
  } catch (error) {
    if (!await recordReceipt('recovering', 'launch outcome unknown')) {
      await markWorkspaceTerminal(terminalInput, 'failed', 'Workspace launch outcome could not be recorded.');
      return;
    }
    logger.error('[workspace-run] Modal launch outcome is unknown; lease recovery will decide', { runId: input.runId }, error);
  }
  // A 202 only proves the acceptor replied. It can still crash before its
  // spawned worker emits callbacks, so every launch has this same recovery.
  // If this send throws, an Inngest retry reaches the !claimed repair above.
  await scheduleWorkspaceLaunchRecovery(input.workSessionId, input.runId, launchToken);
}

export async function scheduleWorkspaceLaunchRecovery(sessionId: string, runId: string, launchToken: string): Promise<void> {
  const at = Date.now() + LAUNCH_LEASE_MS + 5_000;
  const payload = { sessionId, workspaceRunId: runId };
  if (workerConfigured()) {
    await enqueueWorkspaceTask('workspace-run-launch-recovery', payload, RECOVERY_DELAY_SECONDS);
    return;
  }
  if (inngestConfigured()) {
    await inngest.send({ id: `workspace-launch-recovery:${runId}:${launchToken}`, name: 'work-session/execute', ts: at, data: { ...payload, reason: 'launch_lease_recovery' } });
    return;
  }
  const { after } = await import('next/server');
  after(async () => {
    await new Promise((resolve) => setTimeout(resolve, LAUNCH_LEASE_MS + 5_000));
    await advanceWorkspaceRunLaunch(payload);
  });
}

async function advanceWorkspaceRunLaunch(input: { sessionId: string; workspaceRunId: string }): Promise<void> {
  const { advanceSession } = await import('@/lib/work-sessions/engine');
  await advanceSession(input.sessionId, input.workspaceRunId);
}
export async function markWorkspaceTerminal(input: { runId: string; spaceId: string; workSessionId: string; launchToken: string }, status: 'failed' | 'completed' | 'cancelled', error: string | null) {
  const { error: terminalError } = await supabase.rpc('finish_workspace_run_and_session', { p_run_id: input.runId, p_space_id: input.spaceId, p_launch_token: input.launchToken, p_outcome: status, p_error: error });
  if (terminalError) throw terminalError;
}
