/**
 * walkGraph — the PURE traversal half of the branching executor.
 *
 * Given a validated WorkflowGraph (Phase 1 guarantees: one trigger entry,
 * acyclic, referential integrity, branch labels only off condition nodes), this
 * walks from the trigger and produces the ordered list of steps that ran, plus
 * a terminal status. It does NO I/O: the caller injects `evaluate` (a condition
 * → boolean) and `runAction` (a WorkflowAction → result). That keeps the walk
 * unit-testable without a DB and lets runWorkflow own persistence + the same
 * autonomy gating the linear path uses.
 *
 * Semantics:
 *   - trigger node: no step; follow all out-edges.
 *   - action node : run it, record an action step, follow all out-edges
 *                   (sequence / fan-out).
 *   - condition   : evaluate; record a condition step (detail carries the taken
 *                   branch); follow out-edges whose `branch` matches the result
 *                   (an unlabeled edge out of a condition is followed always —
 *                   "do this after the gate regardless").
 * Each node runs AT MOST ONCE (a visited set), so a diamond join can't double-
 * run its tail. Deterministic: edges in array order, FIFO queue. A step budget
 * is a belt-and-suspenders cap on top of the schema's bounded node count.
 */

import type { ConditionGroup, WorkflowAction, WorkflowGraph } from './schema';

export type GraphStepStatus = 'ok' | 'failed' | 'skipped';

export interface GraphActionResult {
  status: GraphStepStatus;
  detail?: Record<string, unknown> | null;
}

export interface GraphWalkStep {
  kind: 'condition' | 'action';
  status: GraphStepStatus;
  actionType?: string | null;
  detail?: Record<string, unknown> | null;
}

export interface GraphWalkResult {
  steps: GraphWalkStep[];
  status: 'completed' | 'failed';
}

export interface GraphWalkHandlers {
  evaluate: (condition: ConditionGroup) => boolean;
  runAction: (action: WorkflowAction) => Promise<GraphActionResult>;
}

/** Hard cap on steps processed — defense in depth atop the schema's node bound. */
const MAX_WALK_STEPS = 64;

export async function walkGraph(
  graph: WorkflowGraph,
  handlers: GraphWalkHandlers,
): Promise<GraphWalkResult> {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const outEdges = new Map<string, { to: string; branch?: 'true' | 'false' }[]>();
  for (const e of graph.edges) {
    const list = outEdges.get(e.from);
    if (list) list.push({ to: e.to, branch: e.branch });
    else outEdges.set(e.from, [{ to: e.to, branch: e.branch }]);
  }

  const steps: GraphWalkStep[] = [];
  let anyFailed = false;

  const trigger = graph.nodes.find((n) => n.kind === 'trigger');
  // The schema guarantees exactly one trigger; bail gracefully if somehow absent.
  if (!trigger) return { steps, status: 'completed' };

  const visited = new Set<string>();
  const queue: string[] = [trigger.id];

  while (queue.length > 0 && steps.length < MAX_WALK_STEPS) {
    const id = queue.shift() as string;
    if (visited.has(id)) continue;
    visited.add(id);

    const node = nodeById.get(id);
    if (!node) continue;
    const edges = outEdges.get(id) ?? [];

    if (node.kind === 'trigger') {
      for (const e of edges) queue.push(e.to);
      continue;
    }

    if (node.kind === 'action') {
      const result = await handlers.runAction(node.action);
      if (result.status === 'failed') anyFailed = true;
      steps.push({
        kind: 'action',
        status: result.status,
        actionType: node.action.type,
        detail: result.detail ?? null,
      });
      for (const e of edges) queue.push(e.to);
      continue;
    }

    // condition
    const passed = handlers.evaluate(node.condition);
    steps.push({
      kind: 'condition',
      status: 'ok',
      detail: { passed, branch: passed ? 'true' : 'false' },
    });
    const wanted = passed ? 'true' : 'false';
    for (const e of edges) {
      if (e.branch === undefined || e.branch === wanted) queue.push(e.to);
    }
  }

  return { steps, status: anyFailed ? 'failed' : 'completed' };
}
