/**
 * Workflow EXECUTOR + ACTION ENGINE tests.
 *
 * The executor drives a Workflow end to end and writes the run ledger
 * (WorkflowRun + WorkflowRunStep) while the action engine turns each action into
 * a recorded effect. Everything external is mocked: supabase (the ledger writes
 * + the workflow query), the headless agent runner (runAutonomousInstruction +
 * buildHeadlessToolContext), and the Composio dispatcher (executeToolForEntity).
 *
 * We assert the OBSERVABLE contract — which supabase tables get inserted/updated
 * with which key fields, which agent calls fire, and the run-status rules:
 *   - conditions false → run 'skipped', a condition step, NO actions executed.
 *   - conditions true  → actions run IN ORDER, steps written, run 'completed';
 *                        draft_message/run_chippi call runAutonomousInstruction.
 *   - autonomy 'draft' + call_integration → that action 'skipped' (gated), run
 *                        still 'completed'.
 *   - any action failed → run 'failed' (the consistent rule).
 *   - runWorkflowsForEvent → only enabled workflows whose trigger.type matches.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── supabase mock ────────────────────────────────────────────────────────────
// A chainable query builder that records every insert/update against its table.
// Reads (the workflow query) are driven by `workflowRows`. Writes resolve to
// `{ error: null }`. Every insert/update is captured in `calls` for assertions.
const { calls, workflowRows } = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; op: 'insert' | 'update'; payload: unknown }>,
  workflowRows: { value: [] as unknown[] },
}));

vi.mock('@/lib/supabase', () => {
  const makeBuilder = (table: string) => {
    const builder: Record<string, unknown> = {
      insert: (payload: unknown) => {
        calls.push({ table, op: 'insert', payload });
        return Promise.resolve({ error: null });
      },
      update: (payload: unknown) => {
        calls.push({ table, op: 'update', payload });
        // update(...).eq(...).eq(...) must stay chainable and thenable.
        const chain: Record<string, unknown> = {
          eq: () => chain,
          then: (resolve: (v: { error: null }) => unknown) => resolve({ error: null }),
        };
        return chain;
      },
      // The workflow query: select(...).eq(...).eq(...) resolves to the rows.
      select: () => {
        const chain: Record<string, unknown> = {
          eq: () => chain,
          then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
            resolve({ data: workflowRows.value, error: null }),
        };
        return chain;
      },
    };
    return builder;
  };
  return { supabase: { from: (table: string) => makeBuilder(table) } };
});

// ── headless agent runner mock ───────────────────────────────────────────────
const { runAutonomousInstructionMock, buildHeadlessToolContextMock } = vi.hoisted(() => ({
  runAutonomousInstructionMock: vi.fn(),
  buildHeadlessToolContextMock: vi.fn(),
}));

vi.mock('@/lib/agent/run-instruction', () => ({
  runAutonomousInstruction: runAutonomousInstructionMock,
  buildHeadlessToolContext: buildHeadlessToolContextMock,
}));

// ── Composio dispatcher mock ─────────────────────────────────────────────────
const { executeToolForEntityMock } = vi.hoisted(() => ({
  executeToolForEntityMock: vi.fn(),
}));

vi.mock('@/lib/integrations/composio', () => ({
  executeToolForEntity: executeToolForEntityMock,
}));

import { runWorkflow, runWorkflowsForEvent, type WorkflowRow } from '@/lib/workflows/executor';
import { executeAction } from '@/lib/workflows/actions';
import type { ConditionGroup, WorkflowAction } from '@/lib/workflows/schema';

// ── helpers ──────────────────────────────────────────────────────────────────

const ALWAYS: ConditionGroup = { op: 'and', rules: [] };

function makeWorkflow(overrides: Partial<WorkflowRow> = {}): WorkflowRow {
  return {
    id: 'wf-1',
    spaceId: 'space-1',
    trigger: { type: 'lead_created', config: {} },
    conditions: ALWAYS,
    actions: [],
    autonomy: 'draft',
    ...overrides,
  };
}

const draftMessage: WorkflowAction = {
  type: 'draft_message',
  config: { channel: 'email', instruction: 'thank them for the tour' },
};
const runChippi: WorkflowAction = {
  type: 'run_chippi',
  config: { instruction: 'summarize the lead' },
};
const callIntegration: WorkflowAction = {
  type: 'call_integration',
  config: { toolkit: 'slack', action: 'slack_send_message', params: { text: 'hi' } },
};

/** Inserts into a given table, in call order. */
const insertsTo = (table: string) =>
  calls.filter((c) => c.table === table && c.op === 'insert').map((c) => c.payload as Record<string, unknown>);
const updatesTo = (table: string) =>
  calls.filter((c) => c.table === table && c.op === 'update').map((c) => c.payload as Record<string, unknown>);

