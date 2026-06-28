/**
 * Unit tests for summarizeFormState / summaryToSentence — the live, blank-
 * tolerant reading of the builder's loose form state that powers the preview
 * card at the top of the builder.
 *
 * Two contracts the preview leans on:
 *   1. A fully-filled form (the "hot lead" template) reads as a clean sentence.
 *   2. A HALF-filled form never produces NaN / "undefined fires undefined" —
 *      every clause degrades to a friendly placeholder so the live preview is
 *      always legible while the realtor is mid-edit.
 *
 * Pure: no DOM, no React, no fetch.
 */

import { describe, it, expect } from 'vitest';
import {
  summarizeFormState,
  summaryToSentence,
} from '@/components/workflows/form-summary';
import { emptyFormState } from '@/components/workflows/workflow-builder';
import type { WorkflowFormState } from '@/components/workflows/build-definition';
import { WORKFLOW_TEMPLATES, cloneTemplateState } from '@/components/workflows/templates';

function hotLeadState(): WorkflowFormState {
  const t = WORKFLOW_TEMPLATES.find((x) => x.id === 'hot-lead-instant-draft');
  if (!t) throw new Error('hot-lead template missing');
  return cloneTemplateState(t);
}

describe('summarizeFormState — filled forms', () => {
  it('reads the hot-lead template as a clean sentence', () => {
    const s = summarizeFormState(hotLeadState());
    expect(s.when).toBe("a lead's score reaches 80");
    expect(s.then).toBe('draft a text');
    expect(s.autonomy).toBe('You approve each one before anything goes out.');
    expect(summaryToSentence(s)).toBe(
      "When a lead's score reaches 80, only if 1 condition matches, I’ll draft a text. You approve each one before anything goes out.",
    );
  });

  it('counts extra actions as "(+N more)"', () => {
    const tour = WORKFLOW_TEMPLATES.find((x) => x.id === 'tour-completed-thanks');
    if (!tour) throw new Error('tour template missing');
    const s = summarizeFormState(cloneTemplateState(tour));
    expect(s.when).toBe('a tour wraps up');
    expect(s.then).toBe('draft a text (+1 more)');
    expect(s.conditions).toBeNull(); // no conditions on that template
  });

  it('phrases OR groups and condition counts', () => {
    const state = emptyFormState();
    state.conditionOp = 'or';
    state.conditions = [
      { id: 'a', field: 'lead.source', operator: 'eq', value: 'zillow' },
      { id: 'b', field: 'lead.score', operator: 'gte', value: '90' },
    ];
    const s = summarizeFormState(state);
    expect(s.conditions).toBe('only if any of 2 conditions match');
  });

  it('ignores half-typed condition rows in the count', () => {
    const state = emptyFormState();
    state.conditions = [
      { id: 'a', field: 'lead.source', operator: 'eq', value: 'zillow' },
      { id: 'b', field: '', operator: 'eq', value: '' }, // not filled yet
    ];
    expect(summarizeFormState(state).conditions).toBe('only if 1 condition matches');
  });

  it('counts a value-less operator (exists) as filled with just a field', () => {
    const state = emptyFormState();
    state.conditions = [{ id: 'a', field: 'contact.email', operator: 'exists', value: '' }];
    expect(summarizeFormState(state).conditions).toBe('only if 1 condition matches');
  });
});

describe('summarizeFormState — blank tolerance (mid-edit)', () => {
  it('never emits NaN or undefined for an empty score threshold', () => {
    const state = emptyFormState();
    state.trigger.min = '';
    const s = summarizeFormState(state);
    expect(s.when).toBe("a lead's score crosses your threshold");
    expect(summaryToSentence(s)).not.toMatch(/NaN|undefined/);
  });

  it('degrades a blank integration trigger to a friendly placeholder', () => {
    const state = emptyFormState();
    state.trigger.type = 'integration_event';
    state.trigger.toolkit = '';
    state.trigger.event = '';
    expect(summarizeFormState(state).when).toBe('a connected app fires an event');
  });

  it('handles a schedule with a blank hour', () => {
    const state = emptyFormState();
    state.trigger.type = 'schedule';
    state.trigger.cadence = 'weekdays';
    state.trigger.hour = '';
    expect(summarizeFormState(state).when).toBe('every weekday');
  });

  it('reads each autonomy level', () => {
    const draft = emptyFormState();
    draft.autonomy = 'draft';
    expect(summarizeFormState(draft).autonomy).toMatch(/approve/i);

    const notify = emptyFormState();
    notify.autonomy = 'notify';
    expect(summarizeFormState(notify).autonomy).toMatch(/keeps you posted/i);

    const auto = emptyFormState();
    auto.autonomy = 'auto';
    expect(summarizeFormState(auto).autonomy).toMatch(/no approval/i);
  });

  it('handles an empty action list', () => {
    const state = emptyFormState();
    state.actions = [];
    expect(summarizeFormState(state).then).toBe('do nothing yet');
  });
});
