import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  claimOccurrence,
  durableScheduleOccurrencesEnabled,
  finishOccurrence,
  planWorkflowResume,
  scheduleOccurrenceIdempotencyKey,
  scheduleStepIdempotencyKey,
  scheduleStepKey,
  type PlannedWorkflowStep,
  type ScheduleOccurrenceRecord,
  type ScheduleOccurrenceStepRecord,
} from '@/lib/workflows/durable-occurrences';

const NOW = new Date('2026-07-28T12:00:00.000Z');
const WORKER_A = 'worker-a';
const WORKER_B = 'worker-b';

function occurrence(overrides: Partial<ScheduleOccurrenceRecord> = {}): ScheduleOccurrenceRecord {
  return {
    id: '6c60314e-1f04-4aa3-bf68-e6253fdfa25f',
    spaceId: 'space-1',
    scheduleType: 'workflow',
    scheduleId: 'workflow-1',
    scheduledFor: '2026-07-28T09:00:00.000Z',
    workflowVersion: 7,
    status: 'pending',
    attempt: 0,
    maxAttempts: 3,
    availableAt: '2026-07-28T09:00:00.000Z',
    leaseOwner: null,
    leaseExpiresAt: null,
    leaseGeneration: 0,
    cancellationRequestedAt: null,
    lastError: null,
    ...overrides,
  };
}

function recordedStep(
  planned: PlannedWorkflowStep,
  status: ScheduleOccurrenceStepRecord['status'],
): ScheduleOccurrenceStepRecord {
  return {
    id: `step-${planned.stepIndex}`,
    occurrenceId: '6c60314e-1f04-4aa3-bf68-e6253fdfa25f',
    stepKey: scheduleStepKey(planned),
    idempotencyKey: `idempotency-${planned.stepIndex}`,
    stepIndex: planned.stepIndex,
    actionType: planned.actionType,
    status,
    attempt: 1,
    maxAttempts: 3,
    availableAt: NOW.toISOString(),
    leaseOwner: null,
    leaseExpiresAt: null,
    occurrenceLeaseGeneration: 1,
    lastError: status === 'failed' ? 'provider rejected request' : null,
  };
}

afterEach(() => vi.unstubAllEnvs());

