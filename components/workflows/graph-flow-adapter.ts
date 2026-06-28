/**
 * graph-flow-adapter — the PURE bridge between a WorkflowGraph (the persisted,
 * validated logic) and the React-Flow node/edge arrays the canvas renders.
 *
 * Kept DOM-free and dependency-light (only the schema types) so the
 * correctness-critical parts — the layered auto-layout, the lossless inverse,
 * and the connect-time cycle guard — are unit-tested without a browser. The
 * canvas component (workflow-canvas.tsx) is then thin glue over this.
 *
 * Positions are DERIVED (a layered left→right layout from the trigger), not
 * stored on the graph — the graph is logic, not pixels. Re-opening re-lays-out;
 * a v1 tradeoff that keeps the data model clean.
 */

import type {
  ConditionGroup,
  WorkflowAction,
  WorkflowEdge,
  WorkflowGraph,
  WorkflowNode,
} from '@/lib/workflows/schema';

/** Structural React-Flow node shape (compatible with @xyflow/react's Node). */
export interface FlowNode {
  id: string;
  type: 'trigger' | 'condition' | 'action';
  position: { x: number; y: number };
  data: FlowNodeData;
}

export interface FlowNodeData {
  kind: WorkflowNode['kind'];
  /** The underlying logic for condition/action nodes (undefined for trigger). */
  condition?: ConditionGroup;
  action?: WorkflowAction;
}

/** Structural React-Flow edge shape (compatible with @xyflow/react's Edge). */
export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  /** Branch label for an edge out of a condition node. */
  label?: 'true' | 'false';
  data?: { branch?: 'true' | 'false' };
}

const COL_WIDTH = 240;
const ROW_HEIGHT = 110;

/** Edge id is deterministic from its endpoints + branch (stable across renders). */
export function edgeId(e: { from: string; to: string; branch?: 'true' | 'false' }): string {
  return `e:${e.from}->${e.to}${e.branch ? `:${e.branch}` : ''}`;
}

/**
 * Layered left→right layout: depth = longest path from the trigger (so a node
 * sits to the right of every parent); nodes within a depth are stacked. Returns
 * a depth per node id; unreachable nodes land in a trailing column so they're
 * still visible and draggable rather than stacked at the origin.
 */
function computeDepths(graph: WorkflowGraph): Map<string, number> {
  const out = new Map<string, string[]>();
  for (const e of graph.edges) {
    const list = out.get(e.from);
    if (list) list.push(e.to);
    else out.set(e.from, [e.to]);
  }
  const trigger = graph.nodes.find((n) => n.kind === 'trigger');
  const depth = new Map<string, number>();
  if (trigger) {
    // BFS longest-path: relax depths so a join sits past its deepest parent.
    depth.set(trigger.id, 0);
    const queue = [trigger.id];
    let guard = 0;
    const maxIters = graph.nodes.length * graph.edges.length + graph.nodes.length + 1;
    while (queue.length && guard++ < maxIters) {
      const u = queue.shift() as string;
      const du = depth.get(u) ?? 0;
      for (const v of out.get(u) ?? []) {
        const dv = depth.get(v);
        if (dv === undefined || dv < du + 1) {
          depth.set(v, du + 1);
          queue.push(v);
        }
      }
    }
  }
  // Any node never reached (shouldn't happen for a valid graph, but be safe).
  let maxDepth = 0;
  for (const d of depth.values()) maxDepth = Math.max(maxDepth, d);
  for (const n of graph.nodes) {
    if (!depth.has(n.id)) depth.set(n.id, maxDepth + 1);
  }
  return depth;
}

export function graphToFlow(graph: WorkflowGraph): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const depth = computeDepths(graph);
  const perColumn = new Map<number, number>();

  const nodes: FlowNode[] = graph.nodes.map((n) => {
    const d = depth.get(n.id) ?? 0;
    const row = perColumn.get(d) ?? 0;
    perColumn.set(d, row + 1);
    return {
      id: n.id,
      type: n.kind,
      position: { x: d * COL_WIDTH, y: row * ROW_HEIGHT },
      data: {
        kind: n.kind,
        condition: n.kind === 'condition' ? n.condition : undefined,
        action: n.kind === 'action' ? n.action : undefined,
      },
    };
  });

  const edges: FlowEdge[] = graph.edges.map((e) => ({
    id: edgeId(e),
    source: e.from,
    target: e.to,
    label: e.branch,
    data: { branch: e.branch },
  }));

  return { nodes, edges };
}

/**
 * Inverse: React-Flow arrays → a WorkflowGraph (logic only, positions dropped).
 * The node's `data` carries the underlying condition/action, so this round-trips
 * graphToFlow losslessly. Edge branch comes from data.branch (falls back to the
 * label) so a connect that set a branch is preserved.
 */
export function flowToGraph(nodes: FlowNode[], edges: FlowEdge[]): WorkflowGraph {
  const graphNodes: WorkflowNode[] = nodes.map((n) => {
    if (n.data.kind === 'condition') {
      return { id: n.id, kind: 'condition', condition: n.data.condition as ConditionGroup };
    }
    if (n.data.kind === 'action') {
      return { id: n.id, kind: 'action', action: n.data.action as WorkflowAction };
    }
    return { id: n.id, kind: 'trigger' };
  });

  const graphEdges: WorkflowEdge[] = edges.map((e) => {
    const branch = e.data?.branch ?? (e.label as 'true' | 'false' | undefined);
    return branch ? { from: e.source, to: e.target, branch } : { from: e.source, to: e.target };
  });

  return { nodes: graphNodes, edges: graphEdges };
}

/**
 * Would adding edge from→to create a cycle? (Connect-time guard so the canvas
 * never lets the realtor draw a loop the schema would later reject.) True if
 * `to` can already reach `from` along existing edges.
 */
export function wouldCreateCycle(
  edges: { source: string; target: string }[],
  from: string,
  to: string,
): boolean {
  if (from === to) return true;
  const out = new Map<string, string[]>();
  for (const e of edges) {
    const list = out.get(e.source);
    if (list) list.push(e.target);
    else out.set(e.source, [e.target]);
  }
  // DFS from `to`; if we reach `from`, the new edge from→to closes a loop.
  const seen = new Set<string>();
  const stack = [to];
  while (stack.length) {
    const u = stack.pop() as string;
    if (u === from) return true;
    if (seen.has(u)) continue;
    seen.add(u);
    for (const v of out.get(u) ?? []) stack.push(v);
  }
  return false;
}
