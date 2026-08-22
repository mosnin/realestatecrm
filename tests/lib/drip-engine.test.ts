/**
 * Drip engine tests (lib/drip/engine.ts) — everything external mocked via
 * vi.hoisted, mirroring tests/lib/workflow-scheduled-dispatch.test.ts's
 * chainable-builder pattern.
 *
 * Covers:
 *   1. enrollContact — rejects a sequence/contact from another tenant (the
 *      spaceId-scoped lookup returns nothing), rejects an inactive sequence,
 *      and inserts a spaceId-stamped enrollment on the happy path.
 *   2. advanceEnrollments — STOP-ON-REPLY wins over dispatch: a reply since
 *      enrollment stops the enrollment and schedules nothing.
 *   3. advanceEnrollments — a due step creates a ScheduledMessage with the
 *      right spaceId + dayOffset-derived due time, and advances currentStep.
 *   4. advanceEnrollments — a step that isn't due yet is left untouched.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── supabase mock ────────────────────────────────────────────────────────
const {
  calls,
  sequenceById,
  sequenceList,
  contactRow,
  enrollmentRows,
  agentSettingsRow,
  activityReplyRows,
  inboxReplyRows,
  insertError,
} = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; op: string; payload?: unknown; filters: Array<[string, unknown]> }>,
  // DripSequence per-id lookup (enrollContact): id -> { id, active }
  sequenceById: { value: new Map<string, { id: string; active: boolean }>() },
  // DripSequence space-wide list (advanceEnrollments): full rows incl. steps
  sequenceList: { value: [] as Array<{ id: string; active: boolean; steps: unknown }> },
  contactRow: { value: null as unknown },
  enrollmentRows: { value: [] as unknown[] },
  agentSettingsRow: { value: null as unknown },
  activityReplyRows: { value: [] as unknown[] },
  inboxReplyRows: { value: [] as unknown[] },
  insertError: { value: null as { code?: string; message: string } | null },
}));

vi.mock('@/lib/supabase', () => {
  const makeBuilder = (table: string) => {
    const builder: Record<string, unknown> = {
      insert: (payload: unknown) => {
        calls.push({ table, op: 'insert', payload, filters: [] });
        const chain: Record<string, unknown> = {
          select: () => ({
            single: () =>
              Promise.resolve(
                insertError.value
                  ? { data: null, error: insertError.value }
                  : { data: { id: 'new-enrollment-id', ...(payload as object) }, error: null },
              ),
          }),
          then: (resolve: (v: { error: unknown }) => unknown) =>
            resolve({ error: insertError.value }),
        };
        return chain;
      },
      update: (payload: unknown) => {
        const filters: Array<[string, unknown]> = [];
        calls.push({ table, op: 'update', payload, filters });
        const chain: Record<string, unknown> = {
          eq: (col: string, val: unknown) => {
            filters.push([col, val]);
            return chain;
          },
          then: (resolve: (v: { error: null }) => unknown) => resolve({ error: null }),
        };
        return chain;
      },
      select: (_cols?: unknown, _opts?: unknown) => {
        const filters: Array<[string, unknown]> = [];
        calls.push({ table, op: 'select', filters });
        const chain: Record<string, unknown> = {
          eq: (col: string, val: unknown) => {
            filters.push([col, val]);
            return chain;
          },
          gte: (col: string, val: unknown) => {
            filters.push([`gte:${col}`, val]);
            return chain;
          },
          order: () => chain,
          limit: () => chain,
          maybeSingle: () => Promise.resolve({ data: resolveSingle(table, filters), error: null }),
          then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
            resolve({ data: resolveList(table, filters), error: null }),
        };
        return chain;
      },
    };
    return builder;
  };

  function resolveSingle(table: string, filters: Array<[string, unknown]>): unknown {
    if (table === 'DripSequence') {
      const idFilter = filters.find(([c]) => c === 'id');
      if (!idFilter) return null;
      return sequenceById.value.get(idFilter[1] as string) ?? null;
    }
    if (table === 'Contact') return contactRow.value;
    if (table === 'AgentSettings') return agentSettingsRow.value;
    return null;
  }

  function resolveList(table: string, filters: Array<[string, unknown]>): unknown[] {
    if (table === 'DripSequence') return sequenceList.value;
    if (table === 'DripEnrollment') return enrollmentRows.value;
    if (table === 'ContactActivity') return activityReplyRows.value;
    if (table === 'InboxMessage') return inboxReplyRows.value;
    return [];
  }

  return { supabase: { from: (table: string) => makeBuilder(table) } };
});

import { enrollContact, advanceEnrollments } from '@/lib/drip/engine';

beforeEach(() => {
  calls.length = 0;
  sequenceById.value = new Map();
  sequenceList.value = [];
  contactRow.value = null;
  enrollmentRows.value = [];
  agentSettingsRow.value = null;
  activityReplyRows.value = [];
  inboxReplyRows.value = [];
  insertError.value = null;
});

function scheduledMessageInsert() {
  return calls.find((c) => c.table === 'ScheduledMessage' && c.op === 'insert')?.payload as
    | Record<string, unknown>
    | undefined;
}

function enrollmentUpdates() {
  return calls.filter((c) => c.table === 'DripEnrollment' && c.op === 'update');
}

// ═════════════════════════════════════════════════════════════════════════
// enrollContact
// ═════════════════════════════════════════════════════════════════════════

describe('enrollContact', () => {
  it('rejects a sequence that does not belong to this space (cross-tenant)', async () => {
    // sequenceById has nothing for 'seq-other-tenant' scoped to 'space-1' — the
    // lookup is .eq('id', sequenceId).eq('spaceId', spaceId), so a sequence
    // that belongs to another space simply never resolves.
    contactRow.value = { id: 'contact-1' };

    const result = await enrollContact({
      spaceId: 'space-1',
      sequenceId: 'seq-other-tenant',
      contactId: 'contact-1',
    });

    expect(result.outcome).toBe('sequence_not_found');
    expect(calls.some((c) => c.table === 'DripEnrollment' && c.op === 'insert')).toBe(false);
  });

  it('rejects an inactive sequence', async () => {
    sequenceById.value.set('seq-1', { id: 'seq-1', active: false });
    contactRow.value = { id: 'contact-1' };

    const result = await enrollContact({ spaceId: 'space-1', sequenceId: 'seq-1', contactId: 'contact-1' });

    expect(result.outcome).toBe('sequence_not_found');
  });

  it('rejects a contact that does not belong to this space', async () => {
    sequenceById.value.set('seq-1', { id: 'seq-1', active: true });
    contactRow.value = null; // Contact lookup scoped by spaceId found nothing.

    const result = await enrollContact({ spaceId: 'space-1', sequenceId: 'seq-1', contactId: 'contact-x' });

    expect(result.outcome).toBe('contact_not_found');
    expect(calls.some((c) => c.table === 'DripEnrollment' && c.op === 'insert')).toBe(false);
  });

  it('inserts a spaceId-stamped enrollment on the happy path', async () => {
    sequenceById.value.set('seq-1', { id: 'seq-1', active: true });
    contactRow.value = { id: 'contact-1' };

    const result = await enrollContact({ spaceId: 'space-1', sequenceId: 'seq-1', contactId: 'contact-1' });

    expect(result.outcome).toBe('enrolled');
    const insert = calls.find((c) => c.table === 'DripEnrollment' && c.op === 'insert');
    expect(insert).toBeDefined();
    const payload = insert!.payload as Record<string, unknown>;
    expect(payload.spaceId).toBe('space-1');
    expect(payload.sequenceId).toBe('seq-1');
    expect(payload.contactId).toBe('contact-1');
    expect(payload.status).toBe('enrolled');
    expect(payload.currentStep).toBe(0);
  });

  it('maps a unique-violation (already enrolled) to already_enrolled, not failed', async () => {
    sequenceById.value.set('seq-1', { id: 'seq-1', active: true });
    contactRow.value = { id: 'contact-1' };
    insertError.value = { code: '23505', message: 'duplicate key' };

    const result = await enrollContact({ spaceId: 'space-1', sequenceId: 'seq-1', contactId: 'contact-1' });

    expect(result.outcome).toBe('already_enrolled');
  });
});

// ═════════════════════════════════════════════════════════════════════════
// advanceEnrollments
// ═════════════════════════════════════════════════════════════════════════

const STEPS = [
  { dayOffset: 0, channel: 'sms', instruction: 'Day 0 intro' },
  { dayOffset: 3, channel: 'sms', instruction: 'Day 3 value nudge' },
  { dayOffset: 10, channel: 'email', instruction: 'Day 10 check-in' },
];

function baseSequence(id = 'seq-1') {
  return { id, active: true, steps: STEPS };
}

function baseEnrollment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'enr-1',
    spaceId: 'space-1',
    sequenceId: 'seq-1',
    contactId: 'contact-1',
    enrolledAt: new Date('2026-07-01T00:00:00.000Z').toISOString(),
    currentStep: 0,
    status: 'enrolled',
    ...overrides,
  };
}

describe('advanceEnrollments — stop-on-reply', () => {
  it('stops the enrollment and schedules NOTHING when the contact replied since enrollment (InboxMessage)', async () => {
    sequenceList.value = [baseSequence()];
    enrollmentRows.value = [baseEnrollment()];
    inboxReplyRows.value = [{ id: 'msg-1' }]; // an inbound reply exists

    const now = new Date('2026-07-01T00:05:00.000Z'); // day-0 step is due
    const summary = await advanceEnrollments('space-1', now);

    expect(summary.stoppedReplied).toBe(1);
    expect(summary.scheduled).toBe(0);
    expect(scheduledMessageInsert()).toBeUndefined();

    const update = enrollmentUpdates()[0];
    expect((update.payload as Record<string, unknown>).status).toBe('stopped');
    expect((update.payload as Record<string, unknown>).stopReason).toBe('replied');
    // The update is spaceId-scoped.
    expect(update.filters).toContainEqual(['spaceId', 'space-1']);
  });

  it('stops the enrollment when the reply landed as a ContactActivity row instead', async () => {
    sequenceList.value = [baseSequence()];
    enrollmentRows.value = [baseEnrollment()];
    activityReplyRows.value = [{ id: 'act-1' }];

    const now = new Date('2026-07-01T00:05:00.000Z');
    const summary = await advanceEnrollments('space-1', now);

    expect(summary.stoppedReplied).toBe(1);
    expect(scheduledMessageInsert()).toBeUndefined();
  });

  it('reply STOP wins even when a later step is also due (stop beats dispatch)', async () => {
    sequenceList.value = [baseSequence()];
    // currentStep=1 (day-3 step) is due, and the contact replied.
    enrollmentRows.value = [baseEnrollment({ currentStep: 1 })];
    inboxReplyRows.value = [{ id: 'msg-1' }];

    const now = new Date('2026-07-05T00:00:00.000Z'); // well past day 3
    const summary = await advanceEnrollments('space-1', now);

    expect(summary.stoppedReplied).toBe(1);
    expect(summary.scheduled).toBe(0);
    expect(scheduledMessageInsert()).toBeUndefined();
  });
});

describe('advanceEnrollments — due-step dispatch', () => {
  it('creates a ScheduledMessage with the right spaceId + step when day-0 is due, and advances currentStep', async () => {
    sequenceList.value = [baseSequence()];
    enrollmentRows.value = [baseEnrollment()]; // currentStep 0, enrolledAt now
    agentSettingsRow.value = { autonomyLevel: 'draft_required' };

    const now = new Date('2026-07-01T00:00:00.000Z'); // exactly at enrolledAt — day 0 due
    const summary = await advanceEnrollments('space-1', now);

    expect(summary.scheduled).toBe(1);
    const row = scheduledMessageInsert();
    expect(row).toBeDefined();
    expect(row!.spaceId).toBe('space-1');
    expect(row!.channel).toBe('sms');
    expect(row!.instruction).toBe('Day 0 intro');
    expect(row!.recipientContactId).toBe('contact-1');
    expect(row!.status).toBe('pending');
    expect(row!.autonomy).toBe('draft'); // draft_required maps to draft, never auto by default

    const detail = row!.detail as Record<string, unknown>;
    expect(detail.source).toBe('drip');
    expect(detail.sequenceId).toBe('seq-1');
    expect(detail.dayOffset).toBe(0);

    // currentStep advanced 0 -> 1, still 'enrolled' (more steps remain).
    const update = enrollmentUpdates()[0];
    expect((update.payload as Record<string, unknown>).currentStep).toBe(1);
    expect((update.payload as Record<string, unknown>).status).toBe('enrolled');
  });

  it('does NOT schedule a step that is not due yet', async () => {
    sequenceList.value = [baseSequence()];
    enrollmentRows.value = [baseEnrollment({ currentStep: 1 })]; // day-3 step

    const now = new Date('2026-07-02T00:00:00.000Z'); // only 1 day in — day 3 not due
    const summary = await advanceEnrollments('space-1', now);

    expect(summary.scheduled).toBe(0);
    expect(scheduledMessageInsert()).toBeUndefined();
    expect(enrollmentUpdates()).toHaveLength(0);
  });

  it('maps autonomyLevel=autonomous to autonomy=auto on the ScheduledMessage row', async () => {
    sequenceList.value = [baseSequence()];
    enrollmentRows.value = [baseEnrollment()];
    agentSettingsRow.value = { autonomyLevel: 'autonomous' };

    const now = new Date('2026-07-01T00:00:00.000Z');
    await advanceEnrollments('space-1', now);

    expect(scheduledMessageInsert()!.autonomy).toBe('auto');
  });

  it('completes the enrollment after the final step is scheduled', async () => {
    sequenceList.value = [baseSequence()];
    enrollmentRows.value = [baseEnrollment({ currentStep: 2, enrolledAt: new Date('2026-06-20T00:00:00.000Z').toISOString() })];

    const now = new Date('2026-07-01T00:00:00.000Z'); // 11 days later — day-10 step due
    const summary = await advanceEnrollments('space-1', now);

    expect(summary.scheduled).toBe(1);
    const update = enrollmentUpdates()[0];
    expect((update.payload as Record<string, unknown>).currentStep).toBe(3);
    expect((update.payload as Record<string, unknown>).status).toBe('completed');
  });

  it('every DripEnrollment/DripSequence/Contact/ScheduledMessage query is spaceId-scoped', async () => {
    sequenceList.value = [baseSequence()];
    enrollmentRows.value = [baseEnrollment()];
    agentSettingsRow.value = { autonomyLevel: 'draft_required' };

    await advanceEnrollments('space-1', new Date('2026-07-01T00:00:00.000Z'));

    const scopedTables = ['DripSequence', 'DripEnrollment', 'ContactActivity', 'InboxMessage', 'AgentSettings'];
    for (const call of calls) {
      if (!scopedTables.includes(call.table)) continue;
      if (call.op === 'insert') continue; // insert scope is the payload column, asserted separately
      expect(call.filters.some(([col, val]) => col === 'spaceId' && val === 'space-1')).toBe(true);
    }
  });
});
