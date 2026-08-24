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
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  getBezierPath,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeProps,
  type EdgeTypes,
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

// ── Connected apps hook ───────────────────────────────────────────────────────

interface ConnectedApp {
  toolkit: string;
  label: string;
  actions: { value: string; label: string }[];
}

interface ConnectedAppsState {
  status: 'loading' | 'ready' | 'error';
  apps: ConnectedApp[];
}

function useConnectedApps(): ConnectedAppsState {
  const [state, setState] = useState<ConnectedAppsState>({ status: 'loading', apps: [] });
  useEffect(() => {
    let cancelled = false;
    fetch('/api/workflows/connected-apps')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { apps?: ConnectedApp[] }) => {
        if (!cancelled) setState({ status: 'ready', apps: data.apps ?? [] });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', apps: [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

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
  /** Canvas height utility class (default the full editing height). The
   *  read-only result preview passes a shorter one so it doesn't dominate. */
  heightClass?: string;
}

// ── Friendly labels (mirrors the linear builder's vocabulary) ────────────────

const ACTION_LABELS: Record<WorkflowActionType, string> = {
  draft_message: 'Draft a message',
  schedule_message: 'Schedule a message',
  notify_agent: 'Notify me',
  create_task: 'Create a task',
  call_integration: 'Call a connected app',
  run_chippi: 'Ask Chippi to do something',
  delay: 'Wait / Delay',
  filter: 'Filter — only continue if…',
  formatter: 'Format data',
  webhook_post: 'POST to a webhook URL',
  update_lead: 'Update this lead',
  iterate: 'Loop over a list',
  branch: 'Paths — conditional branching',
  run_workflow: 'Run sub-workflow',
  lookup_table: 'Lookup table',
  set_variable: 'Set variable',
  get_variable: 'Get variable',
};

const ACTION_ORDER: WorkflowActionType[] = [
  'draft_message',
  'run_chippi',
  'create_task',
  'update_lead',
  'notify_agent',
  'schedule_message',
  'filter',
  'iterate',
  'formatter',
  'delay',
  'call_integration',
  'webhook_post',
  'branch',
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
  { value: 'email', label: 'Email' },
];

// ── Node-face phrasing (human labels — never raw field paths) ────────────────

/** A short, human face for an action node ("Draft an email"). */
function actionFace(action: WorkflowAction | undefined): string {
  if (!action) return 'Action';
  switch (action.type) {
    case 'draft_message':
      return 'Draft an email';
    case 'schedule_message':
      return 'Schedule an email';
    case 'create_task':
      return action.config.title ? `Task: ${action.config.title}` : 'Create a task';
    case 'call_integration':
      return action.config.toolkit ? `Call ${action.config.toolkit}` : 'Call a connected app';
    case 'run_chippi':
      return 'Ask Chippi';
    case 'iterate':
      return action.config.source ? `Loop over ${action.config.source}` : 'Loop over a list';
    case 'branch': {
      const count = action.config.paths.length;
      return count > 0 ? `${count} path${count === 1 ? '' : 's'}` : 'Conditional paths';
    }
    default:
      return 'Action';
  }
}

/** Render a rule's value cleanly: arrays (the in/not_in operators) as a spaced
 *  list, primitives as-is, and anything object-shaped dropped (never the ugly
 *  "[object Object]" String() would produce on raw stored JSON). */
function formatRuleValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.filter((v) => v !== null && v !== undefined && v !== '').join(', ');
  }
  if (value !== null && typeof value === 'object') return '';
  return String(value);
}

/** One rule rendered in plain language ("Lead score is at least 80"). */
function rulePhrase(rule: { field: string; operator: Operator; value?: unknown }): string {
  const attr = findAttributeByField(rule.field);
  const label = attr?.label ?? rule.field;
  const op = OPERATOR_LABELS[rule.operator] ?? rule.operator;
  const valueless = VALUELESS_OPERATORS.has(rule.operator);
  const formatted =
    valueless || rule.value === undefined || rule.value === null || rule.value === ''
      ? ''
      : formatRuleValue(rule.value);
  return `${label} ${op}${formatted ? ` ${formatted}` : ''}`.trim();
}

/**
 * The FULL human summary of a condition's rules, joined by the group operator —
 * "Lead score is at least 80 · and · Source is zillow". Every rule is shown (the
 * node face line-clamps to two lines and carries this same string as a tooltip),
 * so a multi-rule condition reads as what it actually checks rather than a
 * cryptic "(+1)".
 */
