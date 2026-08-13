import 'server-only';

import { inngest } from '@/lib/inngest/client';
import { enqueueWorkerTask, workerQueueConfigured } from '@/lib/queue';
import { supabase } from '@/lib/supabase';
import {
  isWorkspaceRunRecoveryEnabled,
  isWorkspaceRunTaskRecoveryEnabledForSpace,
  isWorkspaceRunsEnabledForSpace,
  workspaceRunEnabledSpaceIds,
  workspaceRunTaskRecoveryEnabledSpaceIds,
} from '@/lib/chippi/workspace-run-flag';

const MAX_CANDIDATES = 25;
const RESEARCH_STALE_SECONDS = 10 * 60;
const WORKSPACE_TASK_QUEUED_STALE_SECONDS = 2 * 60;
const WORKSPACE_TASK_ACCEPTED_STALE_SECONDS = 5 * 60;
const RECOVERY_ACTIONS = [
  'plan',
  'execute',
  'fail_accepted_silent',
  'fail_runtime_timeout',
] as const;

export interface WorkspaceRunRecoveryCandidate {
  runId: string;
  workSessionId: string;
  spaceId: string;
  sessionStatus: 'planning' | 'running';
  runStatus: 'queued' | 'launching' | 'running';
  launchToken: string | null;
  action: 'plan' | 'execute' | 'fail_accepted_silent' | 'fail_runtime_timeout';
  recoveryKey: string;
  staleForSeconds: number;
}

export interface WorkspaceRunRecoverySummary {
  scanned: number;
  enqueued: number;
  planning: number;
  execution: number;
  failedSilent: number;
  failedRuntime: number;
  featureDisabled: number;
  maxStaleSeconds: number;
}

export interface ResearchWorkSessionRecoveryCandidate {
  sessionId: string;
  spaceId: string;
  kind: 'research';
  sessionStatus: 'planning' | 'running';
  action: 'plan' | 'advance';
  recoveryKey: string;
  staleForSeconds: number;
}

export interface ResearchWorkSessionRecoverySummary {
  scanned: number;
  enqueued: number;
  planning: number;
  advancing: number;
  maxStaleSeconds: number;
}

export interface WorkspaceRunTaskRecoveryCandidate {
  taskId: string;
  runId: string;
  spaceId: string;
  taskStatus: 'queued' | 'launching' | 'running';
  runStatus: 'completed';
  launchToken: string | null;
  action: 'dispatch' | 'fail_accepted_silent';
  staleBasis: 'updatedAt' | 'modalAcceptedAt';
  recoveryKey: string;
  staleForSeconds: number;
}

export interface WorkspaceRunTaskRecoverySummary {
  enabled: boolean;
  scanned: number;
  enqueued: number;
  failedSilent: number;
  featureDisabled: number;
  maxStaleSeconds: number;
}

export type DurableRecoveryRail = 'cloudflare' | 'inngest';

export interface WorkRecoverySummary {
  rail: DurableRecoveryRail;
  research: ResearchWorkSessionRecoverySummary;
  workspaceRuns: WorkspaceRunRecoverySummary & { enabled: boolean };
  workspaceTasks: WorkspaceRunTaskRecoverySummary;
}

function boundedLimit(limit: number, label: string): number {
  if (!Number.isFinite(limit)) throw new Error(`${label} limit is invalid`);
  return Math.min(Math.max(Math.floor(limit), 1), MAX_CANDIDATES);
}

function candidateString(
  value: unknown,
  field: string,
  label: string,
  maxLength = 256,
): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value !== value.trim()
    || value.length > maxLength
  ) {
    throw new Error(`${label} ${field} is invalid`);
  }
  return value;
}

