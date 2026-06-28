'use client';

/**
 * WorkflowCanvas — the ADVANCED visual editor for a branching WorkflowGraph.
 *
 * A React-Flow node canvas over the SAME WorkflowGraph the engine walks. The
 * correctness-critical graph↔flow conversion, the layered auto-layout, and the
 * connect-time cycle guard all live in (and are unit-tested in)
 * graph-flow-adapter.ts — this component is the thin, DOM-bound view over it:
 *
 *   - graphToFlow seeds the React-Flow nodes/edges (positions are derived, not
 *     stored — a node DRAG never touches the graph or calls onChange).
 *   - any STRUCTURAL edit (add/remove node, connect/disconnect, edit a node's
 *     config) recomputes the WorkflowGraph via flowToGraph and calls onChange.
 *   - onConnect refuses a connection that would cycle (wouldCreateCycle), that
 *     targets the trigger, or that duplicates a branch already leaving a
 *     condition — surfacing a brief reason instead of drawing a bad edge.
 *
 * The right-side inspector authors the selected node's logic with the SAME
 * humanised vocabulary as the linear builder (the attribute catalog for
 * conditions; the per-type action config). Trigger config itself lives on the
 * definition — the trigger node is read-only here ("this is where it starts").
 *
 * Tasteful, calm "advanced mode": a muted palette, generous spacing, the house
 * tokens — not an n8n spaghetti bowl.
 */

import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
  type OnConnect,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  GitBranch,
  Plus,
  Trash2,
  Workflow as WorkflowIcon,
  X,
  Zap,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { CAPTION, SECTION_LABEL } from '@/lib/typography';
import {
  MAX_GRAPH_NODES,
  OPERATORS,
  type ConditionGroup,
  type ConditionRule,
  type Operator,
  type WorkflowAction,
  type WorkflowActionType,
  type WorkflowGraph,
  type WorkflowTrigger,
} from '@/lib/workflows/schema';
import {
  edgeId,
  flowToGraph,
  graphToFlow,
  wouldCreateCycle,
  type FlowNodeData,
} from './graph-flow-adapter';
import {
  attributesForTrigger,
  findAttributeByField,
  type ConditionAttribute,
} from './field-catalog';
import type { NodeRunStatus } from './run-highlights';

// React-Flow's Node/Edge generics, specialised to our adapter's data shapes so
// the custom node components and the change handlers stay type-safe. React
// Flow's Node<T> constrains T to Record<string, unknown>, so the node data is
// our FlowNodeData widened with an index signature (the extra keys are never
// set — this just satisfies the generic constraint).
type CanvasNodeData = FlowNodeData & Record<string, unknown>;
type CanvasNode = Node<CanvasNodeData>;
type CanvasEdge = Edge<{ branch?: 'true' | 'false' }>;

export interface WorkflowCanvasProps {
  graph: WorkflowGraph;
  /** The definition's trigger — drives the trigger node label + condition attrs. */
  trigger: WorkflowTrigger;
  onChange: (graph: WorkflowGraph) => void;
  /** Touch / mobile → view-only: no drag, connect, select, toolbar or inspector. */
  readOnly?: boolean;
  /**
   * Per-node run outcome from a test-run — lights up the executed path: ran-ok
   * nodes get an emerald ring, failed get rose, and the untaken nodes dim. Only
   * meaningful with readOnly (the result-panel preview); applied at mount.
   */
  highlights?: Record<string, NodeRunStatus>;
}

// ── Friendly labels (mirrors the linear builder's vocabulary) ────────────────

const ACTION_LABELS: Record<WorkflowActionType, string> = {
  draft_message: 'Draft a message',
  schedule_message: 'Schedule a message',
  create_task: 'Create a task',
  call_integration: 'Call a connected app',
  run_chippi: 'Ask Chippi to do something',
};

const ACTION_ORDER: WorkflowActionType[] = [
  'draft_message',
  'run_chippi',
  'create_task',
  'schedule_message',
  'call_integration',
];

const OPERATOR_LABELS: Record<Operator, string> = {
  eq: 'equals',
  neq: 'does not equal',
  gt: 'is greater than',
  gte: 'is at least',
  lt: 'is less than',
  lte: 'is at most',
  contains: 'contains',
  not_contains: 'does not contain',
  in: 'is one of',
  not_in: 'is not one of',
  exists: 'exists',
  not_exists: 'does not exist',
  starts_with: 'starts with',
  ends_with: 'ends with',
};

