/**
 * End-to-end composition regression tests.
 *
 * Drives the REAL authoring pipeline the builder uses — blankAction-style form
 * rows → buildDefinition → parseWorkflowDefinition — with every action type in
 * ONE definition (the per-type tests never compose them all), then chains the
 * pure runtime actions through executeAction to prove the context namespaces
 * ({{vars.*}}, {{lookup.*}}) compose across steps in a shared run context.
 * A new action type that misses any layer (form row, buildAction, schema
 * union, executor dispatch) breaks the 17-type assertion here.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }));

import { buildDefinition } from '@/components/workflows/build-definition';
import type { ActionRowState, WorkflowFormState } from '@/components/workflows/build-definition';
import { parseWorkflowDefinition } from '@/lib/workflows/schema';
import { executeAction } from '@/lib/workflows/actions';

function blankRow(over: Partial<ActionRowState>): ActionRowState {
  return {
    id: `act-${Math.random().toString(36).slice(2, 8)}`,
    type: 'draft_message',
    retryCount: '3',
    stepEnabled: true,
    channel: 'email',
    instruction: '',
    delayMinutes: '',
    delayUnit: 'minutes',
    delayMode: 'relative',
    untilWeekday: '1',
    untilHour: '9',
    untilDate: '',
    title: '',
    dueInDays: '',
    toolkit: '',
    action: '',
    paramsJson: '',
    filterField: '',
    filterOperator: 'eq',
    filterValue: '',
    formatterInput: '',
    formatterOperation: 'uppercase',
    formatterFind: '',
    formatterReplace: '',
    formatterFormat: 'MM/DD/YYYY',
    formatterToFixed: '',
    formatterFallback: '',
    formatterTruncateLength: '',
    formatterTruncateSuffix: '',
    formatterSplitSeparator: '',
    formatterSplitIndex: '',
    formatterRegexPattern: '',
    formatterRegexFlags: '',
    webhookUrl: '',
    webhookBody: '',
    webhookHeaders: '',
    updateField: 'score_label',
    updateValue: '',
    notifyTitle: '',
    notifyBody: '',
    branchPaths: [],
    subWorkflowId: '',
    lookupInput: '',
    lookupEntriesJson: '',
    lookupFallback: '',
    varName: '',
    varValue: '',
    varDefault: '',
    ...over,
  };
}

describe('audit: full authoring pipeline composition', () => {
  it('builds + parses a workflow using every action type in one definition', () => {
    const rows: ActionRowState[] = [
      blankRow({ type: 'draft_message', channel: 'email', instruction: 'Say hello to the lead warmly.' }),
      blankRow({ type: 'schedule_message', channel: 'sms', instruction: 'Follow up politely.', delayMinutes: '2', delayUnit: 'hours' }),
      blankRow({ type: 'create_task', title: 'Call {{lead.name}}', dueInDays: '2' }),
      blankRow({ type: 'run_chippi', instruction: 'Research the neighborhood for this lead.' }),
      blankRow({ type: 'delay', delayMinutes: '30', delayUnit: 'minutes' }),
      blankRow({ type: 'filter', filterField: 'lead.score', filterOperator: 'gte', filterValue: '50' }),
      blankRow({ type: 'formatter', formatterInput: 'lead.name', formatterOperation: 'uppercase' }),
      blankRow({ type: 'webhook_post', webhookUrl: 'https://example.com/hook' }),
      blankRow({ type: 'update_lead', updateField: 'tag_add', updateValue: 'audited' }),
      blankRow({ type: 'notify_agent', notifyTitle: 'Audit ping' }),
      blankRow({ type: 'call_integration', toolkit: 'gmail', action: 'send_email' }),
      blankRow({ type: 'iterate', filterField: 'lead.tags', instruction: 'Handle {{item}} for the lead.' }),
      blankRow({ type: 'lookup_table', lookupInput: '{{lead.state}}', lookupEntriesJson: '[{"key":"TX","value":"Texas"}]', lookupFallback: 'Unknown' }),
      blankRow({ type: 'set_variable', varName: 'tier', varValue: 'gold' }),
      blankRow({ type: 'get_variable', varName: 'tier', varDefault: 'bronze' }),
      blankRow({ type: 'run_workflow', subWorkflowId: '4dc45e1e-9ffd-4c3e-b039-6392fa08bd35' }),
      blankRow({
        type: 'branch',
        branchPaths: [
          {
            id: 'bp-1',
            label: 'Hot',
            field: 'lead.score',
            operator: 'gte',
            value: '80',
            actions: [blankRow({ type: 'notify_agent', notifyTitle: 'Hot lead' })],
          },
        ],
      }),
    ];

    const state: WorkflowFormState = {
      name: 'Audit — every action type',
      trigger: {
        type: 'lead_created', min: '', channel: 'any', toolkit: '', event: '',
        toStage: '', cadence: 'daily', hour: '',
      },
      conditionOp: 'and',
      conditions: [],
      actions: rows,
      autonomy: 'draft',
    };

    const definition = buildDefinition(state);
    // parseWorkflowDefinition throws WorkflowDefinitionError with field issues on any bad shape.
    const parsed = parseWorkflowDefinition(definition);
    expect(parsed.actions).toHaveLength(17);
    expect(new Set(parsed.actions.map((a) => a.type)).size).toBe(17);
  });

  it('chains pure runtime steps: set_variable → lookup_table → get_variable share one context', async () => {
    const context: Record<string, unknown> = { lead: { state: 'TX', name: 'Dana' } };
    const opts = { spaceId: 'space_audit', autonomy: 'draft' as const, runId: 'audit' };

    const set = await executeAction(
      { type: 'set_variable', config: { name: 'state', value: '{{lead.state}}' } },
      context, opts,
    );
    expect(set.status).toBe('ok');

    const lookup = await executeAction(
      { type: 'lookup_table', config: { input: '{{vars.state}}', entries: [{ key: 'TX', value: 'Texas' }] } },
      context, opts,
    );
    expect(lookup.status).toBe('ok');
    expect(lookup.detail.output).toBe('Texas');

    const get = await executeAction(
      { type: 'get_variable', config: { name: 'state', defaultValue: 'nowhere' } },
      context, opts,
    );
    expect(get.status).toBe('ok');
    expect(get.detail.value).toBe('TX');
    expect((context.lookup as Record<string, unknown>).output).toBe('Texas');
  });
});
