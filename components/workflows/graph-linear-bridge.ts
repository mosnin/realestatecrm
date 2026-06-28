/**
 * graph-linear-bridge — the lossless seam between the LINEAR builder (When / If /
 * Then) and the ADVANCED graph canvas.
 *
 * Switching Simple → Advanced synthesizes a trivial chain graph from the linear
 * definition so the realtor starts the canvas from what they already had.
 * Switching Advanced → Simple is only offered when the graph is STILL a straight
 * line (no branches) — graphToLinear returns null otherwise, and the UI keeps
 * the workflow on the canvas with a calm note rather than silently dropping a
 * branch. Pure + dependency-light so the round-trip is unit-tested.
 *
 * Chain shape: trigger → [condition (true) →] a1 → a2 → …  A top-level condition
 * group becomes a single condition node taken on its `true` branch; no top-level
 * rules → the trigger feeds the first action directly.
 */

import type {
  ConditionGroup,
  WorkflowAction,
  WorkflowEdge,
  WorkflowGraph,
  WorkflowNode,
} from '@/lib/workflows/schema';

const EMPTY_CONDITIONS: ConditionGroup = { op: 'and', rules: [] };

/** Build a straight-line graph from a linear definition's conditions + actions. */
export function linearToGraph(input: {
  conditions: ConditionGroup;
  actions: WorkflowAction[];
}): WorkflowGraph {
  const nodes: WorkflowNode[] = [{ id: 't', kind: 'trigger' }];
  const edges: WorkflowEdge[] = [];
  let prev = 't';
  const hasConditions = input.conditions.rules.length > 0;

  if (hasConditions) {
    nodes.push({ id: 'c', kind: 'condition', condition: input.conditions });
    edges.push({ from: prev, to: 'c' });
    prev = 'c';
  }

  input.actions.forEach((action, i) => {
    const id = `a${i}`;
    nodes.push({ id, kind: 'action', action });
    // The first edge out of the condition takes the `true` branch; everything
    // else is a plain sequence edge.
    if (hasConditions && i === 0) edges.push({ from: prev, to: id, branch: 'true' });
    else edges.push({ from: prev, to: id });
    prev = id;
  });

  return { nodes, edges };
}

/**
 * Convert a graph back to a linear { conditions, actions } — or null when it
 * BRANCHES (so the caller knows to keep it on the canvas). "Linear" means: a
 * single path from the trigger where every node has at most one outgoing edge,
 * any condition node carries only a `true` edge (no `false` branch), there's at
 * most one condition, and every node lies on that one path (no orphans/fan-out).
 */
export function graphToLinear(
  graph: WorkflowGraph,
): { conditions: ConditionGroup; actions: WorkflowAction[] } | null {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const outBySource = new Map<string, WorkflowEdge[]>();
  for (const e of graph.edges) {
    const list = outBySource.get(e.from);
    if (list) list.push(e);
    else outBySource.set(e.from, [e]);
  }

  const trigger = graph.nodes.find((n) => n.kind === 'trigger');
  if (!trigger) return null;

  let conditions: ConditionGroup = EMPTY_CONDITIONS;
  let conditionsSeen = 0;
  const actions: WorkflowAction[] = [];

  let current = trigger.id;
  const walked = new Set<string>([current]);
  // Follow single out-edges; any fork (or a condition `false` edge) → branching.
  for (let guard = 0; guard <= graph.nodes.length; guard++) {
    const out = outBySource.get(current) ?? [];
    if (out.length === 0) break; // end of the line
    if (out.length > 1) return null; // fan-out → branches

    const edge = out[0];
    const node = nodeById.get(current);
    // A condition that only emits its lone edge as `false` isn't the linear
    // shape linearToGraph produces; treat any non-`true` branch as branching.
    if (node?.kind === 'condition' && edge.branch === 'false') return null;

    const next = nodeById.get(edge.to);
    if (!next || walked.has(next.id)) return null; // dangling or loop (shouldn't happen)
    walked.add(next.id);

    if (next.kind === 'condition') {
      conditionsSeen += 1;
      if (conditionsSeen > 1) return null; // more than one gate → not the linear shape
      conditions = next.condition;
    } else if (next.kind === 'action') {
      actions.push(next.action);
    } else {
      return null; // a second trigger, etc.
    }
    current = next.id;
  }

  // Every node must lie on the single path — an orphan means a disconnected
  // branch we can't represent linearly.
  if (walked.size !== graph.nodes.length) return null;

  return { conditions, actions };
}

/** True when a graph round-trips to a linear definition (so Simple mode is safe). */
export function isLinearGraph(graph: WorkflowGraph): boolean {
  return graphToLinear(graph) !== null;
}