const VALUELESS_OPERATORS = new Set<Operator>(['exists', 'not_exists']);

const CHANNEL_OPTIONS = [
  { value: 'sms', label: 'SMS' },
  { value: 'email', label: 'Email' },
];

// ── Node-face phrasing (human labels — never raw field paths) ────────────────

/** A short, human face for an action node ("Draft an SMS"). */
function actionFace(action: WorkflowAction | undefined): string {
  if (!action) return 'Action';
  switch (action.type) {
    case 'draft_message':
      return `Draft ${action.config.channel === 'email' ? 'an email' : 'an SMS'}`;
    case 'schedule_message':
      return `Schedule ${action.config.channel === 'email' ? 'an email' : 'an SMS'}`;
    case 'create_task':
      return action.config.title ? `Task: ${action.config.title}` : 'Create a task';
    case 'call_integration':
      return action.config.toolkit ? `Call ${action.config.toolkit}` : 'Call a connected app';
    case 'run_chippi':
      return 'Ask Chippi';
    default:
      return 'Action';
  }
}

/** A short, human face for a condition node ("If 2 rules" / the first rule). */
function conditionFace(condition: ConditionGroup | undefined): string {
  const rules = condition?.rules ?? [];
  if (rules.length === 0) return 'If — no rules yet';
  const first = rules[0];
  if (first && 'field' in first) {
    const attr = findAttributeByField(first.field);
    const label = attr?.label ?? first.field;
    const op = OPERATOR_LABELS[first.operator] ?? first.operator;
    const lead = `If ${label} ${op}`.trim();
    return rules.length > 1 ? `${lead} (+${rules.length - 1})` : lead;
  }
  return `If ${rules.length} rule${rules.length === 1 ? '' : 's'}`;
}

// ── Custom nodes ─────────────────────────────────────────────────────────────

const NODE_SHELL =
  'rounded-xl border bg-card px-3 py-2.5 shadow-sm transition-colors min-w-[168px] max-w-[208px]';
const HANDLE_CLASS = '!h-2.5 !w-2.5 !border !border-border !bg-muted-foreground/40';

/**
 * Run-highlight classes for a node, from its seeded data (set when the canvas is
 * mounted with `highlights`): ran-ok → emerald ring, failed → rose ring,
 * skipped → amber, and a node that did NOT run while a run exists dims back.
 */
function runClasses(data: CanvasNodeData): string {
  const h = data.highlight as NodeRunStatus | undefined;
  if (h === 'ok') return 'ring-2 ring-emerald-500/60 border-emerald-500/50';
  if (h === 'failed') return 'ring-2 ring-rose-500/60 border-rose-500/50';
  if (h === 'skipped') return 'ring-1 ring-amber-400/50';
  if (data.dimmed) return 'opacity-40';
  return '';
}

function NodeIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-foreground/[0.06] text-muted-foreground">
      {children}
    </span>
  );
}

function TriggerNodeView({ data, selected }: NodeProps<CanvasNode>) {
  return (
    <div
      className={cn(
        NODE_SHELL,
        selected ? 'border-foreground/40' : 'border-border/60',
        runClasses(data),
      )}
    >
      <div className="flex items-center gap-2">
        <NodeIcon>
          <WorkflowIcon size={14} aria-hidden />
        </NodeIcon>
        <div className="min-w-0">
          <p className={SECTION_LABEL}>Trigger</p>
          <p className="truncate text-[13px] font-medium text-foreground">Workflow starts</p>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className={HANDLE_CLASS} />
    </div>
  );
}