function conditionSummary(condition: ConditionGroup | undefined): string {
  const rules = (condition?.rules ?? []).filter(
    (r): r is { field: string; operator: Operator; value?: unknown } => 'field' in r,
  );
  if (rules.length === 0) return 'If — no rules yet';
  const joiner = condition?.op === 'or' ? ' or ' : ' and ';
  return `If ${rules.map(rulePhrase).join(joiner)}`;
}

// ── Custom nodes ─────────────────────────────────────────────────────────────

// Zapier-style: wider cards, vertical (top→bottom) connector handles.
const NODE_SHELL =
  'rounded-xl border bg-card shadow-sm transition-colors w-[280px]';
const HANDLE_CLASS =
  '!h-3 !w-3 !rounded-full !border-2 !border-background !bg-muted-foreground/50 shadow-sm';

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

/** Human-readable one-liner for a WorkflowTrigger. */
function buildTriggerLabel(trigger: WorkflowTrigger): string {
  switch (trigger.type) {
    case 'lead_created':
      return 'New lead created';
    case 'lead_score_threshold':
      return `Lead score reaches ${trigger.config.min}`;
    case 'inbound_message': {
      const ch = trigger.config.channel;
      return ch && ch !== 'any' ? `Inbound ${ch}` : 'Inbound message';
    }
    case 'tour_completed':
      return 'Tour completed';
    case 'deal_stage_changed':
      return trigger.config.toStage
        ? `Deal moves to "${trigger.config.toStage}"`
        : 'Deal stage changed';
    case 'integration_event': {
      const tk = trigger.config.toolkit;
      const ev = trigger.config.event
        ? trigger.config.event.split('_').slice(1).join(' ').toLowerCase()
        : '';
      return tk && ev ? `${tk}: ${ev}` : tk || 'Integration event';
    }
    case 'schedule': {
      const { cadence, hour } = trigger.config;
      const timeStr = typeof hour === 'number' ? ` at ${hour}:00` : '';
      return `${cadence.charAt(0).toUpperCase() + cadence.slice(1)}${timeStr}`;
    }
    default:
      return 'Trigger';
  }
}

function TriggerNodeView({ data, selected }: NodeProps<CanvasNode>) {
  const label = (data.triggerLabel as string | undefined) ?? 'When this happens…';
  return (
    <div
      className={cn(
        NODE_SHELL,
        selected ? 'border-foreground/40 ring-2 ring-foreground/10' : 'border-border/60',
        runClasses(data),
      )}
    >
      <div className="flex items-center gap-3 px-3 py-3">
        <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Zap size={15} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Trigger</p>
          <p className="truncate text-[13px] font-semibold text-foreground leading-snug">{label}</p>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className={HANDLE_CLASS} />
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
      <Handle type="target" position={Position.Top} className={HANDLE_CLASS} />
      <div className="flex items-center gap-3 px-3 py-3">
        <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
          <GitBranch size={15} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Filter / Branch</p>
          <p
            className="line-clamp-2 text-[13px] font-semibold leading-snug text-foreground"
            title={conditionSummary(data.condition)}
          >
            {conditionSummary(data.condition)}
          </p>
        </div>
      </div>
      {/* Two SOURCE handles on Bottom — True left, False right. */}
      <div className="relative">
        <div className="flex justify-between px-6 pb-1.5">
          <span className="text-[10px] font-semibold text-muted-foreground">Yes</span>
          <span className="text-[10px] font-semibold text-muted-foreground">No</span>
        </div>
      </div>
      <Handle
        id="true"
        type="source"
        position={Position.Bottom}
        style={{ left: '30%' }}
        className={HANDLE_CLASS}
      />
      <Handle
        id="false"
        type="source"
        position={Position.Bottom}
        style={{ left: '70%' }}
        className={HANDLE_CLASS}
      />
    </div>
  );
}

function ActionNodeView({ data, selected }: NodeProps<CanvasNode>) {
  return (
    <div
      className={cn(
        NODE_SHELL,
        selected ? 'border-foreground/40 ring-2 ring-foreground/10' : 'border-border/60',
        runClasses(data),
      )}
    >
      <Handle type="target" position={Position.Top} className={HANDLE_CLASS} />
      <div className="flex items-center gap-3 px-3 py-3">
        <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
          <WorkflowIcon size={15} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Action</p>
          <p className="truncate text-[13px] font-semibold text-foreground leading-snug">
            {actionFace(data.action)}
          </p>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className={HANDLE_CLASS} />
    </div>
  );
}

// ── Custom edge with "Add action" button ─────────────────────────────────────

