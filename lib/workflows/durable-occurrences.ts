/**
 * Durable scheduled-workflow occurrence protocol (feature-gated, not wired).
 *
 * The legacy workflow cron still owns production behavior. This module defines
 * the additive replacement contract: one materialized cadence slot is claimed
 * atomically, and its stable step records let a retry resume after completed
 * earlier work instead of replaying the entire workflow.
 *
 * Important limit: a completed step record can prevent Chippy from reissuing a
 * call only when it was written after the side effect. A worker crash after a
 * provider side effect but before the record is persisted still needs the
 * provider's own idempotency key or a human-safe proposal path. Do not enable
 * this flag for consequential providers until that boundary is verified.
 */

import { createHash } from 'node:crypto';
import { supabase } from '@/lib/supabase';

export type ScheduleOccurrenceStatus =
  | 'pending'
  | 'claimed'
  | 'accepted'
  | 'completed'
  | 'retry_wait'
  | 'failed'
  | 'dead_letter'
  | 'cancelled';

export type ScheduleOccurrenceStepStatus =
  | 'pending'
  | 'claimed'
  | 'completed'
  | 'retry_wait'
  | 'failed'
  | 'cancelled';

export interface ScheduleOccurrenceRecord {
  id: string;
  spaceId: string;
  scheduleType: 'routine' | 'workflow' | 'agent_task';
  scheduleId: string;
  scheduledFor: string;
  /** Immutable version captured when a workflow occurrence is materialized. */
  workflowVersion: number | null;
  status: ScheduleOccurrenceStatus;
  attempt: number;
  maxAttempts: number;
  availableAt: string;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  /** Monotonic fencing token; required on every lease-bound mutation. */
  leaseGeneration: number;
  cancellationRequestedAt: string | null;
  lastError: string | null;
}

export interface ScheduleOccurrenceStepRecord {
  id: string;
  occurrenceId: string;
  stepKey: string;
  idempotencyKey: string;
  stepIndex: number;
  actionType: string | null;
  status: ScheduleOccurrenceStepStatus;
  attempt: number;
  maxAttempts: number;
  availableAt: string;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  occurrenceLeaseGeneration: number;
  lastError: string | null;
}

export interface PlannedWorkflowStep {
  stepIndex: number;
  /** Stable graph-node id when present, otherwise the linear action index. */
  stableId: string;
  actionType: string | null;
}

export type ResumeStepDecision =
  | { kind: 'execute'; step: PlannedWorkflowStep; stepKey: string; idempotencyKey: string }
  | { kind: 'skip_completed'; step: PlannedWorkflowStep; stepKey: string }
  | { kind: 'wait_for_lease'; step: PlannedWorkflowStep; stepKey: string }
  | { kind: 'stop_cancelled'; step: PlannedWorkflowStep; stepKey: string };

export interface ClaimResult {
  claimed: boolean;
  record: ScheduleOccurrenceRecord;
  reason?: 'not_due' | 'terminal' | 'cancelled' | 'leased' | 'attempts_exhausted';
}

/** Off unless explicitly enabled. No existing cron imports this seam yet. */
export function durableScheduleOccurrencesEnabled(): boolean {
  const value = process.env.DURABLE_SCHEDULE_OCCURRENCES_ENABLED;
  return value === '1' || value === 'true';
}

/** Stable per-cadence identity; do not use wall-clock dispatch time. */
export function scheduleOccurrenceIdempotencyKey(input: {
  scheduleType: ScheduleOccurrenceRecord['scheduleType'];
  spaceId: string;
  scheduleId: string;
  scheduledFor: Date | string;
}): string {
  const scheduledFor = canonicalTime(input.scheduledFor);
  return stableKey('schedule-occurrence:v1', [
    input.spaceId,
    input.scheduleType,
    input.scheduleId,
    scheduledFor,
  ]);
}

