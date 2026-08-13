/**
 * Construction-only policy for a future durable autonomy runtime.
 *
 * This module deliberately exports no worker, claim loop, or tool executor.
 * A caller must not treat the pure decision function below as runtime
 * activation: the authoritative state store, atomic transition API, bounded
 * job input contract, and audited unattended executor do not exist yet.
 */
export const AUTONOMOUS_LOOP_RUNTIME_BLOCKERS = [
  'authoritative_state_store_missing',
  'atomic_transition_api_missing',
  'selective_claim_contract_missing',
  'job_input_contract_missing',
  'audited_unattended_executor_missing',
] as const;

export function autonomousLoopRuntimeReadiness() {
  return {
    enabled: false as const,
    stage: 'construction_only' as const,
    blockers: AUTONOMOUS_LOOP_RUNTIME_BLOCKERS,
  };
}

export const AUTONOMOUS_LOOP_PHASES = [
  'observe',
  'plan',
  'execute',
  'verify',
  'publish',
  'sleep',
  'awaiting_input',
  'awaiting_approval',
  'completed',
  'failed',
  'cancelled',
] as const;

export type AutonomousLoopPhase = (typeof AUTONOMOUS_LOOP_PHASES)[number];

export interface AutonomousLoopBudget {
  maxCycles: number;
  maxToolCalls: number;
  maxTokens: number;
  maxWallMs: number;
  maxChildren: number;
  maxNoProgressCycles: number;
  maxRepeatedObservation: number;
}

export interface AutonomousLoopState {
  phase: AutonomousLoopPhase;
  cycle: number;
  toolCalls: number;
  tokens: number;
  childrenCreated: number;
  startedAtMs: number;
  noProgressCycles: number;
  repeatedObservation: number;
  observationFingerprint?: string;
  cancellationRequested: boolean;
}

export type LoopDecision =
  | { action: 'transition'; next: AutonomousLoopPhase; reason: string }
  | { action: 'sleep'; next: 'sleep'; reason: string; wakeAtMs: number }
  | { action: 'escalate'; next: 'awaiting_input' | 'awaiting_approval'; reason: string }
  | { action: 'stop'; next: 'completed' | 'failed' | 'cancelled'; reason: string };

export const DEFAULT_AUTONOMOUS_LOOP_BUDGET: AutonomousLoopBudget = {
  maxCycles: 12,
  maxToolCalls: 40,
  maxTokens: 120_000,
  maxWallMs: 15 * 60 * 1000,
  maxChildren: 4,
  maxNoProgressCycles: 2,
  maxRepeatedObservation: 2,
};

export interface LoopSignals {
  nowMs: number;
  workAvailable?: boolean;
  planReady?: boolean;
  executionComplete?: boolean;
  verificationPassed?: boolean;
  verificationNeedsApproval?: boolean;
  needsClarification?: boolean;
  statusPublished?: boolean;
  terminalGoalReached?: boolean;
  retryableFailure?: boolean;
  retryAfterMs?: number;
}

/**
 * Pure bounded state-machine policy. No runtime currently satisfies the
 * persistence and execution preconditions reported by
 * `autonomousLoopRuntimeReadiness`; this function is safe for design/tests,
 * not evidence that an AgentJobRun worker is active.
 */
export function decideAutonomousLoop(
  state: AutonomousLoopState,
  signals: LoopSignals,
  budget: AutonomousLoopBudget = DEFAULT_AUTONOMOUS_LOOP_BUDGET,
): LoopDecision {
  if (state.cancellationRequested) {
    return { action: 'stop', next: 'cancelled', reason: 'cancellation_requested' };
  }
  if (signals.nowMs - state.startedAtMs >= budget.maxWallMs) {
    return { action: 'stop', next: 'failed', reason: 'wall_time_budget_exhausted' };
  }
  if (state.cycle >= budget.maxCycles) {
    return { action: 'stop', next: 'failed', reason: 'cycle_budget_exhausted' };
  }
  if (state.toolCalls >= budget.maxToolCalls) {
    return { action: 'escalate', next: 'awaiting_approval', reason: 'tool_budget_exhausted' };
  }
  if (state.tokens >= budget.maxTokens) {
    return { action: 'stop', next: 'failed', reason: 'token_budget_exhausted' };
  }
  if (state.childrenCreated >= budget.maxChildren && state.phase === 'plan') {
    return { action: 'escalate', next: 'awaiting_approval', reason: 'child_quota_exhausted' };
  }
  if (state.noProgressCycles >= budget.maxNoProgressCycles) {
    return { action: 'escalate', next: 'awaiting_input', reason: 'no_progress_loop' };
  }
  if (state.repeatedObservation >= budget.maxRepeatedObservation) {
    return { action: 'sleep', next: 'sleep', reason: 'repeated_observation', wakeAtMs: signals.nowMs + 60_000 };
  }
  if (signals.needsClarification) {
    return { action: 'escalate', next: 'awaiting_input', reason: 'clarification_required' };
  }
  if (signals.verificationNeedsApproval) {
    return { action: 'escalate', next: 'awaiting_approval', reason: 'approval_required' };
  }
  if (signals.terminalGoalReached && state.phase === 'publish') {
    return { action: 'stop', next: 'completed', reason: 'goal_verified_and_published' };
  }
  if (signals.retryableFailure) {
    const backoff = Math.max(1_000, Math.min(signals.retryAfterMs ?? 5_000, 15 * 60_000));
    return { action: 'sleep', next: 'sleep', reason: 'retryable_failure', wakeAtMs: signals.nowMs + backoff };
  }

  switch (state.phase) {
    case 'observe':
      return signals.workAvailable
        ? { action: 'transition', next: 'plan', reason: 'work_observed' }
        : { action: 'sleep', next: 'sleep', reason: 'no_work', wakeAtMs: signals.nowMs + 60_000 };
    case 'plan':
      return signals.planReady
        ? { action: 'transition', next: 'execute', reason: 'bounded_plan_ready' }
        : { action: 'escalate', next: 'awaiting_input', reason: 'plan_incomplete' };
    case 'execute':
      return signals.executionComplete
        ? { action: 'transition', next: 'verify', reason: 'execution_finished' }
        : { action: 'transition', next: 'execute', reason: 'execution_checkpoint' };
    case 'verify':
      return signals.verificationPassed
        ? { action: 'transition', next: 'publish', reason: 'verification_passed' }
        : { action: 'escalate', next: 'awaiting_input', reason: 'verification_failed' };
    case 'publish':
      return signals.statusPublished
        ? { action: 'transition', next: 'observe', reason: 'status_published' }
        : { action: 'transition', next: 'publish', reason: 'publish_checkpoint' };
    case 'sleep':
      return { action: 'transition', next: 'observe', reason: 'wake_received' };
    case 'awaiting_input':
    case 'awaiting_approval':
      return { action: 'transition', next: state.phase, reason: 'external_decision_required' };
    case 'completed':
    case 'failed':
    case 'cancelled':
      return { action: 'stop', next: state.phase, reason: 'already_terminal' };
  }
}