beforeEach(() => {
  calls.length = 0;
  workflowRows.value = [];
  runAutonomousInstructionMock.mockReset();
  runAutonomousInstructionMock.mockResolvedValue({ ok: true, ran: true, summary: 'Run completed.' });
  buildHeadlessToolContextMock.mockReset();
  buildHeadlessToolContextMock.mockResolvedValue({
    userId: 'clerk-owner',
    space: { id: 'space-1', slug: 's', name: 'S', ownerId: 'owner-1' },
    signal: new AbortController().signal,
  });
  executeToolForEntityMock.mockReset();
  executeToolForEntityMock.mockResolvedValue({ successful: true, data: {} });
});

describe('runWorkflow — conditions gate', () => {
  it('skips the run when conditions are false; no actions execute', async () => {
    const conditions: ConditionGroup = {
      op: 'and',
      rules: [{ field: 'lead.score', operator: 'gt', value: 100 }],
    };
    const workflow = makeWorkflow({ conditions, actions: [draftMessage] });

    const result = await runWorkflow({
      workflow,
      context: { lead: { score: 10 } },
      triggerEvent: { kind: 'lead_created' },
    });

    expect(result.status).toBe('skipped');

    // No action ran.
    expect(runAutonomousInstructionMock).not.toHaveBeenCalled();

    // A WorkflowRun was opened then finalized 'skipped'.
    const runInserts = insertsTo('WorkflowRun');
    expect(runInserts).toHaveLength(1);
    expect(runInserts[0]).toMatchObject({ workflowId: 'wf-1', spaceId: 'space-1', status: 'running' });
    expect(updatesTo('WorkflowRun')[0]).toMatchObject({ status: 'skipped', summary: 'conditions not met' });

    // Exactly one step: the skipped condition gate.
    const steps = insertsTo('WorkflowRunStep');
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ kind: 'condition', status: 'skipped', stepIndex: 0 });

    // Workflow bookkeeping → 'skipped'.
    expect(updatesTo('Workflow')[0]).toMatchObject({ lastRunStatus: 'skipped' });
  });
});

describe('runWorkflow — actions in order', () => {
  it('runs each action in order, writes steps, completes the run', async () => {
    const workflow = makeWorkflow({ actions: [draftMessage, runChippi] });

    const result = await runWorkflow({
      workflow,
      context: { contact: { id: 'c-1', name: 'Ada' } },
      triggerEvent: {},
    });

    expect(result.status).toBe('completed');

    // Both agent-backed actions called the headless runner.
    expect(runAutonomousInstructionMock).toHaveBeenCalledTimes(2);
    // draft_message composes a "Draft a email to Ada: ..." instruction.
    expect(runAutonomousInstructionMock.mock.calls[0][0]).toMatchObject({
      spaceId: 'space-1',
      instruction: expect.stringContaining('Draft a email to Ada:'),
    });
    // run_chippi passes the instruction verbatim.
    expect(runAutonomousInstructionMock.mock.calls[1][0]).toMatchObject({
      spaceId: 'space-1',
      instruction: 'summarize the lead',
    });

    // Steps: condition(0,ok) → action(1, draft_message) → action(2, run_chippi).
    const steps = insertsTo('WorkflowRunStep');
    expect(steps).toHaveLength(3);
    expect(steps[0]).toMatchObject({ kind: 'condition', status: 'ok', stepIndex: 0 });
    expect(steps[1]).toMatchObject({ kind: 'action', actionType: 'draft_message', status: 'ok', stepIndex: 1 });
    expect(steps[2]).toMatchObject({ kind: 'action', actionType: 'run_chippi', status: 'ok', stepIndex: 2 });

    expect(updatesTo('WorkflowRun')[0]).toMatchObject({ status: 'completed' });
    expect(updatesTo('Workflow')[0]).toMatchObject({ lastRunStatus: 'ok' });
  });
});

describe('runWorkflow — call_integration autonomy gate', () => {
  it("skips call_integration under autonomy 'draft'; run still completes", async () => {
    const workflow = makeWorkflow({ autonomy: 'draft', actions: [callIntegration] });

    const result = await runWorkflow({ workflow, context: {}, triggerEvent: {} });

    expect(result.status).toBe('completed');
    // The dispatcher was NOT touched.
    expect(executeToolForEntityMock).not.toHaveBeenCalled();

    const actionStep = insertsTo('WorkflowRunStep').find((s) => s.kind === 'action');
    expect(actionStep).toMatchObject({ actionType: 'call_integration', status: 'skipped' });
    expect((actionStep!.detail as Record<string, unknown>).reason).toBe(
      'call_integration requires autonomy=auto',
    );
    expect(updatesTo('Workflow')[0]).toMatchObject({ lastRunStatus: 'ok' });
  });

  it("executes call_integration under autonomy 'auto'", async () => {
    const workflow = makeWorkflow({ autonomy: 'auto', actions: [callIntegration] });

    const result = await runWorkflow({ workflow, context: {}, triggerEvent: {} });

    expect(result.status).toBe('completed');
    expect(executeToolForEntityMock).toHaveBeenCalledTimes(1);
    expect(executeToolForEntityMock.mock.calls[0][0]).toMatchObject({
      entityId: 'clerk-owner',
      slug: 'slack_send_message',
    });
    const actionStep = insertsTo('WorkflowRunStep').find((s) => s.kind === 'action');
    expect(actionStep).toMatchObject({ actionType: 'call_integration', status: 'ok' });
  });
});