/**
 * A bezier edge that shows a small + button at the midpoint. Clicking it calls
 * the `onAddBetween` callback stored on the edge's data — the canvas wires this
 * to `addNode('action')` so a realtor can insert a step inline without dragging
 * from the toolbar. Read-only edges (data.readOnly = true) skip the button.
 */
function AddStepEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  label,
}: EdgeProps<CanvasEdge>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetPosition,
    targetX,
    targetY,
  });

  const isReadOnly = (data as Record<string, unknown> | undefined)?.readOnly as boolean | undefined;
  const onAdd = (data as Record<string, unknown> | undefined)?.onAddBetween as
    | (() => void)
    | undefined;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{ strokeWidth: 2, stroke: 'hsl(var(--border))' }}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan absolute pointer-events-none"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY - 22}px)`,
            }}
          >
            <span className="rounded-full bg-muted border border-border/60 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {String(label)}
            </span>
          </div>
        </EdgeLabelRenderer>
      )}
      {!isReadOnly && onAdd && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan absolute pointer-events-all"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            }}
          >
            <button
              type="button"
              onClick={onAdd}
              title="Add action here"
              className="group flex h-5 w-5 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground/60 shadow-sm transition-all hover:border-foreground/25 hover:text-foreground hover:scale-110"
            >
              <Plus size={11} aria-hidden />
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const EDGE_TYPES: EdgeTypes = { default: AddStepEdge };

const NODE_TYPES: NodeTypes = {
  trigger: TriggerNodeView,
  condition: ConditionNodeView,
  action: ActionNodeView,
};

// ── Defaults for new nodes ───────────────────────────────────────────────────

function defaultAction(): WorkflowAction {
  return { type: 'draft_message', config: { channel: 'email', instruction: '' } };
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
  heightClass = 'h-[560px]',
}: WorkflowCanvasProps) {
  // Seed React-Flow state ONCE from the adapter; the graph prop is the initial
  // value, not a controlled mirror (re-seeding on every render would fight the
  // user's in-progress edits and drags). When `highlights` is present (a
  // test-run preview), fold the per-node run outcome into the seeded node data —
  // ran nodes carry their status, the rest dim — so the executed path lights up.
  const initial = useMemo(() => {
    const flow = graphToFlow(graph);
    const triggerLabelStr = buildTriggerLabel(trigger);
    const withTriggerLabel = {
      ...flow,
      nodes: flow.nodes.map((n) =>
        n.data.kind === 'trigger'
          ? { ...n, data: { ...n.data, triggerLabel: triggerLabelStr } }
          : n,
      ),
    };
    if (!highlights || Object.keys(highlights).length === 0) return withTriggerLabel;
    return {
      ...withTriggerLabel,
      nodes: withTriggerLabel.nodes.map((n) => ({
        ...n,
        data: { ...n.data, highlight: highlights[n.id], dimmed: !highlights[n.id] },
      })),
    };
  }, [graph, trigger, highlights]);
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>(
    initial.nodes as CanvasNode[],
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<CanvasEdge>(
    initial.edges as CanvasEdge[],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  // Keep the latest onChange without resubscribing the emit effect each render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // A rejected connection PERSISTS until the realtor moves on — a successful
  // connection, adding or deleting a node, or an explicit dismiss all clear it.
  // A 2.6s toast vanished before they finished dragging and looked back, leaving
  // "why didn't that connect?" unanswered; the message is explicit and
  // dismissible instead of timed.
  const flash = useCallback((msg: string) => setWarning(msg), []);
  const clearWarning = useCallback(() => setWarning(null), []);

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
      // A successful connection resolves whatever the last rejection was.
      clearWarning();
    },
    [edges, nodes, emit, flash, clearWarning, setEdges, setNodes],
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
      // Adding a node is the realtor moving on — resolve any lingering rejection.
      clearWarning();
    },
    [atNodeCap, nodes.length, edges, emit, clearWarning, setNodes],
  );

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    const target = nodes.find((n) => n.id === selectedId);
    if (!target || target.data.kind === 'trigger') {
      if (target?.data.kind === 'trigger') flash("The trigger node can't be removed.");
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
    clearWarning();
  }, [selectedId, nodes, emit, flash, clearWarning, setNodes, setEdges]);

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
            'relative flex-1 overflow-hidden rounded-xl border border-border/60 bg-muted/10',
            heightClass,
          )}
        >
          <ReactFlow<CanvasNode, CanvasEdge>
            nodes={nodes}
            edges={readOnly
              ? edges
              // Inject onAddBetween + readOnly into edge data so the custom
              // edge can call addNode without prop-drilling through React-Flow.
              : edges.map((e) => ({
                  ...e,
                  data: { ...e.data, onAddBetween: () => addNode('action'), readOnly: false },
                }))}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
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
              // Persistent (until acted on / dismissed), so a polite live region
              // — not assertive role="alert", which would re-interrupt a screen
              // reader on every rejected drag.
              role="status"
              aria-live="polite"
              className="absolute left-1/2 top-3 z-10 flex max-w-[90%] -translate-x-1/2 items-center gap-2 rounded-full border border-amber-400/60 bg-amber-50/95 py-1.5 pl-3 pr-1.5 text-xs font-medium text-amber-700 shadow-sm dark:border-amber-500/40 dark:bg-amber-950/80 dark:text-amber-300"
            >
              <span className="min-w-0">{warning}</span>
              <button
                type="button"
                onClick={clearWarning}
                aria-label="Dismiss"
                className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full transition-colors hover:bg-amber-500/15"
              >
                <X size={12} aria-hidden />
              </button>
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
  // Fetch connected apps once — only needed when an action node is selected
  // and only when call_integration is chosen, but loading eagerly keeps the
  // picker instant once the user clicks. A failed load degrades to text inputs.
  const connectedApps = useConnectedApps();

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
              This is where it starts. The trigger&apos;s settings live on the workflow
              itself — this node just anchors the graph.
            </p>
          )}

          {node.data.kind === 'action' && (
            <ActionInspector
              action={node.data.action ?? defaultAction()}
              onChange={(action) => onUpdate(node.id, { action })}
              connectedApps={connectedApps}
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
  connectedApps,
}: {
  action: WorkflowAction;
  onChange: (action: WorkflowAction) => void;
  connectedApps: ConnectedAppsState;
}) {
  // Switching type resets to that type's minimal default config.
  function setType(type: WorkflowActionType) {
    if (type === action.type) return;
    const next: WorkflowAction =
      type === 'draft_message'
        ? { type, config: { channel: 'email', instruction: '' } }
        : type === 'schedule_message'
          ? { type, config: { channel: 'email', instruction: '', delayMinutes: 60 } }
          : type === 'create_task'
            ? { type, config: { title: '' } }
            : type === 'call_integration'
              ? { type, config: { toolkit: '', action: '' } }
              : type === 'update_lead'
                ? { type, config: { field: 'score_label' as const, value: '' } }
                : type === 'webhook_post'
                  ? { type, config: { url: '' } }
                  : type === 'notify_agent'
                    ? { type, config: { title: '' } }
                    : type === 'delay'
                      ? { type, config: { delayMinutes: 60 } }
                      : type === 'filter'
                        ? { type, config: { field: '', operator: 'eq' as const } }
                        : type === 'formatter'
                          ? { type, config: { input: '', operation: 'uppercase' as const } }
                          : type === 'iterate'
                            ? { type, config: { source: '', instruction: '' } }
                            : type === 'branch'
                              ? { type, config: { paths: [{ field: '', operator: 'eq' as const, value: '', actions: [{ type: 'draft_message' as const, config: { channel: 'email' as const, instruction: '' } }] }] } }
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
          options={(action.type === 'delay' ? ACTION_ORDER : ACTION_ORDER.filter((t) => t !== 'delay')).map((a) => ({ value: a, label: ACTION_LABELS[a] }))}
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
                  config: { ...action.config, channel: v as 'email' },
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
                  config: { ...action.config, channel: v as 'email' },
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
        <IntegrationActionPicker
          action={action}
          onChange={onChange}
          connectedApps={connectedApps}
        />
      )}

      {action.type === 'notify_agent' && (
        <>
          <FieldBlock label="Notification title">
            <Input
              value={action.config.title}
              onChange={(e) =>
                onChange({ type: 'notify_agent', config: { ...action.config, title: e.target.value } })
              }
              placeholder="Hot lead: check their profile"
              className="h-8"
            />
          </FieldBlock>
          <FieldBlock label="Body (optional)">
            <Textarea
              value={action.config.body ?? ''}
              onChange={(e) =>
                onChange({
                  type: 'notify_agent',
                  config: { ...action.config, body: e.target.value || undefined },
                })
              }
              placeholder="Score hit threshold — tap to review."
              rows={2}
            />
          </FieldBlock>
        </>
      )}

      {action.type === 'iterate' && (
        <>
          <FieldBlock label="Source array (dot-path)">
            <Input
              value={action.config.source}
              onChange={(e) =>
                onChange({ type: 'iterate', config: { ...action.config, source: e.target.value } })
              }
              placeholder="lead.tags"
              className="h-8 font-mono text-xs"
            />
          </FieldBlock>
          <FieldBlock label="Per-item instruction">
            <Textarea
              value={action.config.instruction}
              onChange={(e) =>
                onChange({
                  type: 'iterate',
                  config: { ...action.config, instruction: e.target.value },
                })
              }
              placeholder="Handle {{item}} — e.g. draft a message about {{item}}"
              rows={3}
            />
          </FieldBlock>
          <FieldBlock label="Limit (optional, max 50)">
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={50}
              value={action.config.limit === undefined ? '' : String(action.config.limit)}
              onChange={(e) => {
                const raw = e.target.value.trim();
                const limit = raw === '' ? undefined : Math.min(50, Math.max(1, Number(raw)));
                onChange({
                  type: 'iterate',
                  config: {
                    source: action.config.source,
                    instruction: action.config.instruction,
                    ...(limit === undefined || Number.isNaN(limit) ? {} : { limit }),
                    ...(action.config.outputField ? { outputField: action.config.outputField } : {}),
                  },
                });
              }}
              placeholder="10"
              className="h-8 w-24"
            />
          </FieldBlock>
        </>
      )}
    </div>
  );
}