/** Stable per-occurrence action identity, including the captured workflow version. */
export function scheduleStepIdempotencyKey(input: {
  occurrenceId: string;
  workflowVersion: number;
  step: PlannedWorkflowStep;
}): string {
  return stableKey('schedule-step:v1', [
    input.occurrenceId,
    String(input.workflowVersion),
    String(input.step.stepIndex),
    input.step.stableId,
  ]);
}

export function scheduleStepKey(step: PlannedWorkflowStep): string {
  return `v1:${step.stepIndex}:${step.stableId}`;
}

/**
 * Pure claim transition mirrored by `claim_schedule_occurrence` in Postgres.
 * The database RPC—not this helper—is the concurrency authority.
 */
export function claimOccurrence(
  record: ScheduleOccurrenceRecord,
  workerId: string,
  now: Date,
  leaseSeconds = 60,
): ClaimResult {
  if (!workerId.trim()) throw new Error('workerId is required');
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 15 || leaseSeconds > 600) {
    throw new Error('leaseSeconds must be between 15 and 600');
  }
  if (record.cancellationRequestedAt || record.status === 'cancelled') {
    return { claimed: false, record, reason: 'cancelled' };
  }
  if (['completed', 'failed', 'dead_letter'].includes(record.status)) {
    return { claimed: false, record, reason: 'terminal' };
  }
  if (record.attempt >= record.maxAttempts) {
    return { claimed: false, record, reason: 'attempts_exhausted' };
  }
  const due = new Date(record.availableAt).getTime() <= now.getTime();
  const leaseExpired =
    record.status === 'claimed' &&
    !!record.leaseExpiresAt &&
    new Date(record.leaseExpiresAt).getTime() <= now.getTime();
  if (!(due && (record.status === 'pending' || record.status === 'retry_wait' || leaseExpired))) {
    return { claimed: false, record, reason: record.status === 'claimed' ? 'leased' : 'not_due' };
  }
  const claimed: ScheduleOccurrenceRecord = {
    ...record,
    status: 'claimed',
    attempt: record.attempt + 1,
    leaseOwner: workerId,
    leaseExpiresAt: new Date(now.getTime() + leaseSeconds * 1000).toISOString(),
    leaseGeneration: record.leaseGeneration + 1,
  };
  return { claimed: true, record: claimed };
}

/** Explicit retry, terminal failure, and cancellation outcomes. */
export function finishOccurrence(input: {
  record: ScheduleOccurrenceRecord;
  workerId: string;
  leaseGeneration: number;
  outcome: 'completed' | 'retryable_failure' | 'failed' | 'cancelled';
  now: Date;
  retryAfterSeconds?: number;
  error?: string;
}): ScheduleOccurrenceRecord {
  const { record, workerId, outcome, now } = input;
  if (
    record.status !== 'claimed' ||
    record.leaseOwner !== workerId ||
    record.leaseGeneration !== input.leaseGeneration ||
    !record.leaseExpiresAt ||
    new Date(record.leaseExpiresAt).getTime() <= now.getTime()
  ) {
    throw new Error('only the active lease owner may finish an occurrence');
  }
  const cleared = {
    ...record,
    leaseOwner: null,
    leaseExpiresAt: null,
    lastError: input.error ?? null,
  };
  if (outcome === 'cancelled' || record.cancellationRequestedAt) {
    return { ...cleared, status: 'cancelled' };
  }
  if (outcome === 'completed') return { ...cleared, status: 'completed' };
  if (outcome === 'retryable_failure' && record.attempt < record.maxAttempts) {
    const retrySeconds = Math.max(1, Math.min(input.retryAfterSeconds ?? 30, 86_400));
    return {
      ...cleared,
      status: 'retry_wait',
      availableAt: new Date(now.getTime() + retrySeconds * 1000).toISOString(),
    };
  }
  return { ...cleared, status: outcome === 'retryable_failure' ? 'dead_letter' : 'failed' };
}