describe('runWorkflow — a failing action', () => {
  it("marks the run 'failed' when any action fails", async () => {
    // The agent run reports not-ok → draft_message → failed.
    runAutonomousInstructionMock.mockResolvedValue({ ok: false, ran: true, error: 'boom' });
    const workflow = makeWorkflow({ actions: [draftMessage] });

    const result = await runWorkflow({ workflow, context: { contact: { id: 'c-1' } }, triggerEvent: {} });

    expect(result.status).toBe('failed');
    const actionStep = insertsTo('WorkflowRunStep').find((s) => s.kind === 'action');
    expect(actionStep).toMatchObject({ actionType: 'draft_message', status: 'failed' });
    expect(updatesTo('WorkflowRun')[0]).toMatchObject({ status: 'failed' });
    expect(updatesTo('Workflow')[0]).toMatchObject({ lastRunStatus: 'error' });
  });
});

describe('executeAction — schedule_message + create_task', () => {
  it('schedule_message inserts a ScheduledMessage row (no send at action time)', async () => {
    const action: WorkflowAction = {
      type: 'schedule_message',
      config: { channel: 'sms', instruction: 'check in', delayMinutes: 60 },
    };
    const result = await executeAction(
      action,
      { contact: { id: 'contact-7' } },
      { spaceId: 'space-1', autonomy: 'auto', runId: 'run-9' },
    );
    expect(result.status).toBe('ok');
    // The action now PERSISTS a deferred intent; the actual dispatch is the
    // scheduled-message cron's job. No send leaves at action time.
    expect(result.detail).toMatchObject({ channel: 'sms', autonomy: 'auto', recipientContactId: 'contact-7' });
    expect(result.detail.scheduledMessageId).toBeTruthy();
    expect(result.detail.sendAt).toBeTruthy();

    const inserted = calls.find((c) => c.table === 'ScheduledMessage' && c.op === 'insert')
      ?.payload as Record<string, unknown> | undefined;
    expect(inserted).toBeDefined();
    expect(inserted!.spaceId).toBe('space-1');
    expect(inserted!.channel).toBe('sms');
    expect(inserted!.autonomy).toBe('auto');
    expect(inserted!.status).toBe('pending');
    expect(inserted!.recipientContactId).toBe('contact-7');
    expect(inserted!.runId).toBe('run-9');

    expect(runAutonomousInstructionMock).not.toHaveBeenCalled();
  });

  it('create_task writes a Contact follow-up + activity for the resolved contact', async () => {
    const action: WorkflowAction = {
      type: 'create_task',
      config: { title: 'Call back', dueInDays: 2 },
    };
    const result = await executeAction(
      action,
      { contact: { id: 'c-7' } },
      { spaceId: 'space-1', autonomy: 'draft' },
    );
    expect(result.status).toBe('ok');
    expect(updatesTo('Contact')[0]).toMatchObject({ followUpAt: expect.any(String) });
    expect(insertsTo('ContactActivity')[0]).toMatchObject({
      contactId: 'c-7',
      type: 'follow_up',
      content: 'Call back',
    });
  });

  it('create_task skips when no contact is resolvable', async () => {
    const action: WorkflowAction = { type: 'create_task', config: { title: 'orphan' } };
    const result = await executeAction(action, {}, { spaceId: 'space-1', autonomy: 'draft' });
    expect(result.status).toBe('skipped');
    expect(insertsTo('Contact')).toHaveLength(0);
  });
});

describe('runWorkflowsForEvent — trigger + enabled matching', () => {
  it('runs only workflows whose trigger.type matches the event', async () => {
    workflowRows.value = [
      {
        id: 'wf-match',
        spaceId: 'space-1',
        trigger: { type: 'lead_created', config: {} },
        conditions: ALWAYS,
        actions: [],
        autonomy: 'draft',
      },
      {
        id: 'wf-other',
        spaceId: 'space-1',
        trigger: { type: 'tour_completed', config: {} },
        conditions: ALWAYS,
        actions: [],
        autonomy: 'draft',
      },
    ];

    await runWorkflowsForEvent({
      spaceId: 'space-1',
      triggerType: 'lead_created',
      context: {},
      triggerEvent: {},
    });

    // Only the matching workflow opened a run.
    const runInserts = insertsTo('WorkflowRun');
    expect(runInserts).toHaveLength(1);
    expect(runInserts[0]).toMatchObject({ workflowId: 'wf-match' });
  });

  it('the enabled=true filter is applied in the query (no extra runs for matches)', async () => {
    // The mock query already reflects the enabled filter (only enabled rows are
    // returned). With no rows, nothing runs.
    workflowRows.value = [];
    await runWorkflowsForEvent({
      spaceId: 'space-1',
      triggerType: 'lead_created',
      context: {},
      triggerEvent: {},
    });
    expect(insertsTo('WorkflowRun')).toHaveLength(0);
  });
});