// ── Integration action picker ─────────────────────────────────────────────────

/**
 * Connected-app + action picker for the `call_integration` action type.
 *
 * When connected apps are available (fetched from /api/workflows/connected-apps),
 * shows two selects: one for the toolkit (your connected apps), one for the
 * action (curated list per toolkit). Falls back to text inputs if the fetch
 * failed or returned no apps (e.g. nothing connected yet).
 */
function IntegrationActionPicker({
  action,
  onChange,
  connectedApps,
}: {
  action: Extract<WorkflowAction, { type: 'call_integration' }>;
  onChange: (action: WorkflowAction) => void;
  connectedApps: ConnectedAppsState;
}) {
  const hasApps = connectedApps.status === 'ready' && connectedApps.apps.length > 0;
  const selectedApp = connectedApps.apps.find((a) => a.toolkit === action.config.toolkit);
  const availableActions = selectedApp?.actions ?? [];

  function setToolkit(toolkit: string) {
    // Changing the toolkit resets the action — the old action slug belongs to
    // the old toolkit and would silently never fire.
    onChange({ type: 'call_integration', config: { toolkit, action: '' } });
  }

  if (!hasApps) {
    // No connected apps yet — fall back to free text so the realtor can still
    // author the node even if they haven't connected an app.
    return (
      <>
        {connectedApps.status === 'ready' && connectedApps.apps.length === 0 && (
          <p className={cn(CAPTION, 'rounded-lg border border-dashed border-border/60 px-3 py-2 text-center')}>
            No apps connected. Go to Automations → Configuration to connect Gmail, Slack, and more.
          </p>
        )}
        <FieldBlock label="App / toolkit">
          <Input
            value={action.config.toolkit}
            onChange={(e) =>
              onChange({ ...action, config: { ...action.config, toolkit: e.target.value } })
            }
            placeholder="slack"
            className="h-8"
          />
        </FieldBlock>
        <FieldBlock label="Action slug">
          <Input
            value={action.config.action}
            onChange={(e) =>
              onChange({ ...action, config: { ...action.config, action: e.target.value } })
            }
            placeholder="SLACK_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL"
            className="h-8"
          />
        </FieldBlock>
      </>
    );
  }

  return (
    <>
      <FieldBlock label="Connected app">
        <MiniSelect
          value={action.config.toolkit || '__none__'}
          onValueChange={(v) => setToolkit(v === '__none__' ? '' : v)}
          options={[
            { value: '__none__', label: 'Pick an app…' },
            ...connectedApps.apps.map((a) => ({ value: a.toolkit, label: a.label })),
          ]}
        />
      </FieldBlock>

      {action.config.toolkit && (
        <FieldBlock label="Action">
          {availableActions.length > 0 ? (
            <MiniSelect
              value={action.config.action || '__none__'}
              onValueChange={(v) =>
                onChange({
                  ...action,
                  config: { ...action.config, action: v === '__none__' ? '' : v },
                })
              }
              options={[
                { value: '__none__', label: 'Pick an action…' },
                ...availableActions,
              ]}
            />
          ) : (
            <Input
              value={action.config.action}
              onChange={(e) =>
                onChange({ ...action, config: { ...action.config, action: e.target.value } })
              }
              placeholder="Action slug"
              className="h-8"
            />
          )}
        </FieldBlock>
      )}
    </>
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
