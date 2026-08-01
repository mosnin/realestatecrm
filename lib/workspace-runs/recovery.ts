import 'server-only';

import { inngest } from '@/lib/inngest/client';
import { supabase } from '@/lib/supabase';
import {
  isWorkspaceRunsEnabledForSpace,
  workspaceRunEnabledSpaceIds,
} from '@/lib/chippi/workspace-run-flag';

const MAX_CANDIDATES = 25;
const RECOVERY_ACTIONS = ['plan', 'execute', 'fail_accepted_silent'] as const;

export interface WorkspaceRunRecoveryCandidate {
  runId: string;
  workSessionId: string;
  spaceId: string;
  sessionStatus: 'planning' | 'running';
  runStatus: 'queued' | 'launching';
  launchToken: string | null;
  action: 'plan' | 'execute' | 'fail_accepted_silent';
  recoveryKey: string;
  staleForSeconds: number;
}

export interface WorkspaceRunRecoverySummary {
  scanned: number;
  enqueued: number;
  planning: number;
  execution: number;
  failedSilent: number;
  featureDisabled: number;
  maxStaleSeconds: number;
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
    if (runStatus !== 'queued' && runStatus !== 'launching') {
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
    if (
      (action === 'plan' && (sessionStatus !== 'planning' || runStatus !== 'queued'))
      || (action === 'execute' && sessionStatus !== 'running')
      || (action === 'fail_accepted_silent'
        && (sessionStatus !== 'running' || runStatus !== 'launching' || !launchToken))
      || (runStatus === 'launching' && !launchToken)
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

/**
 * Re-enter only the existing idempotent WorkSession phases. This never starts
 * Modal directly: the durable launch lease remains the single dispatch
 * authority when the execution event runs.
 */
export async function reconcileWorkspaceRunLaunches(
  limit = MAX_CANDIDATES,
): Promise<WorkspaceRunRecoverySummary> {
  if (!Number.isFinite(limit)) throw new Error('Workspace recovery limit is invalid');
  const boundedLimit = Math.min(Math.max(Math.floor(limit), 1), MAX_CANDIDATES);
  const enabledSpaceIds = workspaceRunEnabledSpaceIds();
  if (enabledSpaceIds.length === 0) {
    return {
      scanned: 0,
      enqueued: 0,
      planning: 0,
      execution: 0,
      failedSilent: 0,
      featureDisabled: 0,
      maxStaleSeconds: 0,
    };
  }
  const { data, error } = await supabase.rpc(
    'list_workspace_run_recovery_candidates',
    { p_limit: boundedLimit, p_space_ids: enabledSpaceIds },
  );
  if (error) throw error;

  const candidates = parseWorkspaceRunRecoveryCandidates(data ?? []);
  let planning = 0;
  let execution = 0;
  let failedSilent = 0;
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
      case 'plan':
      case 'execute': {
        await inngest.send({
          id: `workspace-run-recovery:${candidate.runId}:${candidate.recoveryKey}`,
          name: candidate.action === 'plan' ? 'work-session/plan' : 'work-session/execute',
          data: {
            sessionId: candidate.workSessionId,
            workspaceRunId: candidate.runId,
            reason: 'durable_launch_recovery',
          },
        });
        if (candidate.action === 'plan') planning += 1;
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
    featureDisabled,
    maxStaleSeconds,
  };
}
