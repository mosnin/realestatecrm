/**
 * Unit tests for selectMatchingWorkflows — the pure gating that decides which of
 * a space's enabled workflows an event should run, plus the "matched nothing"
 * diagnostic that makes a wrong-slug integration_event miss observable instead
 * of silent.
 */

import { describe, it, expect } from 'vitest';
import { selectMatchingWorkflows, type WorkflowRow } from '@/lib/workflows/executor';

const draft = { type: 'draft_message', config: { channel: 'sms', instruction: 'hi' } } as const;

function wf(id: string, trigger: WorkflowRow['trigger']): WorkflowRow {
  return {
    id,
    spaceId: 's1',
    trigger,
    conditions: { op: 'and', rules: [] },
    actions: [draft],
    autonomy: 'draft',
  };
}

const intCtx = (toolkit: string, event: string) => ({
  event: { type: 'integration_event' as const, toolkit, event },
});

describe('selectMatchingWorkflows — integration_event', () => {
  it('matches the workflow keyed to the exact toolkit+event', () => {
    const workflows = [
      wf('a', { type: 'integration_event', config: { toolkit: 'gmail', event: 'GMAIL_NEW' } }),
      wf('b', { type: 'integration_event', config: { toolkit: 'slack', event: 'SLACK_MSG' } }),
      wf('c', { type: 'lead_created', config: {} }),
    ];
    const { matching, unmatched } = selectMatchingWorkflows(workflows, {
      triggerType: 'integration_event',
      context: intCtx('gmail', 'GMAIL_NEW'),
    });
    expect(matching.map((w) => w.id)).toEqual(['a']);
    expect(unmatched).toBeNull();
  });

  it('reports a diagnostic when candidates exist but none match the slug', () => {
    const workflows = [
      wf('a', { type: 'integration_event', config: { toolkit: 'gmail', event: 'GMAIL_NEW' } }),
    ];
    const { matching, unmatched } = selectMatchingWorkflows(workflows, {
      triggerType: 'integration_event',
      context: intCtx('gmail', 'SOMETHING_ELSE'), // wrong slug
    });
    expect(matching).toHaveLength(0);
    expect(unmatched).toEqual({ candidates: 1, toolkit: 'gmail', event: 'SOMETHING_ELSE' });
  });

  it('does NOT report a diagnostic when there are no integration_event candidates', () => {
    const workflows = [wf('c', { type: 'lead_created', config: {} })];
    const { matching, unmatched } = selectMatchingWorkflows(workflows, {
      triggerType: 'integration_event',
      context: intCtx('gmail', 'GMAIL_NEW'),
    });
    expect(matching).toHaveLength(0);
    expect(unmatched).toBeNull();
  });
});

describe('selectMatchingWorkflows — lead_score_threshold', () => {
  const workflows = [
    wf('hot', { type: 'lead_score_threshold', config: { min: 80 } }),
    wf('any', { type: 'lead_score_threshold', config: { min: 0 } }),
  ];

  it('runs only thresholds the score meets', () => {
    const { matching } = selectMatchingWorkflows(workflows, {
      triggerType: 'lead_score_threshold',
      context: { event: { type: 'lead_score_threshold', score: 85 } },
    });
    expect(matching.map((w) => w.id).sort()).toEqual(['any', 'hot']);
  });

  it('excludes thresholds the score does not meet', () => {
    const { matching } = selectMatchingWorkflows(workflows, {
      triggerType: 'lead_score_threshold',
      context: { event: { type: 'lead_score_threshold', score: 50 } },
    });
    expect(matching.map((w) => w.id)).toEqual(['any']);
  });

  it('fails closed on a non-numeric score', () => {
    const { matching } = selectMatchingWorkflows(workflows, {
      triggerType: 'lead_score_threshold',
      context: { event: { type: 'lead_score_threshold', score: 'oops' } },
    });
    expect(matching).toHaveLength(0);
  });
});

describe('selectMatchingWorkflows — deal_stage_changed', () => {
  const workflows = [
    wf('under_contract', { type: 'deal_stage_changed', config: { toStage: 'Under Contract' } }),
    wf('any_stage', { type: 'deal_stage_changed', config: {} }),
  ];

  it('runs a toStage-scoped workflow only when the deal moved INTO that stage (case-insensitive)', () => {
    const { matching } = selectMatchingWorkflows(workflows, {
      triggerType: 'deal_stage_changed',
      context: { event: { type: 'deal_stage_changed', toStage: 'under contract' } },
    });
    expect(matching.map((w) => w.id).sort()).toEqual(['any_stage', 'under_contract']);
  });

  it('excludes a toStage-scoped workflow when the deal moved into a different stage', () => {
    const { matching } = selectMatchingWorkflows(workflows, {
      triggerType: 'deal_stage_changed',
      context: { event: { type: 'deal_stage_changed', toStage: 'Closed Won' } },
    });
    expect(matching.map((w) => w.id)).toEqual(['any_stage']);
  });

  it('an unscoped (blank toStage) workflow fires on every stage change', () => {
    const { matching } = selectMatchingWorkflows([workflows[1]], {
      triggerType: 'deal_stage_changed',
      context: { event: { type: 'deal_stage_changed', toStage: 'Anything' } },
    });
    expect(matching.map((w) => w.id)).toEqual(['any_stage']);
  });
});

describe('selectMatchingWorkflows — trigger-type filter', () => {
  it('only considers workflows of the event trigger type', () => {
    const workflows = [
      wf('lead', { type: 'lead_created', config: {} }),
      wf('tour', { type: 'tour_completed', config: {} }),
    ];
    const { matching } = selectMatchingWorkflows(workflows, {
      triggerType: 'lead_created',
      context: { event: { type: 'lead_created' } },
    });
    expect(matching.map((w) => w.id)).toEqual(['lead']);
  });
});
