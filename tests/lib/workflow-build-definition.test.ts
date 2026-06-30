/**
 * Unit tests for buildDefinition — the pure form-state → WorkflowDefinition
 * mapper the builder relies on.
 *
 * Two contracts the UI leans on:
 *   1. A fully-filled form (the "hot lead" template) produces a definition that
 *      parseWorkflowDefinition ACCEPTS, and the trigger/conditions/actions/
 *      autonomy round-trip exactly.
 *   2. An incomplete form produces a definition that parseWorkflowDefinition
 *      REJECTS — that rejection is precisely how the builder surfaces "you left
 *      something blank" inline. If buildDefinition silently defaulted the
 *      missing values, the UI would lose its only validation signal.
 *
 * Pure: no DOM, no React, no fetch.
 */

import { describe, it, expect } from 'vitest';
import {
  parseWorkflowDefinition,
  WorkflowDefinitionError,
} from '@/lib/workflows/schema';
import {
  buildDefinition,
  type WorkflowFormState,
} from '@/components/workflows/build-definition';
import { WORKFLOW_TEMPLATES, cloneTemplateState } from '@/components/workflows/templates';

function hotLeadState(): WorkflowFormState {
  const template = WORKFLOW_TEMPLATES.find((t) => t.id === 'hot-lead-instant-draft');
  if (!template) throw new Error('hot-lead template missing');
  return cloneTemplateState(template);
}

describe('buildDefinition — hot lead template (filled form)', () => {
  it('produces a definition parseWorkflowDefinition accepts', () => {
    const def = buildDefinition(hotLeadState());
    expect(() => parseWorkflowDefinition(def)).not.toThrow();
  });

  it('round-trips trigger, conditions, actions and autonomy', () => {
    const parsed = parseWorkflowDefinition(buildDefinition(hotLeadState()));

    // Trigger — lead_score_threshold with a numeric min (coerced from "80").
    expect(parsed.trigger.type).toBe('lead_score_threshold');
    expect(parsed.trigger).toEqual({
      type: 'lead_score_threshold',
      config: { min: 80 },
    });

    // Conditions — a flat AND group with one numeric rule.
    expect(parsed.conditions.op).toBe('and');
    expect(parsed.conditions.rules).toEqual([
      { field: 'lead.score', operator: 'gte', value: 80 },
    ]);

    // Actions — one draft_message over email with the template instruction.
    expect(parsed.actions).toHaveLength(1);
    const action = parsed.actions[0];
    expect(action.type).toBe('draft_message');
    if (action.type === 'draft_message') {
      expect(action.config.channel).toBe('email');
      expect(action.config.instruction).toMatch(/warm, personal intro/);
    }

    // Autonomy — draft (the realtor approves).
    expect(parsed.autonomy).toBe('draft');
  });

  it('coerces exists-operator rules to drop the value operand', () => {
    // The Gmail template uses contact.name exists — value must be omitted.
    const gmail = WORKFLOW_TEMPLATES.find((t) => t.id === 'gmail-client-reply');
    if (!gmail) throw new Error('gmail template missing');
    const parsed = parseWorkflowDefinition(buildDefinition(cloneTemplateState(gmail)));
    expect(parsed.conditions.rules[0]).toEqual({
      field: 'contact.name',
      operator: 'exists',
    });
    expect(parsed.conditions.rules[0]).not.toHaveProperty('value');
  });
});

describe('buildDefinition — incomplete form (rejected by schema)', () => {
  it('rejects a lead_score_threshold trigger with a blank min', () => {
    const state = hotLeadState();
    // The realtor cleared the score field — min becomes NaN, which the schema
    // rejects (z.number() fails NaN). The UI surfaces this inline.
    state.trigger.min = '';
    const def = buildDefinition(state);
    expect(() => parseWorkflowDefinition(def)).toThrow(WorkflowDefinitionError);
  });

  it('rejects a draft_message action with a blank instruction', () => {
    const state = hotLeadState();
    state.actions[0].instruction = '';
    const def = buildDefinition(state);
    expect(() => parseWorkflowDefinition(def)).toThrow(WorkflowDefinitionError);
  });

  it('rejects an integration_event trigger missing toolkit/event', () => {
    const state: WorkflowFormState = {
      name: 'Incomplete',
      trigger: {
        type: 'integration_event',
        min: '',
        channel: 'any',
        toolkit: '',
        event: '',
        toStage: '',
        cadence: 'daily',
        hour: '',
      },
      conditionOp: 'and',
      conditions: [],
      actions: [],
      autonomy: 'draft',
    };
    expect(() => parseWorkflowDefinition(buildDefinition(state))).toThrow(
      WorkflowDefinitionError,
    );
  });

  it('surfaces field-level issues on the thrown error', () => {
    const state = hotLeadState();
    state.trigger.min = '';
    try {
      parseWorkflowDefinition(buildDefinition(state));
      throw new Error('expected parseWorkflowDefinition to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(WorkflowDefinitionError);
      if (err instanceof WorkflowDefinitionError) {
        expect(err.issues.length).toBeGreaterThan(0);
      }
    }
  });
});
