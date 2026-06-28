/**
 * parseWorkflowDefinition is the single validating gateway for the JSONB shapes
 * stored on a Workflow. These tests pin: the canonical "hot lead -> draft a
 * message" definition round-trips; every rejection path (unknown trigger,
 * malformed action, over-deep nesting, oversized arrays, bad autonomy) throws
 * the NAMED WorkflowDefinitionError rather than a raw ZodError or a pass.
 */

import { describe, it, expect } from 'vitest';
import {
  parseWorkflowDefinition,
  WorkflowDefinitionError,
  workflowDefinitionSchema,
  MAX_CONDITION_DEPTH,
  MAX_RULES_PER_GROUP,
  MAX_ACTIONS,
  type WorkflowDefinition,
} from '@/lib/workflows/schema';

// The canonical example from the spec: "a new lead scoring >= 80 should get a
// personalized SMS draft."
const canonical: WorkflowDefinition = {
  trigger: { type: 'lead_score_threshold', config: { min: 80 } },
  conditions: {
    op: 'and',
    rules: [{ field: 'lead.score', operator: 'gte', value: 80 }],
  },
  actions: [
    {
      type: 'draft_message',
      config: {
        channel: 'sms',
        instruction: 'Draft a warm, personalized intro referencing their search.',
      },
    },
  ],
  autonomy: 'draft',
};

/** Build a condition group nested `depth` levels deep (depth=1 is leaf-only). */
function nestedGroup(depth: number): unknown {
  if (depth <= 1) {
    return { op: 'and', rules: [{ field: 'a', operator: 'eq', value: 1 }] };
  }
  return { op: 'and', rules: [nestedGroup(depth - 1)] };
}

describe('parseWorkflowDefinition — accepts', () => {
  it('accepts the canonical hot-lead definition and round-trips it', () => {
    const parsed = parseWorkflowDefinition(canonical);
    expect(parsed).toEqual(canonical);
  });

  it('accepts every trigger type with a valid config', () => {
    const triggers = [
      { type: 'lead_created', config: {} },
      { type: 'lead_score_threshold', config: { min: 50 } },
      { type: 'inbound_message', config: { channel: 'any' } },
      { type: 'inbound_message', config: {} },
      { type: 'tour_completed', config: {} },
      { type: 'deal_stage_changed', config: { toStage: 'under_contract' } },
      { type: 'integration_event', config: { toolkit: 'gmail', event: 'email.received' } },
      { type: 'schedule', config: { cadence: 'daily', hour: 9 } },
    ];
    for (const trigger of triggers) {
      const def = { ...canonical, trigger };
      expect(() => parseWorkflowDefinition(def)).not.toThrow();
    }
  });

  it('accepts every action type with a valid config', () => {
    const actions = [
      { type: 'draft_message', config: { channel: 'email', instruction: 'hi' } },
      { type: 'schedule_message', config: { channel: 'sms', instruction: 'hi', delayMinutes: 60 } },
      { type: 'create_task', config: { title: 'Call back', dueInDays: 2 } },
      { type: 'call_integration', config: { toolkit: 'hubspot', action: 'create_contact', params: { x: 1 } } },
      { type: 'run_chippi', config: { instruction: 'Follow up on this lead.' } },
    ];
    expect(() => parseWorkflowDefinition({ ...canonical, actions })).not.toThrow();
  });

  it('accepts the empty default condition group', () => {
    const def = { ...canonical, conditions: { op: 'and', rules: [] } };
    expect(() => parseWorkflowDefinition(def)).not.toThrow();
  });

  it('accepts nesting exactly at MAX_CONDITION_DEPTH', () => {
    const def = { ...canonical, conditions: nestedGroup(MAX_CONDITION_DEPTH) };
    expect(() => parseWorkflowDefinition(def)).not.toThrow();
  });
});

