/**
 * Unit tests for the linear↔graph bridge that powers the Simple ⇄ Advanced
 * toggle. The round-trip must be lossless for linear workflows, and graphToLinear
 * must return null for anything that branches (so the UI keeps it on the canvas
 * rather than silently dropping a branch).
 */

import { describe, it, expect } from 'vitest';
import {
  linearToGraph,
  graphToLinear,
  isLinearGraph,
} from '@/components/workflows/graph-linear-bridge';
import { parseWorkflowDefinition } from '@/lib/workflows/schema';
import type { ConditionGroup, WorkflowAction, WorkflowGraph } from '@/lib/workflows/schema';

const draft = (instruction = 'hi'): WorkflowAction => ({
  type: 'draft_message',
  config: { channel: 'sms', instruction },
});
const noConds: ConditionGroup = { op: 'and', rules: [] };
const someConds: ConditionGroup = {
  op: 'and',
  rules: [{ field: 'lead.score', operator: 'gte', value: 80 }],
};

describe('linearToGraph → graphToLinear round-trip', () => {
  it('round-trips actions with no conditions', () => {
    const input = { conditions: noConds, actions: [draft('one'), draft('two')] };
    const graph = linearToGraph(input);
    const back = graphToLinear(graph);
    expect(back).toEqual(input);
  });

  it('round-trips actions WITH a top-level condition (true branch)', () => {
    const input = { conditions: someConds, actions: [draft('one'), draft('two')] };
    const graph = linearToGraph(input);
    const back = graphToLinear(graph);
    expect(back).toEqual(input);
  });

  it('produces a graph the schema accepts', () => {
    const graph = linearToGraph({ conditions: someConds, actions: [draft()] });
    expect(() =>
      parseWorkflowDefinition({
        trigger: { type: 'lead_created', config: {} },
        conditions: noConds,
        actions: [],
        autonomy: 'draft',
        graph,
      }),
    ).not.toThrow();
  });

  it('round-trips an empty workflow (trigger only)', () => {
    const input = { conditions: noConds, actions: [] };
    expect(graphToLinear(linearToGraph(input))).toEqual(input);
    expect(isLinearGraph(linearToGraph(input))).toBe(true);
  });
});

describe('graphToLinear rejects branching graphs', () => {
  it('returns null when a condition has a false branch (a real branch)', () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: 't', kind: 'trigger' },
        { id: 'c', kind: 'condition', condition: someConds },
        { id: 'hot', kind: 'action', action: draft('hot') },
        { id: 'warm', kind: 'action', action: draft('warm') },
      ],
      edges: [
        { from: 't', to: 'c' },
        { from: 'c', to: 'hot', branch: 'true' },
        { from: 'c', to: 'warm', branch: 'false' },
      ],
    };
    expect(graphToLinear(graph)).toBeNull();
    expect(isLinearGraph(graph)).toBe(false);
  });

  it('returns null on fan-out (two actions off the trigger)', () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: 't', kind: 'trigger' },
        { id: 'a1', kind: 'action', action: draft() },
        { id: 'a2', kind: 'action', action: draft() },
      ],
      edges: [
        { from: 't', to: 'a1' },
        { from: 't', to: 'a2' },
      ],
    };
    expect(graphToLinear(graph)).toBeNull();
  });

  it('returns null when an orphan node is off the main path', () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: 't', kind: 'trigger' },
        { id: 'a1', kind: 'action', action: draft() },
        { id: 'orphan', kind: 'action', action: draft() }, // not connected
      ],
      edges: [{ from: 't', to: 'a1' }],
    };
    expect(graphToLinear(graph)).toBeNull();
  });

  it('returns null when a condition node carries a nested sub-group (no silent flatten)', () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: 't', kind: 'trigger' },
        {
          id: 'c',
          kind: 'condition',
          condition: {
            op: 'and',
            rules: [
              { field: 'lead.score', operator: 'gte', value: 80 },
              { op: 'or', rules: [{ field: 'lead.source', operator: 'eq', value: 'zillow' }] },
            ],
          },
        },
        { id: 'a1', kind: 'action', action: draft() },
      ],
      edges: [
        { from: 't', to: 'c' },
        { from: 'c', to: 'a1', branch: 'true' },
      ],
    };
    expect(graphToLinear(graph)).toBeNull();
    expect(isLinearGraph(graph)).toBe(false);
  });

  it('returns null with two condition gates in a row', () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: 't', kind: 'trigger' },
        { id: 'c1', kind: 'condition', condition: someConds },
        { id: 'c2', kind: 'condition', condition: someConds },
        { id: 'a1', kind: 'action', action: draft() },
      ],
      edges: [
        { from: 't', to: 'c1' },
        { from: 'c1', to: 'c2', branch: 'true' },
        { from: 'c2', to: 'a1', branch: 'true' },
      ],
    };
    expect(graphToLinear(graph)).toBeNull();
  });
});