/**
 * Derive safe resume work. Completed steps are never reissued. A live claim
 * makes the caller wait; only an expired lease is eligible to be reclaimed by
 * the database step-claim RPC.
 */
export function planWorkflowResume(input: {
  occurrenceId: string;
  occurrenceWorkflowVersion: number;
  workflowVersion: number;
  plannedSteps: PlannedWorkflowStep[];
  recordedSteps: ScheduleOccurrenceStepRecord[];
  now: Date;
  cancellationRequested: boolean;
}): ResumeStepDecision[] {
  if (input.occurrenceWorkflowVersion !== input.workflowVersion) {
    throw new Error('workflow definition version changed after occurrence materialization');
  }
  const recorded = new Map(input.recordedSteps.map((step) => [step.stepKey, step]));
  const decisions: ResumeStepDecision[] = [];
  for (const step of input.plannedSteps) {
    const stepKey = scheduleStepKey(step);
    if (input.cancellationRequested) {
      decisions.push({ kind: 'stop_cancelled', step, stepKey });
      break;
    }
    const prior = recorded.get(stepKey);
    if (prior?.status === 'completed') {
      decisions.push({ kind: 'skip_completed', step, stepKey });
      continue;
    }
    const liveLease =
      prior?.status === 'claimed' &&
      !!prior.leaseExpiresAt &&
      new Date(prior.leaseExpiresAt).getTime() > input.now.getTime();
    if (liveLease) {
      decisions.push({ kind: 'wait_for_lease', step, stepKey });
      break;
    }
    decisions.push({
      kind: 'execute',
      step,
      stepKey,
      idempotencyKey: scheduleStepIdempotencyKey({
        occurrenceId: input.occurrenceId,
        workflowVersion: input.workflowVersion,
        step,
      }),
    });
  }
  return decisions;
}

// ── Typed RPC store (unused until feature-gated cron wiring) ───────────────

export async function materializeScheduleOccurrence(input: {
  spaceId: string;
  scheduleType: ScheduleOccurrenceRecord['scheduleType'];
  scheduleId: string;
  scheduledFor: Date | string;
  workflowVersion?: number | null;
  maxAttempts?: number;
}): Promise<ScheduleOccurrenceRecord> {
  if (input.scheduleType === 'workflow' && !Number.isInteger(input.workflowVersion)) {
    throw new Error('workflowVersion is required for workflow occurrences');
  }
  const { data, error } = await supabase.rpc('materialize_schedule_occurrence', {
    p_space_id: input.spaceId,
    p_schedule_type: input.scheduleType,
    p_schedule_id: input.scheduleId,
    p_scheduled_for: canonicalTime(input.scheduledFor),
    p_max_attempts: input.maxAttempts ?? 3,
    p_workflow_version: input.workflowVersion ?? null,
  });
  if (error) throw error;
  return rpcRow<ScheduleOccurrenceRecord>(data, 'materialize schedule occurrence');
}

export async function claimNextScheduleOccurrence(input: {
  workerId: string;
  leaseSeconds?: number;
}): Promise<ScheduleOccurrenceRecord | null> {
  const { data, error } = await supabase.rpc('claim_schedule_occurrence', {
    p_worker_id: input.workerId,
    p_lease_seconds: input.leaseSeconds ?? 60,
  });
  if (error) throw error;
  return rpcOptionalRow<ScheduleOccurrenceRecord>(data);
}

export async function heartbeatScheduleOccurrence(input: {
  occurrenceId: string;
  workerId: string;
  leaseGeneration: number;
  leaseSeconds?: number;
}): Promise<boolean> {
  const { data, error } = await supabase.rpc('heartbeat_schedule_occurrence', {
    p_occurrence_id: input.occurrenceId,
    p_worker_id: input.workerId,
    p_lease_generation: input.leaseGeneration,
    p_lease_seconds: input.leaseSeconds ?? 60,
  });
  if (error) throw error;
  return data === true;
}

