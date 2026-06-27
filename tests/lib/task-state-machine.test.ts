/**
 * canTransition is the pure guard transitionTask leans on before any DB write —
 * it decides which AgentTask status moves are legal. The lifecycle invariants
 * matter: terminal states (completed/cancelled) are dead ends, only failed can
 * be retried (-> queued), and a task can't skip straight from queued to done.
 * Pin the legal moves, the dead-ends, and that no state can transition to
 * itself — a regression would let the task lifecycle loop or resurrect.
 */

import { describe, it, expect } from 'vitest';
import { canTransition, VALID_TRANSITIONS, type TaskStatus } from '@/lib/agent/task-state-machine';

const ALL: TaskStatus[] = ['queued', 'running', 'paused', 'completed', 'failed', 'cancelled'];

describe('canTransition', () => {
  it('allows the documented lifecycle moves', () => {
    expect(canTransition('queued', 'running')).toBe(true);
    expect(canTransition('running', 'paused')).toBe(true);
    expect(canTransition('running', 'completed')).toBe(true);
    expect(canTransition('paused', 'running')).toBe(true);
    expect(canTransition('failed', 'queued')).toBe(true); // retry
    // every state except the terminal ones can be cancelled
    expect(canTransition('queued', 'cancelled')).toBe(true);
    expect(canTransition('running', 'cancelled')).toBe(true);
    expect(canTransition('paused', 'cancelled')).toBe(true);
  });

  it('treats completed and cancelled as terminal dead-ends', () => {
    for (const to of ALL) {
      expect(canTransition('completed', to)).toBe(false);
      expect(canTransition('cancelled', to)).toBe(false);
    }
  });

  it('rejects illegal skips', () => {
    expect(canTransition('queued', 'completed')).toBe(false); // must run first
    expect(canTransition('queued', 'paused')).toBe(false);
    expect(canTransition('paused', 'completed')).toBe(false); // resume before finishing
    expect(canTransition('failed', 'running')).toBe(false); // retry re-queues, not resumes
  });

  it('never allows a state to transition to itself', () => {
    for (const s of ALL) expect(canTransition(s, s)).toBe(false);
  });

  it('matches the VALID_TRANSITIONS table exactly', () => {
    for (const from of ALL) {
      for (const to of ALL) {
        expect(canTransition(from, to)).toBe(VALID_TRANSITIONS[from].includes(to));
      }
    }
  });
});