function candidateStaleSeconds(value: unknown, field: string, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} ${field} is invalid`);
  }
  return value;
}

function exactCandidateKeys(
  row: Record<string, unknown>,
  allowed: readonly string[],
  index: number,
  label: string,
): void {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(row).find((key) => !allowedSet.has(key));
  const missing = allowed.find((key) => !Object.prototype.hasOwnProperty.call(row, key));
  if (unexpected || missing || Object.keys(row).length !== allowed.length) {
    throw new Error(`${label} ${index} fields are invalid`);
  }
}

function rejectDuplicateCandidate(
  seen: Set<string>,
  identity: string,
  index: number,
  label: string,
): void {
  if (seen.has(identity)) throw new Error(`${label} ${index} is duplicate`);
  seen.add(identity);
}

export function durableRecoveryRail(): DurableRecoveryRail {
  if (workerQueueConfigured()) return 'cloudflare';
  if (
    process.env.INNGEST_EVENT_KEY?.trim()
    && process.env.INNGEST_SIGNING_KEY?.trim()
  ) return 'inngest';
  throw new Error(
    'Durable recovery rail is not configured; set Cloudflare or both Inngest keys.',
  );
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw new Error(`Workspace recovery candidate ${field} is invalid`);
  }
  return value;
}

/** Treat the database response as an external observation, not a TypeScript
 * object. The entire batch is validated before any event or terminal effect. */
export function parseWorkspaceRunRecoveryCandidates(value: unknown): WorkspaceRunRecoveryCandidate[] {
  if (!Array.isArray(value) || value.length > MAX_CANDIDATES) {
    throw new Error('Workspace recovery candidate batch is invalid');
  }
  return value.map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new Error(`Workspace recovery candidate ${index} is invalid`);
    }
    const row = candidate as Record<string, unknown>;
    const sessionStatus = row.sessionStatus;
    const runStatus = row.runStatus;
    const action = row.action;
    const launchToken = row.launchToken;
    const staleForSeconds = row.staleForSeconds;
    if (sessionStatus !== 'planning' && sessionStatus !== 'running') {
      throw new Error(`Workspace recovery candidate ${index} sessionStatus is invalid`);
    }
    if (runStatus !== 'queued' && runStatus !== 'launching' && runStatus !== 'running') {
      throw new Error(`Workspace recovery candidate ${index} runStatus is invalid`);
    }
    if (!(RECOVERY_ACTIONS as readonly unknown[]).includes(action)) {
      throw new Error(`Workspace recovery candidate ${index} action is invalid`);
    }
    if (launchToken !== null && (typeof launchToken !== 'string' || !launchToken.trim())) {
      throw new Error(`Workspace recovery candidate ${index} launchToken is invalid`);
    }
    if (
      typeof staleForSeconds !== 'number'
      || !Number.isSafeInteger(staleForSeconds)
      || staleForSeconds < 0
    ) {
      throw new Error(`Workspace recovery candidate ${index} staleForSeconds is invalid`);
    }
    const stateActionBound =
      (action === 'plan' && sessionStatus === 'planning' && runStatus === 'queued')
      || (
        action === 'execute'
        && sessionStatus === 'running'
        && (runStatus === 'queued' || runStatus === 'launching')
      )
      || (
        action === 'fail_accepted_silent'
        && sessionStatus === 'running'
        && runStatus === 'launching'
        && Boolean(launchToken)
      )
      || (
        action === 'fail_runtime_timeout'
        && sessionStatus === 'running'
        && runStatus === 'running'
        && Boolean(launchToken)
      );
    if (
      !stateActionBound
      || ((runStatus === 'launching' || runStatus === 'running') && !launchToken)
    ) {
      throw new Error(`Workspace recovery candidate ${index} state/action binding is invalid`);
    }
    return {
      runId: requiredString(row.runId, `${index}.runId`),
      workSessionId: requiredString(row.workSessionId, `${index}.workSessionId`),
      spaceId: requiredString(row.spaceId, `${index}.spaceId`),
      sessionStatus,
      runStatus,
      launchToken,
      action: action as WorkspaceRunRecoveryCandidate['action'],
      recoveryKey: requiredString(row.recoveryKey, `${index}.recoveryKey`),
      staleForSeconds,
    };
  });
}

export function parseResearchWorkSessionRecoveryCandidates(
  value: unknown,
): ResearchWorkSessionRecoveryCandidate[] {
  const label = 'Research recovery candidate';
  if (!Array.isArray(value) || value.length > MAX_CANDIDATES) {
    throw new Error(`${label} batch is invalid`);
  }
  const seen = new Set<string>();
  return value.map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new Error(`${label} ${index} is invalid`);
    }
    const row = candidate as Record<string, unknown>;
    exactCandidateKeys(
      row,
      [
        'sessionId',
        'spaceId',
        'kind',
        'sessionStatus',
        'action',
        'recoveryKey',
        'staleForSeconds',
      ],
      index,
      label,
    );
    const sessionId = candidateString(row.sessionId, `${index}.sessionId`, label);
    const spaceId = candidateString(row.spaceId, `${index}.spaceId`, label);
    const recoveryKey = candidateString(
      row.recoveryKey,
      `${index}.recoveryKey`,
      label,
      512,
    );
    const staleForSeconds = candidateStaleSeconds(
      row.staleForSeconds,
      `${index}.staleForSeconds`,
      label,
    );
    const stateActionBound =
      row.kind === 'research'
      && (
        (row.sessionStatus === 'planning' && row.action === 'plan')
        || (row.sessionStatus === 'running' && row.action === 'advance')
      );
    if (!stateActionBound || staleForSeconds < RESEARCH_STALE_SECONDS) {
      throw new Error(`${label} ${index} state/action binding is invalid`);
    }
    rejectDuplicateCandidate(seen, sessionId, index, label);
    return {
      sessionId,
      spaceId,
      kind: 'research',
      sessionStatus: row.sessionStatus as 'planning' | 'running',
      action: row.action as 'plan' | 'advance',
      recoveryKey,
      staleForSeconds,
    };
  });
}

export function parseWorkspaceRunTaskRecoveryCandidates(
  value: unknown,
): WorkspaceRunTaskRecoveryCandidate[] {
  const label = 'Workspace task recovery candidate';
  if (!Array.isArray(value) || value.length > MAX_CANDIDATES) {
    throw new Error(`${label} batch is invalid`);
  }
  const seen = new Set<string>();
  return value.map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new Error(`${label} ${index} is invalid`);
    }
    const row = candidate as Record<string, unknown>;
    exactCandidateKeys(
      row,
      [
        'taskId',
        'runId',
        'spaceId',
        'taskStatus',
        'runStatus',
        'launchToken',
        'action',
        'staleBasis',
        'recoveryKey',
        'staleForSeconds',
      ],
      index,
      label,
    );
    const taskId = candidateString(row.taskId, `${index}.taskId`, label);
    const runId = candidateString(row.runId, `${index}.runId`, label);
    const spaceId = candidateString(row.spaceId, `${index}.spaceId`, label);
    const recoveryKey = candidateString(
      row.recoveryKey,
      `${index}.recoveryKey`,
      label,
      512,
    );
    const staleForSeconds = candidateStaleSeconds(
      row.staleForSeconds,
      `${index}.staleForSeconds`,
      label,
    );
    const launchToken = row.launchToken;
    if (
      launchToken !== null
      && (
        typeof launchToken !== 'string'
        || launchToken.length === 0
        || launchToken !== launchToken.trim()
        || launchToken.length > 256
      )
    ) {
      throw new Error(`${label} ${index}.launchToken is invalid`);
    }
    const stateActionBound = row.runStatus === 'completed' && (
      (
        row.action === 'dispatch'
        && row.taskStatus === 'queued'
        && launchToken === null
        && row.staleBasis === 'updatedAt'
        && staleForSeconds >= WORKSPACE_TASK_QUEUED_STALE_SECONDS
      )
      || (
        row.action === 'fail_accepted_silent'
        && (row.taskStatus === 'launching' || row.taskStatus === 'running')
        && typeof launchToken === 'string'
        && launchToken.length > 0
        && (
          (row.taskStatus === 'launching' && row.staleBasis === 'modalAcceptedAt')
          || (row.taskStatus === 'running' && row.staleBasis === 'updatedAt')
        )
        && staleForSeconds >= WORKSPACE_TASK_ACCEPTED_STALE_SECONDS
      )
    );
    if (!stateActionBound) {
      throw new Error(`${label} ${index} state/action binding is invalid`);
    }
    rejectDuplicateCandidate(seen, taskId, index, label);
    return {
      taskId,
      runId,
      spaceId,
      taskStatus: row.taskStatus as 'queued' | 'launching' | 'running',
      runStatus: 'completed',
      launchToken: launchToken as string | null,
      action: row.action as 'dispatch' | 'fail_accepted_silent',
      staleBasis: row.staleBasis as 'updatedAt' | 'modalAcceptedAt',
      recoveryKey,
      staleForSeconds,
    };
  });
}

async function enqueueRecoveryTask(
  rail: DurableRecoveryRail,
  workerTask: string,
  workerPayload: Record<string, string>,
  event: { id: string; name: string; data: Record<string, string> },
): Promise<void> {
  if (rail === 'cloudflare') {
    const accepted = await enqueueWorkerTask(workerTask, workerPayload);
    if (!accepted) throw new Error(`Cloudflare queue did not accept ${workerTask}.`);
    return;
  }
  await inngest.send(event);
}

export async function reconcileResearchWorkSessions(
  limit = MAX_CANDIDATES,
  rail?: DurableRecoveryRail,
): Promise<ResearchWorkSessionRecoverySummary> {
  const bounded = boundedLimit(limit, 'Research recovery');
  const selectedRail = rail ?? durableRecoveryRail();
  const { data, error } = await supabase.rpc(
    'list_research_work_session_recovery_candidates',
    { p_limit: bounded },
  );
  if (error) throw error;
  const candidates = parseResearchWorkSessionRecoveryCandidates(data ?? []);
  let planning = 0;
  let advancing = 0;
  let maxStaleSeconds = 0;

  for (const candidate of candidates) {
    maxStaleSeconds = Math.max(maxStaleSeconds, candidate.staleForSeconds);
    const plan = candidate.action === 'plan';
    await enqueueRecoveryTask(
      selectedRail,
      plan ? 'work-session-plan' : 'work-session-advance',
      { sessionId: candidate.sessionId },
      {
        id: `research-work-session-recovery:${candidate.sessionId}:${candidate.recoveryKey}`,
        name: plan ? 'work-session/plan' : 'work-session/execute',
        data: { sessionId: candidate.sessionId },
      },
    );
    if (plan) planning += 1;
    else advancing += 1;
  }

  return {
    scanned: candidates.length,
    enqueued: planning + advancing,
    planning,
    advancing,
    maxStaleSeconds,
  };
}

/**
 * Re-enter only the existing idempotent WorkSession phases. This never starts
 * Modal directly: the durable launch lease remains the single dispatch
 * authority when the execution event runs.
 */
export async function reconcileWorkspaceRunLaunches(
  limit = MAX_CANDIDATES,
  rail?: DurableRecoveryRail,
): Promise<WorkspaceRunRecoverySummary> {
  const bounded = boundedLimit(limit, 'Workspace recovery');
  const enabledSpaceIds = workspaceRunEnabledSpaceIds();
  if (enabledSpaceIds.length === 0) {
    return {
      scanned: 0,
      enqueued: 0,
      planning: 0,
      execution: 0,
      failedSilent: 0,
      failedRuntime: 0,
      featureDisabled: 0,
      maxStaleSeconds: 0,
    };
  }
  const selectedRail = rail ?? durableRecoveryRail();
  const { data, error } = await supabase.rpc(
    'list_workspace_run_recovery_candidates',
    { p_limit: bounded, p_space_ids: enabledSpaceIds },
  );
  if (error) throw error;

  const candidates = parseWorkspaceRunRecoveryCandidates(data ?? []);
  let planning = 0;
  let execution = 0;
  let failedSilent = 0;
  let failedRuntime = 0;
  let featureDisabled = 0;
  let maxStaleSeconds = 0;

  for (const candidate of candidates) {
    maxStaleSeconds = Math.max(maxStaleSeconds, candidate.staleForSeconds);
    if (!isWorkspaceRunsEnabledForSpace(candidate.spaceId)) {
      featureDisabled += 1;
      continue;
    }
    switch (candidate.action) {
      case 'fail_accepted_silent': {
        const { data: failed, error: failError } = await supabase.rpc(
          'fail_stale_accepted_workspace_launch',
          {
            p_run_id: candidate.runId,
            p_space_id: candidate.spaceId,
            p_token: candidate.launchToken,
          },
        );
        if (failError) throw failError;
        if (failed === true) failedSilent += 1;
        break;
      }
      case 'fail_runtime_timeout': {
        const { data: failed, error: failError } = await supabase.rpc(
          'fail_stale_running_workspace_run',
          {
            p_run_id: candidate.runId,
            p_space_id: candidate.spaceId,
            p_token: candidate.launchToken,
          },
        );
        if (failError) throw failError;
        if (failed === true) failedRuntime += 1;
        break;
      }
      case 'plan':
      case 'execute': {
        const workerPayload = {
          sessionId: candidate.workSessionId,
          workspaceRunId: candidate.runId,
        };
        const plan = candidate.action === 'plan';
        await enqueueRecoveryTask(
          selectedRail,
          plan ? 'work-session-plan' : 'work-session-advance',
          workerPayload,
          {
            id: `workspace-run-recovery:${candidate.runId}:${candidate.recoveryKey}`,
            name: plan ? 'work-session/plan' : 'work-session/execute',
            data: { ...workerPayload, reason: 'durable_launch_recovery' },
          },
        );
        if (plan) planning += 1;
        else execution += 1;
        break;
      }
    }
  }

  return {
    scanned: candidates.length,
    enqueued: planning + execution,
    planning,
    execution,
    failedSilent,
    failedRuntime,
    featureDisabled,
    maxStaleSeconds,
  };
}

export async function reconcileWorkspaceRunTasks(
  limit = MAX_CANDIDATES,
  rail?: DurableRecoveryRail,
): Promise<WorkspaceRunTaskRecoverySummary> {
  const bounded = boundedLimit(limit, 'Workspace task recovery');
  const enabledSpaceIds = workspaceRunTaskRecoveryEnabledSpaceIds();
  if (enabledSpaceIds.length === 0) {
    return {
      enabled: false,
      scanned: 0,
      enqueued: 0,
      failedSilent: 0,
      featureDisabled: 0,
      maxStaleSeconds: 0,
    };
  }
  const selectedRail = rail ?? durableRecoveryRail();
  const { data, error } = await supabase.rpc(
    'list_workspace_run_task_recovery_candidates',
    { p_limit: bounded, p_space_ids: enabledSpaceIds },
  );
  if (error) throw error;
  const candidates = parseWorkspaceRunTaskRecoveryCandidates(data ?? []);
  let enqueued = 0;
  let failedSilent = 0;
  let featureDisabled = 0;
  let maxStaleSeconds = 0;

  for (const candidate of candidates) {
    maxStaleSeconds = Math.max(maxStaleSeconds, candidate.staleForSeconds);
    if (!isWorkspaceRunTaskRecoveryEnabledForSpace(candidate.spaceId)) {
      featureDisabled += 1;
      continue;
    }
    if (candidate.action === 'fail_accepted_silent') {
      const { data: failed, error: failError } = await supabase.rpc(
        'fail_silent_accepted_workspace_run_task',
        {
          p_task_id: candidate.taskId,
          p_space_id: candidate.spaceId,
          p_launch_token: candidate.launchToken,
        },
      );
      if (failError) throw failError;
      if (failed === true) failedSilent += 1;
      continue;
    }
    const payload = {
      taskId: candidate.taskId,
      runId: candidate.runId,
      spaceId: candidate.spaceId,
    };
    await enqueueRecoveryTask(
      selectedRail,
      'workspace-run-task',
      payload,
      {
        id: `workspace-run-task-recovery:${candidate.taskId}:${candidate.recoveryKey}`,
        name: 'workspace-run-task/execute',
        data: payload,
      },
    );
    enqueued += 1;
  }

  return {
    enabled: true,
    scanned: candidates.length,
    enqueued,
    failedSilent,
    featureDisabled,
    maxStaleSeconds,
  };
}

function disabledWorkspaceRunSummary(): WorkspaceRunRecoverySummary & { enabled: false } {
  return {
    enabled: false,
    scanned: 0,
    enqueued: 0,
    planning: 0,
    execution: 0,
    failedSilent: 0,
    failedRuntime: 0,
    featureDisabled: 0,
    maxStaleSeconds: 0,
  };
}

/** One cron receipt across three independent recovery domains. Ordinary
 * research is unconditional; each Workspace domain retains its own rollout. */
export async function reconcileWorkRecovery(
  limit = MAX_CANDIDATES,
): Promise<WorkRecoverySummary> {
  const bounded = boundedLimit(limit, 'Work recovery');
  // Resolve before reading candidates. A cron invocation with no independent
  // durable dispatch rail is unhealthy even if this particular scan is empty.
  const rail = durableRecoveryRail();
  const research = await reconcileResearchWorkSessions(bounded, rail);
  const workspaceRuns = isWorkspaceRunRecoveryEnabled()
    ? { enabled: true as const, ...(await reconcileWorkspaceRunLaunches(bounded, rail)) }
    : disabledWorkspaceRunSummary();
  const workspaceTasks = await reconcileWorkspaceRunTasks(bounded, rail);
  return { rail, research, workspaceRuns, workspaceTasks };
}