function ConditionNodeView({ data, selected }: NodeProps<CanvasNode>) {
  return (
    <div
      className={cn(
        NODE_SHELL,
        selected ? 'border-foreground/40' : 'border-border/60',
        runClasses(data),
      )}
    >
      <Handle type="target" position={Position.Left} className={HANDLE_CLASS} />
      <div className="flex items-center gap-2">
        <NodeIcon>
          <GitBranch size={14} aria-hidden />
        </NodeIcon>
        <div className="min-w-0">
          <p className={SECTION_LABEL}>Condition</p>
          <p className="truncate text-[13px] font-medium text-foreground">
            {conditionFace(data.condition)}
          </p>
        </div>
      </div>
      {/* Two SOURCE handles — the handle id ('true'/'false') becomes the edge
          branch on connect, so a connection from here carries which branch. */}
      <Handle
        id="true"
        type="source"
        position={Position.Right}
        style={{ top: '38%' }}
        className={cn(HANDLE_CLASS, '!bg-emerald-500/60')}
      />
      <span className="pointer-events-none absolute right-2 top-[30%] text-[9px] font-medium uppercase tracking-wide text-emerald-600/80 dark:text-emerald-500/80">
        True
      </span>
      <Handle
        id="false"
        type="source"
        position={Position.Right}
        style={{ top: '70%' }}
        className={cn(HANDLE_CLASS, '!bg-rose-500/55')}
      />
      <span className="pointer-events-none absolute bottom-1.5 right-2 text-[9px] font-medium uppercase tracking-wide text-rose-600/80 dark:text-rose-500/80">
        False
      </span>
    </div>
  );
}

function ActionNodeView({ data, selected }: NodeProps<CanvasNode>) {
  return (
    <div
      className={cn(
        NODE_SHELL,
        selected ? 'border-foreground/40' : 'border-border/60',
        runClasses(data),
      )}
    >
      <Handle type="target" position={Position.Left} className={HANDLE_CLASS} />
      <div className="flex items-center gap-2">
        <NodeIcon>
          <Zap size={14} aria-hidden />
        </NodeIcon>
        <div className="min-w-0">
          <p className={SECTION_LABEL}>Action</p>
          <p className="truncate text-[13px] font-medium text-foreground">
            {actionFace(data.action)}
          </p>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className={HANDLE_CLASS} />
    </div>
  );
}

const NODE_TYPES: NodeTypes = {
  trigger: TriggerNodeView,
  condition: ConditionNodeView,
  action: ActionNodeView,
};

// ── Defaults for new nodes ───────────────────────────────────────────────────

function defaultAction(): WorkflowAction {
  return { type: 'draft_message', config: { channel: 'sms', instruction: '' } };
}
function defaultCondition(): ConditionGroup {
  return { op: 'and', rules: [] };
}

let nodeSeq = 0;
function nextNodeId(prefix: string): string {
  nodeSeq += 1;
  return `${prefix}-${nodeSeq}-${Date.now().toString(36)}`;
}

// ── Inner canvas (inside ReactFlowProvider so hooks resolve) ──────────────────

