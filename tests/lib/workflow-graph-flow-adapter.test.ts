/**
 * Unit tests for the pure graph↔flow adapter that backs the advanced canvas.
 * The canvas component is thin React-Flow glue; the correctness lives here:
 * lossless round-trip, layered layout (children below parents, top-down), and the
 * connect-time cycle guard.
 */

import { describe, it, expect } from 'vitest';
import {
  graphToFlow,
  flowToGraph,
  wouldCreateCycle,
  edgeId,
} from '@/components/workflows/graph-flow-adapter';
import type { WorkflowAction, WorkflowGraph } from '@/lib/workflows/schema';

const draft = (instruction = 'hi'): WorkflowAction => ({
  type: 'draft_message',
  config: { channel: 'sms', instruction },
});

const branchGraph: WorkflowGraph = {
  nodes: [
    { id: 't', kind: 'trigger' },
    { id: 'c', kind: 'condition', condition: { op: 'and', rules: [{ field: 'lead.score', operator: 'gte', value: 80 }] } },
    { id: 'hot', kind: 'action', action: draft('hot') },
    { id: 'warm', kind: 'action', action: draft('warm') },
  ],
  edges: [
    { from: 't', to: 'c' },
    { from: 'c', to: 'hot', branch: 'true' },
    { from: 'c', to: 'warm', branch: 'false' },
  ],
};

describe('graphToFlow / flowToGraph round-trip', () => {
  it('round-trips a branching graph losslessly (logic preserved)', () => {
    const { nodes, edges } = graphToFlow(branchGraph);
    const back = flowToGraph(nodes, edges);
    expect(back.nodes).toEqual(branchGraph.nodes);
    // Edges compare regardless of order.
    expect(new Set(back.edges.map((e) => JSON.stringify(e)))).toEqual(
      new Set(branchGraph.edges.map((e) => JSON.stringify(e))),
    );
  });

  it('maps node kinds to flow types and carries the underlying logic', () => {
    const { nodes } = graphToFlow(branchGraph);
    const c = nodes.find((n) => n.id === 'c');
    expect(c?.type).toBe('condition');
    expect(c?.data.condition?.rules).toHaveLength(1);
    const hot = nodes.find((n) => n.id === 'hot');
    expect(hot?.type).toBe('action');
    expect(hot?.data.action).toEqual(draft('hot'));
  });

  it('carries branch labels onto edges', () => {
    const { edges } = graphToFlow(branchGraph);
    const trueEdge = edges.find((e) => e.source === 'c' && e.target === 'hot');
    expect(trueEdge?.label).toBe('true');
    expect(trueEdge?.data?.branch).toBe('true');
  });

  it('gives stable, unique edge ids', () => {
    const { edges } = graphToFlow(branchGraph);
    const ids = edges.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(edgeId({ from: 'c', to: 'hot', branch: 'true' })).toBe('e:c->hot:true');
  });
});

describe('layered layout', () => {
  it('places children below their parents (increasing y by depth)', () => {
    const { nodes } = graphToFlow(branchGraph);
    const y = (id: string) => nodes.find((n) => n.id === id)!.position.y;
    expect(y('t')).toBeLessThan(y('c'));
    expect(y('c')).toBeLessThan(y('hot'));
    expect(y('c')).toBeLessThan(y('warm'));
  });

  it('sits a diamond-join past its deepest parent', () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: 't', kind: 'trigger' },
        { id: 'a1', kind: 'action', action: draft() },
        { id: 'a2', kind: 'action', action: draft() },
        { id: 'join', kind: 'action', action: draft() },
      ],
      edges: [
        { from: 't', to: 'a1' },
        { from: 'a1', to: 'a2' },
        { from: 't', to: 'join' },
        { from: 'a2', to: 'join' }, // join's deepest parent is a2 (depth 2)
      ],
    };
    const { nodes } = graphToFlow(graph);
    const y = (id: string) => nodes.find((n) => n.id === id)!.position.y;
    expect(y('join')).toBeGreaterThan(y('a2'));
  });
});

describe('wouldCreateCycle', () => {
  const edges = [
    { source: 't', target: 'a1' },
    { source: 'a1', target: 'a2' },
  ];

  it('flags a back-edge that would close a loop', () => {
    expect(wouldCreateCycle(edges, 'a2', 't')).toBe(true); // a2 → t loops back
    expect(wouldCreateCycle(edges, 'a2', 'a1')).toBe(true);
  });

  it('allows a forward edge', () => {
    expect(wouldCreateCycle(edges, 't', 'a2')).toBe(false); // t → a2 is fine (DAG)
  });

  it('flags a self-loop', () => {
    expect(wouldCreateCycle(edges, 'a1', 'a1')).toBe(true);
  });
});