describe('parseWorkflowDefinition — rejects (named error)', () => {
  it('throws WorkflowDefinitionError, not a raw ZodError', () => {
    let caught: unknown;
    try {
      parseWorkflowDefinition({ not: 'a workflow' });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(WorkflowDefinitionError);
    expect((caught as Error).name).toBe('WorkflowDefinitionError');
    expect((caught as WorkflowDefinitionError).issues.length).toBeGreaterThan(0);
    expect((caught as Error).message).toContain('Invalid workflow definition');
  });

  it('rejects an unknown trigger type', () => {
    const def = { ...canonical, trigger: { type: 'full_moon', config: {} } };
    expect(() => parseWorkflowDefinition(def)).toThrow(WorkflowDefinitionError);
  });

  it('rejects a trigger config that violates its schema', () => {
    // lead_score_threshold requires a numeric `min`.
    const def = { ...canonical, trigger: { type: 'lead_score_threshold', config: { min: 'high' } } };
    expect(() => parseWorkflowDefinition(def)).toThrow(WorkflowDefinitionError);
  });

  it('rejects a malformed action (missing required config field)', () => {
    const def = { ...canonical, actions: [{ type: 'draft_message', config: { channel: 'sms' } }] };
    expect(() => parseWorkflowDefinition(def)).toThrow(WorkflowDefinitionError);
  });

  it('rejects an unknown action type', () => {
    const def = { ...canonical, actions: [{ type: 'launch_rocket', config: {} }] };
    expect(() => parseWorkflowDefinition(def)).toThrow(WorkflowDefinitionError);
  });

  it('rejects an unknown operator in a condition rule', () => {
    const def = {
      ...canonical,
      conditions: { op: 'and', rules: [{ field: 'lead.score', operator: 'between', value: 1 }] },
    };
    expect(() => parseWorkflowDefinition(def)).toThrow(WorkflowDefinitionError);
  });

  it('rejects nesting deeper than MAX_CONDITION_DEPTH', () => {
    const def = { ...canonical, conditions: nestedGroup(MAX_CONDITION_DEPTH + 1) };
    expect(() => parseWorkflowDefinition(def)).toThrow(WorkflowDefinitionError);
  });

  it('rejects more than MAX_RULES_PER_GROUP rules', () => {
    const rules = Array.from({ length: MAX_RULES_PER_GROUP + 1 }, () => ({
      field: 'a',
      operator: 'eq' as const,
      value: 1,
    }));
    const def = { ...canonical, conditions: { op: 'and', rules } };
    expect(() => parseWorkflowDefinition(def)).toThrow(WorkflowDefinitionError);
  });

  it('rejects more than MAX_ACTIONS actions', () => {
    const actions = Array.from({ length: MAX_ACTIONS + 1 }, () => ({
      type: 'run_chippi' as const,
      config: { instruction: 'go' },
    }));
    const def = { ...canonical, actions };
    expect(() => parseWorkflowDefinition(def)).toThrow(WorkflowDefinitionError);
  });

  it('rejects an invalid autonomy value', () => {
    const def = { ...canonical, autonomy: 'yolo' };
    expect(() => parseWorkflowDefinition(def)).toThrow(WorkflowDefinitionError);
  });

  it('rejects unknown top-level keys (strict)', () => {
    const def = { ...canonical, surprise: true };
    expect(() => parseWorkflowDefinition(def)).toThrow(WorkflowDefinitionError);
  });

  it('rejects non-object input', () => {
    expect(() => parseWorkflowDefinition(null)).toThrow(WorkflowDefinitionError);
    expect(() => parseWorkflowDefinition('nope')).toThrow(WorkflowDefinitionError);
    expect(() => parseWorkflowDefinition(42)).toThrow(WorkflowDefinitionError);
  });
});

describe('workflowDefinitionSchema (direct safeParse)', () => {
  it('exposes safeParse for callers that prefer the Result shape', () => {
    expect(workflowDefinitionSchema.safeParse(canonical).success).toBe(true);
    expect(workflowDefinitionSchema.safeParse({}).success).toBe(false);
  });
});