function CanvasInner({
  graph,
  trigger,
  onChange,
  readOnly = false,
  highlights,
}: WorkflowCanvasProps) {
  // Seed React-Flow state ONCE from the adapter; the graph prop is the initial
  // value, not a controlled mirror (re-seeding on every render would fight the
  // user's in-progress edits and drags). When `highlights` is present (a
  // test-run preview), fold the per-node run outcome into the seeded node data —
  // ran nodes carry their status, the rest dim — so the executed path lights up.
  const initial = useMemo(() => {
    const flow = graphToFlow(graph);
    if (!highlights || Object.keys(highlights).length === 0) return flow;
    return {
      ...flow,
      nodes: flow.nodes.map((n) => ({
        ...n,
        data: { ...n.data, highlight: highlights[n.id], dimmed: !highlights[n.id] },
      })),
    };
  }, [graph, highlights]);
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>(
    initial.nodes as CanvasNode[],
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<CanvasEdge>(
    initial.edges as CanvasEdge[],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the latest onChange without resubscribing the emit effect each render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(
    () => () => {
      if (warnTimer.current) clearTimeout(warnTimer.current);
    },
    [],
  );

  const flash = useCallback((msg: string) => {
    setWarning(msg);
    if (warnTimer.current) clearTimeout(warnTimer.current);
    warnTimer.current = setTimeout(() => setWarning(null), 2600);
  }, []);

  // Emit a fresh WorkflowGraph from the current flow arrays. Positions are NOT
  // part of the graph, so this is only called on STRUCTURAL edits — never from
  // a position-only NodeChange.
  const emit = useCallback((nextNodes: CanvasNode[], nextEdges: CanvasEdge[]) => {
    onChangeRef.current(
      flowToGraph(
        nextNodes.map((n) => ({
          id: n.id,
          type: n.data.kind,
          position: n.position,
          data: n.data,
        })),
        nextEdges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.data?.branch,
          data: { branch: e.data?.branch },
        })),
      ),
    );
  }, []);

  // Node changes: let React-Flow apply them (drag/select/dimensions), but only
  // re-emit the graph when something STRUCTURAL changed — a removal. Position,
  // selection and dimension changes never touch the graph.
  const handleNodesChange = useCallback(
    (changes: NodeChange<CanvasNode>[]) => {
      setNodes((current) => {
        const next = applyNodeChanges(changes, current) as CanvasNode[];
        if (changes.some((c) => c.type === 'remove')) {
          // Removed nodes also lose their incident edges (handled in edge change
          // by React-Flow), but emit from the surviving edges set here too.
          setEdges((curEdges) => {
            const removedIds = new Set(
              changes.filter((c) => c.type === 'remove').map((c) => c.id),
            );
            const survivingEdges = curEdges.filter(
              (e) => !removedIds.has(e.source) && !removedIds.has(e.target),
            );
            emit(next, survivingEdges);
            return survivingEdges;
          });
        }
        return next;
      });
      onNodesChange(changes);
    },
    [emit, onNodesChange, setEdges, setNodes],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<CanvasEdge>[]) => {
      if (changes.some((c) => c.type === 'remove')) {
        setEdges((current) => {
          const next = applyEdgeChanges(changes, current) as CanvasEdge[];
          setNodes((curNodes) => {
            emit(curNodes, next);
            return curNodes;
          });
          return next;
        });
      } else {
        onEdgesChange(changes);
      }
    },
    [emit, onEdgesChange, setEdges, setNodes],
  );

  // Connect guard: reject cycles, trigger-as-target, and duplicate condition
  // branches. A connection FROM a condition carries its branch via the source
  // handle id ('true'/'false').
  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      const { source, target, sourceHandle } = connection;
      if (!source || !target) return;

      const sourceNode = nodes.find((n) => n.id === source);
      const targetNode = nodes.find((n) => n.id === target);

      if (targetNode?.data.kind === 'trigger') {
        flash('The trigger is where it starts — nothing can point at it.');
        return;
      }
      if (wouldCreateCycle(edges, source, target)) {
        flash('That would loop the workflow back on itself.');
        return;
      }

      let branch: 'true' | 'false' | undefined;
      if (sourceNode?.data.kind === 'condition') {
        branch = sourceHandle === 'false' ? 'false' : 'true';
        const dup = edges.some(
          (e) => e.source === source && e.data?.branch === branch,
        );
        if (dup) {
          flash(`This condition already has a "${branch}" branch.`);
          return;
        }
      }

      const id = edgeId({ from: source, to: target, branch });
      // Guard against an identical edge already existing.
      if (edges.some((e) => e.id === id)) {
        flash('That connection already exists.');
        return;
      }

      const newEdge: CanvasEdge = {
        id,
        source,
        target,
        label: branch,
        data: { branch },
      };
      setEdges((current) => {
        const next = addEdge(newEdge, current) as CanvasEdge[];
        setNodes((curNodes) => {
          emit(curNodes, next);
          return curNodes;
        });
        return next;
      });
    },
    [edges, nodes, emit, flash, setEdges, setNodes],
  );

  const onSelectionChange = useCallback(
    ({ nodes: sel }: { nodes: CanvasNode[] }) => {
      setSelectedId(sel.length === 1 ? sel[0].id : null);
    },
    [],
  );

  const atNodeCap = nodes.length >= MAX_GRAPH_NODES;

  // Add a node near the viewport centre (offset so successive adds don't stack).
  const addNode = useCallback(
    (kind: 'condition' | 'action') => {
      if (atNodeCap) return;
      const id = nextNodeId(kind);
      const offset = (nodes.length % 6) * 28;
      const newNode: CanvasNode = {
        id,
        type: kind,
        position: { x: 260 + offset, y: 80 + offset },
        data: {
          kind,
          condition: kind === 'condition' ? defaultCondition() : undefined,
          action: kind === 'action' ? defaultAction() : undefined,
        },
      };
      setNodes((current) => {
        const next = [...current, newNode];
        emit(next, edges);
        return next;
      });
    },
    [atNodeCap, nodes.length, edges, emit, setNodes],
  );

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    const target = nodes.find((n) => n.id === selectedId);
    if (!target || target.data.kind === 'trigger') {
      if (target?.data.kind === 'trigger') flash('The trigger node can’t be removed.');
      return;
    }
    setNodes((curNodes) => {
      const nextNodes = curNodes.filter((n) => n.id !== selectedId);
      setEdges((curEdges) => {
        const nextEdges = curEdges.filter(
          (e) => e.source !== selectedId && e.target !== selectedId,
        );
        emit(nextNodes, nextEdges);
        return nextEdges;
      });
      return nextNodes;
    });
    setSelectedId(null);
  }, [selectedId, nodes, emit, flash, setNodes, setEdges]);

  // Update the selected node's logic (action/condition) and re-emit.
  const updateNodeData = useCallback(
    (id: string, patch: Partial<FlowNodeData>) => {
      setNodes((current) => {
        const next = current.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...patch } } : n,
        );
        emit(next, edges);
        return next;
      });
    },
    [edges, emit, setNodes],
  );

  // Backspace / Delete removes the selected non-trigger node.
  useEffect(() => {
    if (readOnly) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Backspace' && e.key !== 'Delete') return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      // Don't hijack the key while typing in the inspector.
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return;
      if (!selectedId) return;
      e.preventDefault();
      deleteSelected();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [readOnly, selectedId, deleteSelected]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? null,
    [nodes, selectedId],
  );

  return (
    <div className="space-y-3">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <ToolbarButton onClick={() => addNode('condition')} disabled={atNodeCap}>
            <GitBranch size={13} aria-hidden />
            Add condition
          </ToolbarButton>
          <ToolbarButton onClick={() => addNode('action')} disabled={atNodeCap}>
            <Zap size={13} aria-hidden />
            Add action
          </ToolbarButton>
          {selectedNode && selectedNode.data.kind !== 'trigger' && (
            <ToolbarButton onClick={deleteSelected} variant="destructive">
              <Trash2 size={13} aria-hidden />
              Delete node
            </ToolbarButton>
          )}
          <span className={cn(CAPTION, 'ml-auto tabular-nums')}>
            {nodes.length} / {MAX_GRAPH_NODES} nodes
          </span>
        </div>
      )}

      <div className="relative flex flex-col gap-3 lg:flex-row">
        <div
          className={cn(
            'relative h-[560px] flex-1 overflow-hidden rounded-xl border border-border/60 bg-muted/10',
          )}
        >
          <ReactFlow<CanvasNode, CanvasEdge>
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            nodeTypes={NODE_TYPES}
            fitView
            proOptions={{ hideAttribution: true }}
            nodesDraggable={!readOnly}
            nodesConnectable={!readOnly}
            elementsSelectable={!readOnly}
            deleteKeyCode={null}
            minZoom={0.3}
            maxZoom={1.75}
          >
            <Background gap={18} className="!bg-transparent" color="hsl(var(--border))" />
            <Controls
              showInteractive={false}
              className="!rounded-lg !border !border-border/60 !bg-card !shadow-sm"
            />
            <MiniMap
              pannable
              zoomable
              className="!rounded-lg !border !border-border/60 !bg-card"
              maskColor="hsl(var(--muted) / 0.5)"
              nodeColor="hsl(var(--muted-foreground) / 0.4)"
            />
          </ReactFlow>

          {warning && (
            <div
              role="status"
              className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full border border-amber-400/60 bg-amber-50/95 px-3 py-1.5 text-xs font-medium text-amber-700 shadow-sm dark:border-amber-500/40 dark:bg-amber-950/80 dark:text-amber-300"
            >
              {warning}
            </div>
          )}
        </div>

        {!readOnly && (
          <Inspector
            node={selectedNode}
            trigger={trigger}
            onUpdate={updateNodeData}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}

export function WorkflowCanvas(props: WorkflowCanvasProps): JSX.Element {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

// ── Toolbar button ───────────────────────────────────────────────────────────

function ToolbarButton({
  children,
  onClick,
  disabled,
  variant = 'default',
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'destructive';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'destructive'
          ? 'border-destructive/30 text-destructive hover:bg-destructive/5'
          : 'border-border/60 text-muted-foreground hover:border-foreground/25 hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

// ── Inspector ────────────────────────────────────────────────────────────────

function Inspector({
  node,
  trigger,
  onUpdate,
  onClose,
}: {
  node: CanvasNode | null;
  trigger: WorkflowTrigger;
  onUpdate: (id: string, patch: Partial<FlowNodeData>) => void;
  onClose: () => void;
}) {
  return (
    <aside className="w-full flex-shrink-0 rounded-xl border border-border/60 bg-card p-4 lg:w-[300px]">
      {!node ? (
        <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-1.5 text-center">
          <p className={SECTION_LABEL}>Inspector</p>
          <p className={CAPTION}>Select a node to edit it.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <p className={SECTION_LABEL}>
              {node.data.kind === 'trigger'
                ? 'Trigger'
                : node.data.kind === 'condition'
                  ? 'Condition'
                  : 'Action'}
            </p>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close inspector"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
            >
              <X size={13} />
            </button>
          </div>

          {node.data.kind === 'trigger' && (
            <p className={cn(CAPTION, 'leading-relaxed')}>
              This is where it starts. The trigger’s settings live on the workflow
              itself — this node just anchors the graph.
            </p>
          )}

          {node.data.kind === 'action' && (
            <ActionInspector
              action={node.data.action ?? defaultAction()}
              onChange={(action) => onUpdate(node.id, { action })}
            />
          )}

          {node.data.kind === 'condition' && (
            <ConditionInspector
              condition={node.data.condition ?? defaultCondition()}
              trigger={trigger}
              onChange={(condition) => onUpdate(node.id, { condition })}
            />
          )}
        </div>
      )}
    </aside>
  );
}

// ── Action inspector ─────────────────────────────────────────────────────────

function ActionInspector({
  action,
  onChange,
}: {
  action: WorkflowAction;
  onChange: (action: WorkflowAction) => void;
}) {
  // Switching type resets to that type's minimal default config.
  function setType(type: WorkflowActionType) {
    if (type === action.type) return;
    const next: WorkflowAction =
      type === 'draft_message'
        ? { type, config: { channel: 'sms', instruction: '' } }
        : type === 'schedule_message'
          ? { type, config: { channel: 'sms', instruction: '', delayMinutes: 60 } }
          : type === 'create_task'
            ? { type, config: { title: '' } }
            : type === 'call_integration'
              ? { type, config: { toolkit: '', action: '' } }
              : { type: 'run_chippi', config: { instruction: '' } };
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-[12px] text-muted-foreground">Action type</Label>
        <MiniSelect
          value={action.type}
          onValueChange={(v) => setType(v as WorkflowActionType)}
          options={ACTION_ORDER.map((a) => ({ value: a, label: ACTION_LABELS[a] }))}
        />
      </div>

      {action.type === 'draft_message' && (
        <>
          <FieldBlock label="Channel">
            <MiniSelect
              value={action.config.channel}
              onValueChange={(v) =>
                onChange({
                  type: 'draft_message',
                  config: { ...action.config, channel: v as 'sms' | 'email' },
                })
              }
              options={CHANNEL_OPTIONS}
            />
          </FieldBlock>
          <FieldBlock label="Instruction">
            <Textarea
              value={action.config.instruction}
              onChange={(e) =>
                onChange({
                  type: 'draft_message',
                  config: { ...action.config, instruction: e.target.value },
                })
              }
              placeholder="Draft a warm, personal intro and reference their interest."
              rows={3}
            />
          </FieldBlock>
        </>
      )}

      {action.type === 'schedule_message' && (
        <>
          <FieldBlock label="Channel">
            <MiniSelect
              value={action.config.channel}
              onValueChange={(v) =>
                onChange({
                  type: 'schedule_message',
                  config: { ...action.config, channel: v as 'sms' | 'email' },
                })
              }
              options={CHANNEL_OPTIONS}
            />
          </FieldBlock>
          <FieldBlock label="Instruction">
            <Textarea
              value={action.config.instruction}
              onChange={(e) =>
                onChange({
                  type: 'schedule_message',
                  config: { ...action.config, instruction: e.target.value },
                })
              }
              placeholder="Draft a warm, personal intro and reference their interest."
              rows={3}
            />
          </FieldBlock>
          <FieldBlock label="Delay (minutes)">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={String(action.config.delayMinutes)}
              onChange={(e) =>
                onChange({
                  type: 'schedule_message',
                  config: {
                    ...action.config,
                    delayMinutes: Number(e.target.value) || 0,
                  },
                })
              }
              className="h-8 w-28"
            />
          </FieldBlock>
        </>
      )}

      {action.type === 'run_chippi' && (
        <FieldBlock label="Instruction">
          <Textarea
            value={action.config.instruction}
            onChange={(e) =>
              onChange({ type: 'run_chippi', config: { instruction: e.target.value } })
            }
            placeholder="Take it from here — follow up and keep them warm."
            rows={3}
          />
        </FieldBlock>
      )}

      {action.type === 'create_task' && (
        <>
          <FieldBlock label="Task title">
            <Input
              value={action.config.title}
              onChange={(e) =>
                onChange({
                  ...action,
                  config: { ...action.config, title: e.target.value },
                })
              }
              placeholder="Follow up after tour"
              className="h-8"
            />
          </FieldBlock>
          <FieldBlock label="Due in days (optional)">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={
                action.config.dueInDays === undefined ? '' : String(action.config.dueInDays)
              }
              onChange={(e) => {
                const raw = e.target.value.trim();
                const dueInDays = raw === '' ? undefined : Number(raw);
                onChange({
                  type: 'create_task',
                  config: {
                    title: action.config.title,
                    ...(dueInDays === undefined || Number.isNaN(dueInDays)
                      ? {}
                      : { dueInDays }),
                  },
                });
              }}
              placeholder="2"
              className="h-8 w-24"
            />
          </FieldBlock>
        </>
      )}

      {action.type === 'call_integration' && (
        <>
          <FieldBlock label="App / toolkit">
            <Input
              value={action.config.toolkit}
              onChange={(e) =>
                onChange({
                  ...action,
                  config: { ...action.config, toolkit: e.target.value },
                })
              }
              placeholder="slack"
              className="h-8"
            />
          </FieldBlock>
          <FieldBlock label="Action">
            <Input
              value={action.config.action}
              onChange={(e) =>
                onChange({
                  ...action,
                  config: { ...action.config, action: e.target.value },
                })
              }
              placeholder="send_message"
              className="h-8"
            />
          </FieldBlock>
        </>
      )}
    </div>
  );
}

// ── Condition inspector (flat rule list, humanised attribute picker) ─────────

/** Sentinel for the raw-path escape hatch in the attribute picker. */
const CUSTOM_ATTRIBUTE = '__custom__';

function ConditionInspector({
  condition,
  trigger,
  onChange,
}: {
  condition: ConditionGroup;
  trigger: WorkflowTrigger;
  onChange: (condition: ConditionGroup) => void;
}) {
  const attributes = useMemo(
    () => attributesForTrigger(trigger.type),
    [trigger.type],
  );

  // Only the flat leaf rules are editable here (mirrors the linear builder's
  // flat-list scope — no nested sub-groups in the canvas inspector). Any nested
  // groups already present are preserved untouched.
  const flatRules = condition.rules.filter(
    (r): r is ConditionRule => 'field' in r,
  );
  const nestedRules = condition.rules.filter((r) => !('field' in r));

  function writeRules(nextFlat: ConditionRule[]) {
    onChange({ op: condition.op, rules: [...nextFlat, ...nestedRules] });
  }

  function updateRule(index: number, patch: Partial<ConditionRule>) {
    writeRules(flatRules.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
  function removeRule(index: number) {
    writeRules(flatRules.filter((_, i) => i !== index));
  }
  function addRule() {
    const first = attributes[0];
    const rule: ConditionRule = {
      field: first?.field ?? '',
      operator: first?.operators[0] ?? 'eq',
      value: '',
    };
    writeRules([...flatRules, rule]);
  }

  return (
    <div className="space-y-3">
      {flatRules.length > 1 && (
        <div
          className="inline-flex rounded-md border border-border/60 p-0.5"
          role="group"
          aria-label="Combine rules with AND or OR"
        >
          {(['and', 'or'] as const).map((op) => (
            <button
              key={op}
              type="button"
              onClick={() => onChange({ ...condition, op })}
              aria-pressed={condition.op === op}
              className={cn(
                'rounded-[5px] px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide transition-colors',
                condition.op === op
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {op}
            </button>
          ))}
        </div>
      )}

      {flatRules.length === 0 ? (
        <p className={cn(CAPTION, 'rounded-lg border border-dashed border-border/60 px-3 py-2.5')}>
          No rules — this branch passes everything through.
        </p>
      ) : (
        <ul className="space-y-2">
          {flatRules.map((rule, i) => (
            <ConditionRuleRow
              key={i}
              rule={rule}
              attributes={attributes}
              onChange={(patch) => updateRule(i, patch)}
              onRemove={() => removeRule(i)}
            />
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={addRule}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <Plus size={13} />
        Add rule
      </button>
    </div>
  );
}

function ConditionRuleRow({
  rule,
  attributes,
  onChange,
  onRemove,
}: {
  rule: ConditionRule;
  attributes: ConditionAttribute[];
  onChange: (patch: Partial<ConditionRule>) => void;
  onRemove: () => void;
}) {
  const activeAttr = findAttributeByField(rule.field);
  const [forcedCustom, setForcedCustom] = useState(false);
  const isCustom = forcedCustom || activeAttr === null;
  const needsValue = !VALUELESS_OPERATORS.has(rule.operator);

  const valueAsString =
    rule.value === undefined || rule.value === null ? '' : String(rule.value);

  function selectAttribute(attr: ConditionAttribute) {
    setForcedCustom(false);
    const operatorValid = attr.operators.includes(rule.operator);
    const nextOperator = operatorValid ? rule.operator : attr.operators[0];
    const keepValue =
      attr.valueType === 'text' ||
      (attr.valueType === 'enum' && attr.options?.some((o) => o.value === valueAsString)) ||
      (attr.valueType === 'number' && /^-?\d+(\.\d+)?$/.test(valueAsString.trim()));
    onChange({
      field: attr.field,
      operator: nextOperator,
      ...(keepValue ? {} : { value: '' }),
    });
  }

  const attributeSelectValue = isCustom
    ? CUSTOM_ATTRIBUTE
    : (activeAttr?.key ?? CUSTOM_ATTRIBUTE);
  const operatorOptions = isCustom ? OPERATORS : (activeAttr?.operators ?? OPERATORS);

  return (
    <li className="space-y-2 rounded-lg border border-border/60 bg-muted/10 p-2">
      <div className="flex items-center gap-2">
        <MiniSelect
          aria-label="Attribute"
          value={attributeSelectValue}
          onValueChange={(v) => {
            if (v === CUSTOM_ATTRIBUTE) {
              setForcedCustom(true);
              return;
            }
            const attr = attributes.find((a) => a.key === v);
            if (attr) selectAttribute(attr);
          }}
          className="flex-1"
          options={[
            ...attributes.map((a) => ({ value: a.key, label: a.label })),
            { value: CUSTOM_ATTRIBUTE, label: 'Custom field…' },
          ]}
        />
        <RemoveButton label="Remove rule" onClick={onRemove} />
      </div>

      {isCustom && (
        <Input
          aria-label="Field"
          value={rule.field}
          onChange={(e) => onChange({ field: e.target.value })}
          placeholder="lead.score"
          className="h-8"
        />
      )}

      <MiniSelect
        aria-label="Operator"
        value={rule.operator}
        onValueChange={(v) => onChange({ operator: v as Operator })}
        options={operatorOptions.map((op) => ({ value: op, label: OPERATOR_LABELS[op] }))}
      />

      {needsValue &&
        (!isCustom && activeAttr?.valueType === 'enum' && activeAttr.options ? (
          <MiniSelect
            aria-label="Value"
            value={valueAsString}
            onValueChange={(v) => onChange({ value: v })}
            options={activeAttr.options}
          />
        ) : (
          <Input
            aria-label="Value"
            type={!isCustom && activeAttr?.valueType === 'number' ? 'number' : 'text'}
            inputMode={
              !isCustom && activeAttr?.valueType === 'number' ? 'numeric' : undefined
            }
            value={valueAsString}
            onChange={(e) => onChange({ value: e.target.value })}
            placeholder="80"
            className="h-8"
          />
        ))}
    </li>
  );
}

// ── Small shared primitives ──────────────────────────────────────────────────

function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[12px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function MiniSelect({
  value,
  onValueChange,
  options,
  className,
  'aria-label': ariaLabel,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger aria-label={ariaLabel} className={cn('h-8 w-full', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
    >
      <X size={14} />
    </button>
  );
}