export async function finishScheduleOccurrence(input: {
  occurrenceId: string;
  workerId: string;
  leaseGeneration: number;
  outcome: 'completed' | 'retryable_failure' | 'failed' | 'cancelled';
  errorCode?: string | null;
  errorMessage?: string | null;
  retryAfterSeconds?: number;
}): Promise<boolean> {
  const { data, error } = await supabase.rpc('finish_schedule_occurrence', {
    p_occurrence_id: input.occurrenceId,
    p_worker_id: input.workerId,
    p_lease_generation: input.leaseGeneration,
    p_outcome: input.outcome,
    p_error_code: input.errorCode ?? null,
    p_error_message: input.errorMessage ?? null,
    p_retry_after_seconds: input.retryAfterSeconds ?? 30,
  });
  if (error) throw error;
  return data === true;
}

export async function claimScheduleOccurrenceStep(input: {
  occurrenceId: string;
  workerId: string;
  occurrenceLeaseGeneration: number;
  stepKey: string;
  idempotencyKey: string;
  stepIndex: number;
  actionType?: string | null;
  leaseSeconds?: number;
  maxAttempts?: number;
}): Promise<ScheduleOccurrenceStepRecord | null> {
  const { data, error } = await supabase.rpc('claim_schedule_occurrence_step', {
    p_occurrence_id: input.occurrenceId,
    p_worker_id: input.workerId,
    p_lease_generation: input.occurrenceLeaseGeneration,
    p_step_key: input.stepKey,
    p_idempotency_key: input.idempotencyKey,
    p_step_index: input.stepIndex,
    p_action_type: input.actionType ?? null,
    p_lease_seconds: input.leaseSeconds ?? 60,
    p_max_attempts: input.maxAttempts ?? 3,
  });
  if (error) throw error;
  return rpcOptionalRow<ScheduleOccurrenceStepRecord>(data);
}

export async function heartbeatScheduleOccurrenceStep(input: {
  stepId: string;
  workerId: string;
  occurrenceLeaseGeneration: number;
  leaseSeconds?: number;
}): Promise<boolean> {
  const { data, error } = await supabase.rpc('heartbeat_schedule_occurrence_step', {
    p_step_id: input.stepId,
    p_worker_id: input.workerId,
    p_lease_generation: input.occurrenceLeaseGeneration,
    p_lease_seconds: input.leaseSeconds ?? 60,
  });
  if (error) throw error;
  return data === true;
}

export async function finishScheduleOccurrenceStep(input: {
  stepId: string;
  workerId: string;
  occurrenceLeaseGeneration: number;
  outcome: 'completed' | 'retryable_failure' | 'failed' | 'cancelled';
  result?: Record<string, unknown> | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  retryAfterSeconds?: number;
}): Promise<boolean> {
  const { data, error } = await supabase.rpc('finish_schedule_occurrence_step', {
    p_step_id: input.stepId,
    p_worker_id: input.workerId,
    p_lease_generation: input.occurrenceLeaseGeneration,
    p_outcome: input.outcome,
    p_result: input.result ?? null,
    p_error_code: input.errorCode ?? null,
    p_error_message: input.errorMessage ?? null,
    p_retry_after_seconds: input.retryAfterSeconds ?? 30,
  });
  if (error) throw error;
  return data === true;
}

function canonicalTime(value: Date | string): string {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) throw new Error('scheduledFor must be a valid timestamp');
  return new Date(time).toISOString();
}

function stableKey(prefix: string, fields: string[]): string {
  const hash = createHash('sha256').update(JSON.stringify(fields)).digest('hex');
  return `${prefix}:${hash}`;
}

function rpcRow<T>(data: unknown, operation: string): T {
  const row = rpcOptionalRow<T>(data);
  if (!row) throw new Error(`${operation} returned no row`);
  return row;
}

function rpcOptionalRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T | undefined) ?? null;
  return (data as T | null) ?? null;
}
