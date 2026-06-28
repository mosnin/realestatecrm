/**
 * Unit tests for the OPTIONAL branching graph on a WorkflowDefinition.
 *
 * The graph is additive: a definition with no `graph` is the existing linear
 * model (covered elsewhere); a definition WITH a `graph` must satisfy the
 * structural rules — exactly one trigger entry, referential integrity, branch
 * labels only off condition nodes (and unique per node), bounded size, and
 * ACYCLIC. These are the guarantees the engine walk (Phase 2) and the canvas
 * (Phase 3) get to assume, so they're enforced at parse time.
 */

import { describe, it, expect } from 'vitest';
import {
  parseWorkflowDefinition,
  WorkflowDefinitionError,
  MAX_GRAPH_NODES,
  type WorkflowDefinition,
  type WorkflowGraph,
} from '@/lib/workflows/schema';

const draft = (instruction = 'hi') =>
  ({ type: 'draft_message', config: { channel: 'sms', instruction } }) as const;

/** A valid linear base definition; tests attach a `graph` to it. */
function baseDef(graph?: WorkflowGraph): WorkflowDefinition {
  return {
    trigger: { type: 'lead_created', config: {} },
    conditions: { op: 'and', rules: [] },
    actions: [draft()],
    autonomy: 'draft',
    ...(graph ? { graph } : {}),
  };
}

function parse(graph: WorkflowGraph) {
  return parseWorkflowDefinition(baseDef(graph));
}

describe('workflow graph — valid shapes', () => {
  it('accepts a definition with NO graph (linear, backward-compatible)', () => {
    expect(() => parseWorkflowDefinition(baseDef())).not.toThrow();
  });

  it('accepts a trivial trigger → action chain', () => {
    expect(() =>
      parse({
        nodes: [
          { id: 't', kind: 'trigger' },
          { id: 'a1', kind: 'action', action: draft() },
        ],
        edges: [{ from: 't', to: 'a1' }],
      }),
    ).not.toThrow();
  });

  it('accepts a branch: trigger → condition → (true → A1)(false → A2)', () => {
    expect(() =>
      parse({
        nodes: [
          { id: 't', kind: 'trigger' },
          { id: 'c', kind: 'condition', condition: { op: 'and', rules: [{ field: 'lead.score', operator: 'gte', value: 80 }] } },
          { id: 'a1', kind: 'action', action: draft('hot') },
          { id: 'a2', kind: 'action', action: draft('warm') },
        ],
        edges: [
          { from: 't', to: 'c' },
          { from: 'c', to: 'a1', branch: 'true' },
          { from: 'c', to: 'a2', branch: 'false' },
        ],
      }),
    ).not.toThrow();
  });

  it('round-trips the graph through parse unchanged', () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: 't', kind: 'trigger' },
        { id: 'a1', kind: 'action', action: draft() },
      ],
      edges: [{ from: 't', to: 'a1' }],
    };
    const parsed = parseWorkflowDefinition(baseDef(graph));
    expect(parsed.graph).toEqual(graph);
  });
});

describe('workflow graph — rejected shapes', () => {
  const expectReject = (graph: WorkflowGraph, match?: RegExp) => {
    try {
      parse(graph);
    } catch (err) {
      expect(err).toBeInstanceOf(WorkflowDefinitionError);
      if (match) expect((err as WorkflowDefinitionError).message).toMatch(match);
      return;
    }
    throw new Error('expected the graph to be rejected, but it parsed');
  };

  it('rejects a cycle', () => {
    expectReject(
      {
        nodes: [
          { id: 't', kind: 'trigger' },
          { id: 'a1', kind: 'action', action: draft() },
          { id: 'a2', kind: 'action', action: draft() },
        ],
        edges: [
          { from: 't', to: 'a1' },
          { from: 'a1', to: 'a2' },
          { from: 'a2', to: 'a1' }, // back-edge → cycle
        ],
      },
      /acyclic|cycle/i,
    );
  });

  it('rejects an edge to an unknown node', () => {
    expectReject(
      {
        nodes: [
          { id: 't', kind: 'trigger' },
          { id: 'a1', kind: 'action', action: draft() },
        ],
        edges: [{ from: 't', to: 'ghost' }],
      },
      /unknown node/i,
    );
  });

  it('rejects zero trigger nodes', () => {
    expectReject(
      {
        nodes: [{ id: 'a1', kind: 'action', action: draft() }],
        edges: [],
      },
      /exactly one trigger/i,
    );
  });

  it('rejects two trigger nodes', () => {
    expectReject(
      {
        nodes: [
          { id: 't1', kind: 'trigger' },
          { id: 't2', kind: 'trigger' },
        ],
        edges: [],
      },
      /exactly one trigger/i,
    );
  });

  it('rejects an incoming edge to the trigger', () => {
    expectReject(
      {
        nodes: [
          { id: 't', kind: 'trigger' },
          { id: 'a1', kind: 'action', action: draft() },
        ],
        edges: [
          { from: 't', to: 'a1' },
          { from: 'a1', to: 't' }, // points back at the entry
        ],
      },
      /trigger node cannot have incoming/i,
    );
  });

  it('rejects a branch label on an edge out of a non-condition node', () => {
    expectReject(
      {
        nodes: [
          { id: 't', kind: 'trigger' },
          { id: 'a1', kind: 'action', action: draft() },
        ],
        edges: [{ from: 't', to: 'a1', branch: 'true' }], // trigger is not a condition
      },
      /branch label is only valid/i,
    );
  });

  it('rejects two edges with the same branch label from one condition', () => {
    expectReject(
      {
        nodes: [
          { id: 't', kind: 'trigger' },
          { id: 'c', kind: 'condition', condition: { op: 'and', rules: [] } },
          { id: 'a1', kind: 'action', action: draft() },
          { id: 'a2', kind: 'action', action: draft() },
        ],
        edges: [
          { from: 't', to: 'c' },
          { from: 'c', to: 'a1', branch: 'true' },
          { from: 'c', to: 'a2', branch: 'true' }, // duplicate 'true'
        ],
      },
      /already has a "true" branch/i,
    );
  });

  it('rejects a duplicate node id', () => {
    expectReject(
      {
        nodes: [
          { id: 't', kind: 'trigger' },
          { id: 'dup', kind: 'action', action: draft() },
          { id: 'dup', kind: 'action', action: draft() },
        ],
        edges: [{ from: 't', to: 'dup' }],
      },
      /duplicate node id/i,
    );
  });

  it('rejects a self-loop edge', () => {
    expectReject({
      nodes: [
        { id: 't', kind: 'trigger' },
        { id: 'a1', kind: 'action', action: draft() },
      ],
      edges: [
        { from: 't', to: 'a1' },
        { from: 'a1', to: 'a1' },
      ],
    });
  });

  it('rejects more than MAX_GRAPH_NODES nodes', () => {
    const nodes = [
      { id: 't', kind: 'trigger' as const },
      ...Array.from({ length: MAX_GRAPH_NODES }, (_, i) => ({
        id: `a${i}`,
        kind: 'action' as const,
        action: draft(),
      })),
    ];
    expectReject({ nodes, edges: [] });
  });
});
