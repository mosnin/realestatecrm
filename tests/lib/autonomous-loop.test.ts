import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AUTONOMOUS_LOOP_BUDGET,
  decideAutonomousLoop,
  type AutonomousLoopState,
} from '@/lib/agent/autonomous-loop';

const base: AutonomousLoopState = {
  phase: 'observe',
  cycle: 0,
  toolCalls: 0,
  tokens: 0,
  childrenCreated: 0,
  startedAtMs: 1_000,
  noProgressCycles: 0,
  repeatedObservation: 0,
  cancellationRequested: false,
};

describe('bounded autonomous loop', () => {
  it('follows observe → plan → execute → verify → publish', () => {
    expect(decideAutonomousLoop(base, { nowMs: 2_000, workAvailable: true })).toMatchObject({ next: 'plan' });
    expect(decideAutonomousLoop({ ...base, phase: 'plan' }, { nowMs: 2_000, planReady: true })).toMatchObject({ next: 'execute' });
    expect(decideAutonomousLoop({ ...base, phase: 'execute' }, { nowMs: 2_000, executionComplete: true })).toMatchObject({ next: 'verify' });
    expect(decideAutonomousLoop({ ...base, phase: 'verify' }, { nowMs: 2_000, verificationPassed: true })).toMatchObject({ next: 'publish' });
  });

  it('cancellation wins over all other work', () => {
    expect(
      decideAutonomousLoop(
        { ...base, phase: 'execute', cancellationRequested: true },
        { nowMs: 2_000, executionComplete: true },
      ),
    ).toEqual({ action: 'stop', next: 'cancelled', reason: 'cancellation_requested' });
  });

  it('stops or escalates at hard budgets', () => {
    expect(
      decideAutonomousLoop(
        { ...base, cycle: DEFAULT_AUTONOMOUS_LOOP_BUDGET.maxCycles },
        { nowMs: 2_000 },
      ),
    ).toMatchObject({ action: 'stop', reason: 'cycle_budget_exhausted' });
    expect(
      decideAutonomousLoop(
        { ...base, toolCalls: DEFAULT_AUTONOMOUS_LOOP_BUDGET.maxToolCalls },
        { nowMs: 2_000 },
      ),
    ).toMatchObject({ action: 'escalate', reason: 'tool_budget_exhausted' });
  });

  it('breaks repeated/no-progress loops instead of running perpetually', () => {
    expect(
      decideAutonomousLoop(
        { ...base, repeatedObservation: DEFAULT_AUTONOMOUS_LOOP_BUDGET.maxRepeatedObservation },
        { nowMs: 2_000 },
      ),
    ).toMatchObject({ action: 'sleep', reason: 'repeated_observation' });
    expect(
      decideAutonomousLoop(
        { ...base, noProgressCycles: DEFAULT_AUTONOMOUS_LOOP_BUDGET.maxNoProgressCycles },
        { nowMs: 2_000 },
      ),
    ).toMatchObject({ action: 'escalate', reason: 'no_progress_loop' });
  });
});