describe('durable schedule occurrences', () => {
  it('converges duplicate schedule-slot materialization on one stable key', () => {
    const first = scheduleOccurrenceIdempotencyKey({
      spaceId: 'space-1',
      scheduleType: 'workflow',
      scheduleId: 'workflow-1',
      scheduledFor: '2026-07-28T09:00:00Z',
    });
    const duplicate = scheduleOccurrenceIdempotencyKey({
      spaceId: 'space-1',
      scheduleType: 'workflow',
      scheduleId: 'workflow-1',
      scheduledFor: new Date('2026-07-28T09:00:00.000Z'),
    });

    expect(first).toBe(duplicate);
    expect(first).toMatch(/^schedule-occurrence:v1:[a-f0-9]{64}$/);
    expect(scheduleOccurrenceIdempotencyKey({
      spaceId: 'space-2',
      scheduleType: 'workflow',
      scheduleId: 'workflow-1',
      scheduledFor: '2026-07-28T09:00:00Z',
    })).not.toBe(first);
  });

  it('lets one claimant win and makes a concurrent claimant wait for its lease', () => {
    const first = claimOccurrence(occurrence(), WORKER_A, NOW, 60);
    const second = claimOccurrence(first.record, WORKER_B, new Date(NOW.getTime() + 1_000), 60);

    expect(first.claimed).toBe(true);
    expect(first.record.status).toBe('claimed');
    expect(first.record.leaseOwner).toBe(WORKER_A);
    expect(second).toMatchObject({ claimed: false, reason: 'leased' });
  });

  it('resumes after a later failure without replaying proven-completed earlier work', () => {
    const first: PlannedWorkflowStep = { stepIndex: 1, stableId: 'send-intake-draft', actionType: 'draft_message' };
    const second: PlannedWorkflowStep = { stepIndex: 2, stableId: 'tag-lead', actionType: 'update_contact' };
    const decisions = planWorkflowResume({
      occurrenceId: occurrence().id,
      occurrenceWorkflowVersion: 7,
      workflowVersion: 7,
      plannedSteps: [first, second],
      recordedSteps: [recordedStep(first, 'completed'), recordedStep(second, 'failed')],
      now: NOW,
      cancellationRequested: false,
    });

    expect(decisions.map((decision) => decision.kind)).toEqual(['skip_completed', 'execute']);
    const retry = decisions[1];
    expect(retry).toMatchObject({ stepKey: scheduleStepKey(second) });
    if (retry.kind !== 'execute') throw new Error('expected resumable second step');
    expect(retry.idempotencyKey).toBe(scheduleStepIdempotencyKey({
      occurrenceId: occurrence().id,
      workflowVersion: 7,
      step: second,
    }));

    expect(() => planWorkflowResume({
      occurrenceId: occurrence().id,
      occurrenceWorkflowVersion: 7,
      workflowVersion: 8,
      plannedSteps: [first],
      recordedSteps: [],
      now: NOW,
      cancellationRequested: false,
    })).toThrow(/definition version changed/);
  });

  it('leaves retry, dead-letter, and cancellation as explicit states', () => {
    const claimed = claimOccurrence(occurrence(), WORKER_A, NOW).record;
    const retry = finishOccurrence({
      record: claimed,
      workerId: WORKER_A,
      leaseGeneration: claimed.leaseGeneration,
      outcome: 'retryable_failure',
      now: NOW,
      retryAfterSeconds: 45,
      error: 'worker timeout',
    });
    expect(retry).toMatchObject({ status: 'retry_wait', leaseOwner: null, lastError: 'worker timeout' });
    expect(new Date(retry.availableAt).getTime()).toBe(NOW.getTime() + 45_000);

    const exhausted = finishOccurrence({
      record: { ...claimed, attempt: 3, maxAttempts: 3 },
      workerId: WORKER_A,
      leaseGeneration: claimed.leaseGeneration,
      outcome: 'retryable_failure',
      now: NOW,
      error: 'third timeout',
    });
    expect(exhausted.status).toBe('dead_letter');

    const cancelled = finishOccurrence({
      record: { ...claimed, cancellationRequestedAt: NOW.toISOString() },
      workerId: WORKER_A,
      leaseGeneration: claimed.leaseGeneration,
      outcome: 'completed',
      now: NOW,
    });
    expect(cancelled.status).toBe('cancelled');

    const reclaimed = claimOccurrence(
      claimed,
      WORKER_A,
      new Date(NOW.getTime() + 61_000),
    ).record;
    expect(() => finishOccurrence({
      record: claimed,
      workerId: WORKER_A,
      leaseGeneration: claimed.leaseGeneration,
      outcome: 'completed',
      now: new Date(NOW.getTime() + 61_000),
    })).toThrow(/active lease owner/);
    expect(reclaimed.leaseGeneration).toBe(claimed.leaseGeneration + 1);
    expect(() => finishOccurrence({
      record: reclaimed,
      workerId: WORKER_A,
      leaseGeneration: claimed.leaseGeneration,
      outcome: 'completed',
      now: new Date(NOW.getTime() + 61_000),
    })).toThrow(/active lease owner/);
  });

  it('stays disabled unless the new occurrence flag is explicitly true', () => {
    vi.stubEnv('DURABLE_SCHEDULE_OCCURRENCES_ENABLED', '');
    expect(durableScheduleOccurrencesEnabled()).toBe(false);
    vi.stubEnv('DURABLE_SCHEDULE_OCCURRENCES_ENABLED', 'true');
    expect(durableScheduleOccurrencesEnabled()).toBe(true);
  });
});
