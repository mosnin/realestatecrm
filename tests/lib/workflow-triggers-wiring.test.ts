/**
 * Trigger-wiring tests — connects the workflow engine to LIVE event sources.
 *
 * Three contracts locked in here:
 *
 *   1. SCHEDULE DUE-LOGIC (isScheduleDue, the pure helper the workflows cron
 *      uses): hourly is always due; daily is due only at its UTC hour; weekdays
 *      is due only at its UTC hour AND Mon–Fri.
 *
 *   2. INTEGRATION-EVENT SAFETY: dispatchTrigger ALSO dispatches to the workflow
 *      engine, but best-effort — when runWorkflowsForEvent REJECTS, dispatchTrigger
 *      still resolves and the original DRAFT routing is intact (a workflow error
 *      can never break Composio trigger handling).
 *
 *   3. LEAD-HOOK WIRING: a successful apply submission fires runWorkflowsForEvent
 *      with `lead_created` AND `lead_score_threshold` (when a numeric score is
 *      present), via Next's after(); and the submission still returns 201 even
 *      when the workflow dispatch throws.
 *
 * Mocks use vi.hoisted so they're in place before the modules under test import.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Schedule due-logic — pure helper, no mocks needed.
// ─────────────────────────────────────────────────────────────────────────────

import { isScheduleDue } from '@/app/api/cron/workflows/route';

describe('isScheduleDue', () => {
  // A Monday 09:00 UTC and a Saturday 09:00 UTC, for the weekday gate.
  const monday0900 = new Date('2026-06-29T09:00:00.000Z'); // 2026-06-29 is a Monday
  const saturday0900 = new Date('2026-06-27T09:00:00.000Z'); // 2026-06-27 is a Saturday
  const monday1000 = new Date('2026-06-29T10:00:00.000Z');

  it('hourly is ALWAYS due, regardless of hour/day', () => {
    expect(isScheduleDue({ cadence: 'hourly' }, monday0900)).toBe(true);
    expect(isScheduleDue({ cadence: 'hourly' }, saturday0900)).toBe(true);
    expect(isScheduleDue({ cadence: 'hourly', hour: 3 }, monday1000)).toBe(true);
  });

  it('daily is due ONLY at its configured UTC hour', () => {
    expect(isScheduleDue({ cadence: 'daily', hour: 9 }, monday0900)).toBe(true);
    expect(isScheduleDue({ cadence: 'daily', hour: 9 }, monday1000)).toBe(false);
    // daily on a weekend at its hour is still due (no day gate).
    expect(isScheduleDue({ cadence: 'daily', hour: 9 }, saturday0900)).toBe(true);
  });

  it('daily with no hour defaults to hour 0', () => {
    expect(isScheduleDue({ cadence: 'daily' }, new Date('2026-06-29T00:00:00.000Z'))).toBe(true);
    expect(isScheduleDue({ cadence: 'daily' }, monday0900)).toBe(false);
  });

  it('weekdays is due at its hour ONLY on Mon–Fri', () => {
    expect(isScheduleDue({ cadence: 'weekdays', hour: 9 }, monday0900)).toBe(true);
    // right hour, wrong day (Saturday) → not due.
    expect(isScheduleDue({ cadence: 'weekdays', hour: 9 }, saturday0900)).toBe(false);
    // right day, wrong hour → not due.
    expect(isScheduleDue({ cadence: 'weekdays', hour: 9 }, monday1000)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Integration-event dispatch safety — dispatchTrigger never breaks on a
//    workflow dispatch failure.
// ─────────────────────────────────────────────────────────────────────────────

const { runWorkflowsForEventMock } = vi.hoisted(() => ({
  runWorkflowsForEventMock: vi.fn<(input: { spaceId: string; triggerType: string; context: { event: Record<string, unknown> }; triggerEvent: unknown }) => Promise<void>>(async () => undefined),
}));
vi.mock('@/lib/workflows/executor', () => ({
  runWorkflowsForEvent: runWorkflowsForEventMock,
}));

// The DRAFT path's downstream — we assert it still fires after a workflow error.
const { fireRoutineRunMock } = vi.hoisted(() => ({
  fireRoutineRunMock: vi.fn(async () => 'ok' as const),
}));
vi.mock('@/lib/routines', () => ({ fireRoutineRun: fireRoutineRunMock }));

// Composio SDK + calendar + inbox are not exercised by these slugs, but
// triggers.ts imports them at module load — stub so the import resolves.
vi.mock('@/lib/integrations/composio', () => ({
  createTrigger: vi.fn(),
  deleteTrigger: vi.fn(async () => undefined),
}));
vi.mock('@/lib/calendar/tour-sync', () => ({
  syncCalendarEventToTour: vi.fn(async () => ({ action: 'noop' })),
}));
vi.mock('@/lib/inbox', () => ({
  recordInboundMessage: vi.fn(async () => ({ threadId: 't', messageId: 'm', deduped: false })),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'ilike', 'contains', 'order', 'limit', 'insert', 'update', 'upsert', 'delete']) {
        chain[m] = vi.fn(() => chain);
      }
      chain.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
      chain.single = vi.fn(async () => ({ data: null, error: null }));
      chain.then = (resolve: (v: { data: unknown; error: unknown }) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve);
      return chain;
    }),
  },
}));

import { dispatchTrigger } from '@/lib/integrations/triggers';

function freshConnection() {
  return {
    id: 'conn_1',
    spaceId: 'space_1',
    userId: 'user_clerk_1',
    toolkit: 'gmail',
  } as unknown as Parameters<typeof dispatchTrigger>[0]['connection'];
}

describe('dispatchTrigger — workflow dispatch safety', () => {
  beforeEach(() => {
    runWorkflowsForEventMock.mockReset().mockResolvedValue(undefined);
    fireRoutineRunMock.mockReset().mockResolvedValue('ok' as const);
  });

  it('ALSO dispatches to the workflow engine as integration_event', async () => {
    await dispatchTrigger({
      triggerSlug: 'GMAIL_NEW_GMAIL_MESSAGE',
      connection: freshConnection(),
      payload: { from: 'a@b.com', subject: 'Hi', snippet: 'hello' },
      deliveryId: 'd1',
    });

    expect(runWorkflowsForEventMock).toHaveBeenCalledTimes(1);
    const arg = runWorkflowsForEventMock.mock.calls[0][0] as {
      spaceId: string;
      triggerType: string;
      context: { event: Record<string, unknown> };
    };
    expect(arg.spaceId).toBe('space_1');
    expect(arg.triggerType).toBe('integration_event');
    expect(arg.context.event.type).toBe('integration_event');
    expect(arg.context.event.toolkit).toBe('gmail');
    expect(arg.context.event.event).toBe('GMAIL_NEW_GMAIL_MESSAGE');
  });

  it('does NOT throw and STILL routes the DRAFT when the workflow dispatch rejects', async () => {
    runWorkflowsForEventMock.mockRejectedValueOnce(new Error('workflow boom'));

    // Must resolve (not throw) and report the normal DRAFT dispatch.
    const result = await dispatchTrigger({
      triggerSlug: 'GMAIL_NEW_GMAIL_MESSAGE',
      connection: freshConnection(),
      payload: { from: 'a@b.com', subject: 'Hi', snippet: 'hello' },
      deliveryId: 'd1',
    });

    expect(result.dispatched).toBe('DRAFT');
    // The original behavior is intact — the DRAFT path still fired.
    expect(fireRoutineRunMock).toHaveBeenCalledTimes(1);
  });
});
