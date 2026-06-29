'use client';

/**
 * WorkflowBuilder — the When / If / Then composer.
 *
 * Three stacked sections mirror how a realtor thinks about an automation:
 *   When  → the trigger that fires it (+ that trigger's config fields)
 *   If    → a flat AND/OR list of condition rules (field · operator · value)
 *   Then  → an ordered list of actions (+ each action type's config)
 * plus an Autonomy select and a Name, then Save / Cancel.
 *
 * The builder holds a loose, string-friendly WorkflowFormState (every input is
 * a string or small enum). On Save it calls the pure buildDefinition(state) to
 * assemble a WorkflowDefinition, then runs parseWorkflowDefinition CLIENT-SIDE
 * to surface field-level issues inline before it ever POSTs — the same
 * validator the API runs, so the realtor sees the problem at the point of edit.
 *
 * Scope notes: conditions are a FLAT group (no nested sub-groups) and actions
 * are add/remove only (no drag reorder) — both deliberately deferred for v1.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, Plus, X, Sparkles, PencilLine, BellRing, Zap, Filter, GitBranch, Clock, CheckSquare, Plug, AlertCircle, GripVertical, Webhook, Copy, Check as CheckIcon, Power } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { CAPTION, SECTION_LABEL, PRIMARY_PILL } from '@/lib/typography';
import {
  MAX_ACTIONS,
  OPERATORS,
  parseWorkflowDefinition,
  WorkflowDefinitionError,
  type ConditionGroup,
  type Operator,
  type TriggerType,
  type WorkflowAction,
  type WorkflowActionType,
  type WorkflowAutonomy,
  type WorkflowGraph,
} from '@/lib/workflows/schema';
import {
  buildDefinition,
  type ActionRowState,
  type ConditionRowState,
  type WorkflowFormState,
} from './build-definition';
import {
  graphToLinear,
  isLinearGraph,
  linearToGraph,
} from './graph-linear-bridge';
import { WorkflowCanvasLazy } from './workflow-canvas-lazy';
import {
  attributesForTrigger,
  findAttributeByField,
  type ConditionAttribute,
} from './field-catalog';
import { summarizeFormState } from './form-summary';

// ── Friendly labels for the schema's enums ───────────────────────────────────

const TRIGGER_LABELS: Record<TriggerType, string> = {
  lead_created: 'A new lead is created',
  lead_score_threshold: "A lead's score crosses a threshold",
  inbound_message: 'An inbound message arrives',
  tour_completed: 'A tour is completed',
  deal_stage_changed: 'A deal changes stage',
  integration_event: 'A connected app fires an event',
  schedule: 'On a schedule',
  webhook: 'Webhook — any HTTP POST',
};

const TRIGGER_ORDER: TriggerType[] = [
  'lead_score_threshold',
  'lead_created',
  'inbound_message',
  'tour_completed',
  'deal_stage_changed',
  'integration_event',
  'schedule',
  'webhook',
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

const ACTION_LABELS: Record<WorkflowActionType, string> = {
  draft_message: 'Draft a message',
  schedule_message: 'Schedule a message',
  create_task: 'Create a task',
  call_integration: 'Call a connected app',
  run_chippi: 'Ask Chippi to do something',
  delay: 'Wait / Delay',
  filter: 'Filter — only continue if…',
};

const ACTION_ORDER: WorkflowActionType[] = [
  'draft_message',
  'run_chippi',
  'create_task',
  'schedule_message',
  'filter',
  'delay',
  'call_integration',
];

const ACTION_ICONS: Record<WorkflowActionType, LucideIcon> = {
  draft_message: PencilLine,
  schedule_message: Clock,
  create_task: CheckSquare,
  call_integration: Plug,
  run_chippi: Sparkles,
  delay: Clock,
  filter: Filter,
};

const AUTONOMY_OPTIONS: { value: WorkflowAutonomy; label: string }[] = [
  { value: 'draft', label: 'Draft only — I approve' },
  { value: 'notify', label: 'Auto + notify me' },
  { value: 'auto', label: 'Fully autonomous' },
];

const AUTONOMY_CAPTION: Record<WorkflowAutonomy, string> = {
  draft: 'Every action is drafted for your approval — nothing goes out on its own.',
  notify: 'Actions run automatically and you get a heads-up each time.',
  auto: 'Actions run without approval, including sends and connected-app calls. Use with care.',
};

/**
 * Card metadata for the autonomy picker — the consequential trust decision.
 * A 3-way segmented control (icon + short label + one-line consequence) makes
 * the choice considered, not incidental: the realtor sees exactly how much
 * Chippi is allowed to do on its own, and the 'auto' card wears an amber accent
 * because it's the only one that sends without a human in the loop.
 */
const AUTONOMY_META: Record<WorkflowAutonomy, { label: string; consequence: string; icon: LucideIcon }> = {
  draft: {
    label: 'Draft only',
    consequence: 'You approve each one before it sends.',
    icon: PencilLine,
  },
  notify: {
    label: 'Auto + notify',
    consequence: 'Runs on its own; pings you each time.',
    icon: BellRing,
  },
  auto: {
    label: 'Fully autonomous',
    consequence: 'Runs and sends with no approval.',
    icon: Zap,
  },
};

// ── Connected-app trigger options (for the integration_event picker) ─────────

interface TriggerEventOption {
  slug: string;
  label: string;
}
interface TriggerAppOption {
  toolkit: string;
  label: string;
  connectionId: string;
  events: TriggerEventOption[];
}

type TriggerOptionsState =
  | { status: 'loading' }
  | { status: 'ready'; apps: TriggerAppOption[] }
  | { status: 'error' };

/**
 * Fetch the space's connected apps + their available trigger events once on
 * mount. The picker degrades gracefully on error/empty (the builder keeps a
 * free-text fallback), so a failed load never hard-blocks authoring.
 */
function useTriggerOptions(): TriggerOptionsState {
  const [state, setState] = useState<TriggerOptionsState>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    fetch('/api/workflows/trigger-options')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { connections?: TriggerAppOption[] }) => {
        if (cancelled) return;
        setState({ status: 'ready', apps: data.connections ?? [] });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

// ── Connected-app action options (for the call_integration action picker) ────

interface ConnectedActionApp {
  toolkit: string;
  label: string;
  actions: { value: string; label: string }[];
}

type ConnectedAppsState =
  | { status: 'loading' }
  | { status: 'ready'; apps: ConnectedActionApp[] }
  | { status: 'error' };

function useConnectedApps(): ConnectedAppsState {
  const [state, setState] = useState<ConnectedAppsState>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    fetch('/api/workflows/connected-apps')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { apps?: ConnectedActionApp[] }) => {
        if (!cancelled) setState({ status: 'ready', apps: data.apps ?? [] });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

/**
 * True on a narrow (touch-ish) viewport. The node canvas is a precision drag-and-
 * connect surface — miserable to EDIT on a phone — so advanced mode goes
 * read-only there and the realtor edits on a larger screen. SSR-safe (starts
 * false, resolves after mount).
 */
function useIsNarrow(maxWidth = 768): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth - 1}px)`);
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [maxWidth]);
  return narrow;
}

// ── Empty form state + row factories ─────────────────────────────────────────

let rowSeq = 0;
function nextRowId(prefix: string): string {
  rowSeq += 1;
  return `${prefix}-${rowSeq}-${Date.now().toString(36)}`;
}

export function emptyFormState(): WorkflowFormState {
  return {
    name: '',
    trigger: {
      type: 'lead_score_threshold',
      min: '80',
      channel: 'any',
      toolkit: '',
      event: '',
      toStage: '',
      cadence: 'daily',
      hour: '',
    },
    conditionOp: 'and',
    conditions: [],
    actions: [newActionRow()],
    autonomy: 'draft',
  };
}

/**
 * A fresh condition row. When a trigger is given, default the row to that
 * trigger's first attribute (field + that attribute's first operator) so a
 * brand-new row lands in the human picker fully usable with zero typing. With
 * no trigger (or no attributes) it falls back to a blank field, which renders
 * in Advanced/custom mode.
 */
function newConditionRow(triggerType?: TriggerType): ConditionRowState {
  const first = triggerType ? attributesForTrigger(triggerType)[0] : undefined;
  return {
    id: nextRowId('cond'),
    field: first?.field ?? '',
    operator: first?.operators[0] ?? 'eq',
    value: '',
  };
}

function newActionRow(): ActionRowState {
  return {
    id: nextRowId('act'),
    type: 'draft_message',
    channel: 'sms',
    instruction: '',
    delayMinutes: '',
    delayUnit: 'minutes',
    title: '',
    dueInDays: '',
    toolkit: '',
    action: '',
    paramsJson: '',
    filterField: '',
    filterOperator: 'eq',
    filterValue: '',
  };
}

// ── Advanced (graph) mode helpers ────────────────────────────────────────────

/** The starting canvas: a lone trigger node, ready for the realtor to extend. */
const emptyGraph: WorkflowGraph = { nodes: [{ id: 't', kind: 'trigger' }], edges: [] };

/**
 * Map a stored ConditionGroup back into the builder's flat condition ROWS — the
 * inverse used by the manager's recordToFormState. Flat group only: any nested
 * sub-group is skipped (v1 doesn't author them). Reused when converting a LINEAR
 * graph back to Simple mode so the realtor's branches-free work is preserved.
 */
function conditionsToRows(group: ConditionGroup): ConditionRowState[] {
  return group.rules.flatMap((r) => {
    if ('rules' in r) return [];
    return [
      {
        id: nextRowId('cond'),
        field: r.field,
        operator: r.operator as Operator,
        value: r.value === undefined || r.value === null ? '' : String(r.value),
      },
    ];
  });
}

/** Map stored WorkflowActions back into the builder's action ROWS (mirrors
 *  recordToFormState's action mapping). */
/** Convert stored delayMinutes back to a user-friendly amount + unit. */
function minutesToDisplay(m: number): { amount: string; unit: 'minutes' | 'hours' | 'days' } {
  if (m % 1440 === 0) return { amount: String(m / 1440), unit: 'days' };
  if (m % 60 === 0) return { amount: String(m / 60), unit: 'hours' };
  return { amount: String(m), unit: 'minutes' };
}

function actionsToRows(actions: WorkflowAction[]): ActionRowState[] {
  return actions.map((a) => {
    const delayDisplay = a.type === 'delay' ? minutesToDisplay(a.config.delayMinutes) : null;
    return {
      id: nextRowId('act'),
      type: a.type,
      label: a.label,
      channel:
        a.type === 'draft_message' || a.type === 'schedule_message' ? a.config.channel : 'sms',
      instruction:
        a.type === 'draft_message' || a.type === 'schedule_message' || a.type === 'run_chippi'
          ? a.config.instruction
          : '',
      delayMinutes:
        a.type === 'schedule_message'
          ? String(a.config.delayMinutes)
          : a.type === 'delay'
            ? (delayDisplay?.amount ?? '')
            : '',
      delayUnit: delayDisplay?.unit ?? 'minutes',
      title: a.type === 'create_task' ? a.config.title : '',
      dueInDays:
        a.type === 'create_task' && typeof a.config.dueInDays === 'number'
          ? String(a.config.dueInDays)
          : '',
      toolkit: a.type === 'call_integration' ? a.config.toolkit : '',
      action: a.type === 'call_integration' ? a.config.action : '',
      paramsJson:
        a.type === 'call_integration' && a.config.params
          ? JSON.stringify(a.config.params, null, 2)
          : '',
      filterField: a.type === 'filter' ? a.config.field : '',
      filterOperator: a.type === 'filter' ? a.config.operator : 'eq',
      filterValue:
        a.type === 'filter' && a.config.value !== undefined ? String(a.config.value) : '',
    };
  });
}

/** Count condition + action nodes in a graph, for the advanced-mode preview. */
function graphCounts(graph: WorkflowGraph): { conditions: number; actions: number } {
  let conditions = 0;
  let actions = 0;
  for (const n of graph.nodes) {
    if (n.kind === 'condition') conditions += 1;
    else if (n.kind === 'action') actions += 1;
  }
  return { conditions, actions };
}

// ── Live preview — the sentence the realtor is composing ─────────────────────

/**
 * The always-on, plain-English reading of the workflow being built. It updates
 * on every keystroke so the realtor watches the automation assemble as a
 * sentence — the trigger and action phrases carry the weight (foreground), the
 * connective words recede (muted), and the trust clause turns amber on 'auto'
 * so the consequential choice never hides. This is the builder's anchor: you
 * always know what you're about to turn on.
 */
function WorkflowPreview({ state }: { state: WorkflowFormState }) {
  const summary = useMemo(() => summarizeFormState(state), [state]);
  const isAuto = state.autonomy === 'auto';
  // ADVANCED mode: the linear sentence is meaningless for a branching graph, so
  // we read off node counts instead and keep only the autonomy clause.
  const graphLine = useMemo(() => {
    if (!state.graph) return null;
    const { conditions, actions } = graphCounts(state.graph);
    return `Branching automation — ${conditions} ${conditions === 1 ? 'condition' : 'conditions'}, ${actions} ${actions === 1 ? 'action' : 'actions'}.`;
  }, [state.graph]);

  return (
    <div className="rounded-xl border border-border/60 bg-muted/15 px-4 py-3.5">
      <div className="mb-1.5 flex items-center gap-1.5">
        <Sparkles size={12} className="text-muted-foreground" aria-hidden />
        <p className={SECTION_LABEL}>In plain English</p>
      </div>
      {graphLine ? (
        <p className="text-[15px] leading-relaxed text-foreground">{graphLine}</p>
      ) : (
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          <span className="text-muted-foreground/80">When </span>
          <span className="font-medium text-foreground">{summary.when}</span>
          {summary.conditions && (
            <>
              <span className="text-muted-foreground/80">, </span>
              <span className="text-foreground">{summary.conditions}</span>
            </>
          )}
          <span className="text-muted-foreground/80">, I'll </span>
          <span className="font-medium text-foreground">{summary.then}</span>
          <span className="text-muted-foreground/80">.</span>
        </p>
      )}
      <p
        className={cn(
          'mt-1.5 text-xs',
          isAuto ? 'font-medium text-amber-600 dark:text-amber-500' : 'text-muted-foreground/80',
        )}
      >
        {summary.autonomy}
      </p>
    </div>
  );
}

/**
 * Zapier-style large step card: colored left border, numbered badge, icon, and a
 * header / body split. Each step in the builder is one of these.
 */
function ZapCard({
  step,
  accent,
  title,
  icon: Icon,
  headerRight,
  incomplete,
  children,
}: {
  step: number;
  accent: 'orange' | 'blue' | 'violet';
  title: string;
  icon: LucideIcon;
  headerRight?: React.ReactNode;
  incomplete?: boolean;
  children: React.ReactNode;
}) {
  const cl = {
    orange: {
      border: 'border-l-orange-400 dark:border-l-orange-500/70',
      badge: 'bg-orange-500',
      icon: 'bg-orange-100 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400',
    },
    blue: {
      border: 'border-l-blue-400 dark:border-l-blue-500/70',
      badge: 'bg-blue-500',
      icon: 'bg-blue-100 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400',
    },
    violet: {
      border: 'border-l-violet-400 dark:border-l-violet-500/70',
      badge: 'bg-violet-500',
      icon: 'bg-violet-100 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400',
    },
  }[accent];
  return (
    <div className={cn('overflow-hidden rounded-xl border border-border/60 border-l-4 bg-card', cl.border)}>
      <div className="flex items-center gap-3 border-b border-border/40 bg-muted/20 px-4 py-3">
        <span className={cn('flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white', cl.badge)}>
          {step}
        </span>
        <span className={cn('flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg', cl.icon)}>
          <Icon size={14} aria-hidden />
        </span>
        <span className="flex-1 text-sm font-semibold text-foreground">{title}</span>
        {incomplete && (
          <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
            <AlertCircle size={11} aria-hidden />
            Incomplete
          </span>
        )}
        {headerRight}
      </div>
      <div className="px-4 py-4">
        {children}
      </div>
    </div>
  );
}

/** Vertical connector between step cards — mirrors Zapier's thin grey line. */
function StepConnector() {
  return (
    <div className="flex flex-col items-center py-1">
      <div className="h-5 w-px bg-border/50" />
    </div>
  );
}

/** Per-action-type accent colors: delay = amber, filter = sky, else violet. */
function actionAccent(type: WorkflowActionType) {
  if (type === 'delay') {
    return {
      border: 'border-l-amber-400 dark:border-l-amber-500/70',
      badge: 'bg-amber-500',
      icon: 'bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400',
    };
  }
  if (type === 'filter') {
    return {
      border: 'border-l-sky-400 dark:border-l-sky-500/70',
      badge: 'bg-sky-500',
      icon: 'bg-sky-100 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400',
    };
  }
  return {
    border: 'border-l-violet-400 dark:border-l-violet-500/70',
    badge: 'bg-violet-500',
    icon: 'bg-violet-100 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400',
  };
}

/**
 * One action step card. The action type selector lives in the card header so
 * the realtor sees at a glance what each step does — identical to how Zapier
 * shows each action as its own titled card.
 */
function ActionZapCard({
  step,
  row,
  canRemove,
  incomplete,
  showDragHandle,
  onChange,
  onRemove,
  onDuplicate,
  connectedApps,
}: {
  step: number;
  row: ActionRowState;
  canRemove: boolean;
  incomplete?: boolean;
  showDragHandle?: boolean;
  onChange: (next: Partial<ActionRowState>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  connectedApps: ConnectedAppsState;
}) {
  const Icon = ACTION_ICONS[row.type] ?? Sparkles;
  const cl = actionAccent(row.type);
  return (
    <div className={cn('overflow-hidden rounded-xl border border-border/60 border-l-4 bg-card', cl.border)}>
      <div className="flex items-center gap-3 border-b border-border/40 bg-muted/20 px-4 py-3">
        {showDragHandle && (
          <GripVertical
            size={14}
            aria-hidden
            className="flex-shrink-0 cursor-grab text-muted-foreground/40 active:cursor-grabbing"
          />
        )}
        <span className={cn('flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white', cl.badge)}>
          {step}
        </span>
        <span className={cn('flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg', cl.icon)}>
          <Icon size={14} aria-hidden />
        </span>
        <div className="flex-1 min-w-0 space-y-0.5">
          <Label htmlFor={`act-type-${row.id}`} className="sr-only">
            Action type
          </Label>
          <Select
            value={row.type}
            onValueChange={(v) => onChange({ type: v as WorkflowActionType })}
          >
            <SelectTrigger
              id={`act-type-${row.id}`}
              className="h-8 border-border/40 bg-transparent text-sm font-semibold"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTION_ORDER.map((a) => (
                <SelectItem key={a} value={a}>
                  {ACTION_LABELS[a]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Step name — optional Zapier-style label for this step */}
          <input
            type="text"
            value={row.label ?? ''}
            onChange={(e) => onChange({ label: e.target.value || undefined })}
            placeholder="Add a step name…"
            maxLength={100}
            aria-label="Step name (optional)"
            className="w-full bg-transparent px-0.5 text-[11px] text-muted-foreground/70 placeholder:text-muted-foreground/30 outline-none transition-colors hover:text-muted-foreground focus:text-foreground"
          />
        </div>
        {incomplete ? (
          <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
            <AlertCircle size={11} aria-hidden />
            Incomplete
          </span>
        ) : (
          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-950/50 dark:text-green-400" aria-label="Step configured">
            <CheckIcon size={11} strokeWidth={3} aria-hidden />
          </span>
        )}
        <button
          type="button"
          onClick={onDuplicate}
          aria-label="Duplicate step"
          title="Duplicate step"
          className="flex-shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
        >
          <Copy size={13} aria-hidden />
        </button>
        {canRemove && <RemoveButton label="Remove action" onClick={onRemove} />}
      </div>
      <div className="px-4 py-4">
        <ActionConfig row={row} onChange={onChange} connectedApps={connectedApps} />
      </div>
    </div>
  );
}

// ── The builder ──────────────────────────────────────────────────────────────

export function WorkflowBuilder({
  initial,
  initialEnabled,
  saving,
  workflowId,
  onSave,
  onCancel,
}: {
  initial?: WorkflowFormState;
  /** Starting value for the "Turn on when saved" toggle. Defaults to true for new workflows. */
  initialEnabled?: boolean;
  saving: boolean;
  /** The id of the workflow being edited (if editing an existing one). Used to
   *  display the webhook URL for webhook-triggered workflows. */
  workflowId?: string;
  /** Receives the validated definition + name + enabled; the manager owns the fetch. */
  onSave: (payload: { name: string; definition: ReturnType<typeof buildDefinition>; enabled: boolean }) => void;
  onCancel: () => void;
}) {
  const [state, setState] = useState<WorkflowFormState>(() => initial ?? emptyFormState());
  const [enabled, setEnabled] = useState(() => initialEnabled ?? true);
  /**
   * 'simple'  → the When / If / Then linear composer (state.graph stays null).
   * 'advanced'→ the visual canvas owns the If/Then logic via state.graph.
   * Open on the canvas when we're handed a graph-backed workflow (edit/template).
   */
  // Default new workflows to the canvas so it's immediately visible.
  // Editing a linear workflow starts simple; editing a graph workflow starts advanced.
  const [mode, setMode] = useState<'simple' | 'advanced'>(
    initial ? (initial.graph ? 'advanced' : 'simple') : 'advanced',
  );
  /** Validation message surfaced from parseWorkflowDefinition (client guard). */
  const [issues, setIssues] = useState<string[]>([]);
  const [nameError, setNameError] = useState('');
  /** Turns true after the user makes any edit — gates incomplete badges so a
   *  blank form doesn't open covered in warnings. */
  const [dirty, setDirty] = useState(false);
  /** Connected-app trigger options for the integration_event picker. */
  const triggerOptions = useTriggerOptions();
  /** Connected apps for the call_integration action picker. */
  const connectedApps = useConnectedApps();
  /** Narrow viewport → the advanced canvas is view-only (edit on a bigger screen). */
  const isNarrow = useIsNarrow();

  // Cmd/Ctrl+S saves the workflow.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (!saving) submit();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // submit is stable within a render so the reference is fine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saving, state]);

  function patch(next: Partial<WorkflowFormState>) {
    setDirty(true);
    setState((s) => ({ ...s, ...next }));
  }
  function patchTrigger(next: Partial<WorkflowFormState['trigger']>) {
    setDirty(true);
    setState((s) => ({ ...s, trigger: { ...s.trigger, ...next } }));
  }

  function updateCondition(id: string, next: Partial<ConditionRowState>) {
    setDirty(true);
    setState((s) => ({
      ...s,
      conditions: s.conditions.map((c) => (c.id === id ? { ...c, ...next } : c)),
    }));
  }
  function updateAction(id: string, next: Partial<ActionRowState>) {
    setDirty(true);
    setState((s) => ({
      ...s,
      actions: s.actions.map((a) => (a.id === id ? { ...a, ...next } : a)),
    }));
  }

  // ── Action drag-to-reorder ─────────────────────────────────────────────────

  const dragSrcRef = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  function moveAction(from: number, to: number) {
    if (from === to) return;
    setDirty(true);
    setState((s) => {
      const next = [...s.actions];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return { ...s, actions: next };
    });
  }

  // ── Per-step incompleteness (only shown after first edit) ──────────────────

  const triggerIncomplete = useMemo(() => {
    if (!dirty) return false;
    const t = state.trigger;
    if (t.type === 'integration_event') return !t.toolkit || !t.event;
    if (t.type === 'deal_stage_changed') return !t.toStage;
    if (t.type === 'schedule') return !t.hour;
    return false;
  }, [dirty, state.trigger]);

  function actionIncomplete(row: ActionRowState): boolean {
    if (!dirty) return false;
    if (row.type === 'draft_message' || row.type === 'schedule_message' || row.type === 'run_chippi')
      return !row.instruction.trim();
    if (row.type === 'create_task') return !row.title.trim();
    if (row.type === 'call_integration') return !row.toolkit || !row.action;
    if (row.type === 'delay') return !row.delayMinutes.trim() || Number(row.delayMinutes) < 1;
    if (row.type === 'filter') return !row.filterField.trim();
    return false;
  }

  // ── Mode switching ──────────────────────────────────────────────────────────

  /** Whether the current graph round-trips to Simple (no branches). */
  const graphIsLinear = state.graph ? isLinearGraph(state.graph) : true;

  /**
   * Simple → Advanced: synthesize the starting graph from the linear form so the
   * realtor keeps their work as a chain on the canvas.
   */
  function enterAdvanced() {
    const def = buildDefinition({ ...state, graph: null });
    patch({ graph: linearToGraph({ conditions: def.conditions, actions: def.actions }) });
    setMode('advanced');
  }

  /**
   * Advanced → Simple: only reachable when the graph is linear. Convert the graph
   * back into the form's condition/action rows (mirroring recordToFormState), drop
   * the graph, and return to the linear composer.
   */
  function exitAdvanced() {
    if (!state.graph) {
      setMode('simple');
      return;
    }
    const linear = graphToLinear(state.graph);
    if (!linear) return; // branching — Simple isn't offered (button is disabled)
    patch({
      conditionOp: linear.conditions.op,
      conditions: conditionsToRows(linear.conditions),
      actions: actionsToRows(linear.actions),
      graph: null,
    });
    setMode('simple');
  }

  function submit() {
    setIssues([]);
    setNameError('');

    const name = state.name.trim();
    if (!name) {
      setNameError('Give the workflow a name.');
      return;
    }

    const definition = buildDefinition(state);

    // Client-side guard: run the SAME validator the API runs so the realtor
    // sees field-level problems inline before the round-trip.
    try {
      parseWorkflowDefinition(definition);
    } catch (err) {
      if (err instanceof WorkflowDefinitionError) {
        setIssues(
          err.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
        );
        return;
      }
      throw err;
    }

    onSave({ name, definition, enabled });
  }

  return (
    <div className="space-y-4">
      {/* Live preview */}
      <WorkflowPreview state={state} />

      {/* Name + Mode — side by side */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[180px] flex-1 space-y-1.5">
          <Label htmlFor="wf-name" className="text-[12.5px] font-medium text-foreground">
            Name
          </Label>
          <Input
            id="wf-name"
            value={state.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="Hot lead → instant draft"
            maxLength={120}
            autoFocus
          />
          {nameError && <p className="text-xs text-destructive">{nameError}</p>}
        </div>
        <div className="flex-shrink-0 space-y-1.5">
          <div
            className="inline-flex rounded-md border border-border/60 p-0.5"
            role="group"
            aria-label="Builder mode"
          >
            <button
              type="button"
              onClick={() => {
                if (mode === 'simple') return;
                if (graphIsLinear) exitAdvanced();
              }}
              aria-pressed={mode === 'simple'}
              disabled={mode === 'advanced' && !graphIsLinear}
              className={cn(
                'rounded-[5px] px-2.5 py-1 text-xs font-medium transition-colors',
                mode === 'simple'
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground',
                mode === 'advanced' && !graphIsLinear && 'cursor-not-allowed opacity-50 hover:text-muted-foreground',
              )}
            >
              Simple
            </button>
            <button
              type="button"
              onClick={() => {
                if (mode === 'advanced') return;
                enterAdvanced();
              }}
              aria-pressed={mode === 'advanced'}
              className={cn(
                'rounded-[5px] px-2.5 py-1 text-xs font-medium transition-colors',
                mode === 'advanced'
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Advanced
            </button>
          </div>
          {mode === 'advanced' && !graphIsLinear && (
            <p className={CAPTION}>This automation branches — edit on the canvas.</p>
          )}
        </div>
      </div>

      {/* 1. Trigger step card */}
      <ZapCard step={1} accent="orange" title="Trigger — when this happens" icon={Zap} incomplete={triggerIncomplete}>
        <div className="space-y-3">
          <Label htmlFor="wf-trigger" className="sr-only">
            Trigger
          </Label>
          <Select
            value={state.trigger.type}
            onValueChange={(v) => patchTrigger({ type: v as TriggerType })}
          >
            <SelectTrigger id="wf-trigger" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRIGGER_ORDER.map((t) => (
                <SelectItem key={t} value={t}>
                  {TRIGGER_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <TriggerConfig
            state={state}
            patchTrigger={patchTrigger}
            triggerOptions={triggerOptions}
            workflowId={workflowId}
          />
        </div>
      </ZapCard>

      <StepConnector />

      {/* 2. Advanced mode — visual canvas */}
      {mode === 'advanced' && (
        <ZapCard step={2} accent="violet" title="Flow — visual canvas" icon={GitBranch}>
          {isNarrow && (
            <p className={cn(CAPTION, 'mb-3 text-amber-600 dark:text-amber-500')}>
              View only — open on a larger screen to edit.
            </p>
          )}
          <WorkflowCanvasLazy
            graph={state.graph ?? emptyGraph}
            trigger={buildDefinition({ ...state, graph: null }).trigger}
            onChange={(g) => patch({ graph: g })}
            readOnly={isNarrow}
          />
        </ZapCard>
      )}

      {/* Simple mode: 2. Filter + 3+. Actions */}
      {mode === 'simple' && (
        <>
          <ZapCard
            step={2}
            accent="blue"
            title="Filter — only continue if…"
            icon={Filter}
            headerRight={
              state.conditions.length > 1 ? (
                <div
                  className="inline-flex rounded-md border border-border/60 p-0.5"
                  role="group"
                  aria-label="Combine conditions with AND or OR"
                >
                  {(['and', 'or'] as const).map((op) => (
                    <button
                      key={op}
                      type="button"
                      onClick={() => patch({ conditionOp: op })}
                      aria-pressed={state.conditionOp === op}
                      className={cn(
                        'rounded-[5px] px-2.5 py-1 text-xs font-medium uppercase tracking-wide transition-colors',
                        state.conditionOp === op
                          ? 'bg-foreground text-background'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {op}
                    </button>
                  ))}
                </div>
              ) : undefined
            }
          >
            {state.conditions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 px-3 py-4 text-center">
                <p className={CAPTION}>No conditions — runs every time the trigger fires.</p>
                <button
                  type="button"
                  onClick={() =>
                    patch({
                      conditions: [...state.conditions, newConditionRow(state.trigger.type)],
                    })
                  }
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-foreground underline underline-offset-2 transition-colors hover:text-foreground/80"
                >
                  <Plus size={12} aria-hidden />
                  Add a condition
                </button>
              </div>
            ) : (
              <>
                <ul className="space-y-2">
                  {state.conditions.map((row) => (
                    <ConditionRowEditor
                      key={row.id}
                      row={row}
                      triggerType={state.trigger.type}
                      onChange={(next) => updateCondition(row.id, next)}
                      onRemove={() =>
                        patch({ conditions: state.conditions.filter((c) => c.id !== row.id) })
                      }
                    />
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() =>
                    patch({
                      conditions: [...state.conditions, newConditionRow(state.trigger.type)],
                    })
                  }
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Plus size={13} aria-hidden />
                  Add condition
                </button>
              </>
            )}
          </ZapCard>

          <StepConnector />

          {/* Action cards — each step gets its own card; draggable to reorder. */}
          {state.actions.map((row, i) => (
            <div
              key={row.id}
              draggable={state.actions.length > 1}
              onDragStart={(e) => {
                dragSrcRef.current = i;
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragOver !== i) setDragOver(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const src = dragSrcRef.current;
                if (src !== null && src !== i) moveAction(src, i);
                dragSrcRef.current = null;
                setDragOver(null);
              }}
              onDragEnd={() => {
                dragSrcRef.current = null;
                setDragOver(null);
              }}
              className={cn(
                'transition-opacity',
                dragSrcRef.current === i && 'opacity-30',
              )}
            >
              {i > 0 && (
                <div
                  className={cn(
                    'group/insert flex flex-col items-center',
                    dragOver === i && dragSrcRef.current !== null && dragSrcRef.current !== i
                      ? 'py-0'
                      : 'py-0.5',
                  )}
                >
                  {dragOver === i && dragSrcRef.current !== null && dragSrcRef.current !== i ? (
                    <div className="h-0.5 w-full rounded-full bg-orange-400" />
                  ) : (
                    <>
                      <div className="h-2 w-px bg-border/50" />
                      <button
                        type="button"
                        title="Insert a step here"
                        aria-label="Insert a step here"
                        onClick={() => {
                          const next = [...state.actions];
                          next.splice(i, 0, newActionRow());
                          patch({ actions: next });
                        }}
                        className="flex h-5 w-5 items-center justify-center rounded-full border border-border/60 bg-background text-muted-foreground/50 opacity-0 transition-all hover:border-orange-400 hover:bg-orange-50 hover:text-orange-500 hover:opacity-100 group-hover/insert:opacity-100 dark:hover:bg-orange-950/30"
                      >
                        <Plus size={10} aria-hidden />
                      </button>
                      <div className="h-2 w-px bg-border/50" />
                    </>
                  )}
                </div>
              )}
              <ActionZapCard
                step={3 + i}
                row={row}
                canRemove={state.actions.length > 1}
                incomplete={actionIncomplete(row)}
                showDragHandle={state.actions.length > 1}
                onChange={(next) => updateAction(row.id, next)}
                onRemove={() =>
                  patch({ actions: state.actions.filter((a) => a.id !== row.id) })
                }
                onDuplicate={() => {
                  const next = [...state.actions];
                  next.splice(i + 1, 0, { ...row, id: nextRowId('act') });
                  patch({ actions: next });
                }}
                connectedApps={connectedApps}
              />
            </div>
          ))}

          {state.actions.length < MAX_ACTIONS && (
            <div className="flex flex-col items-center pt-1">
              <div className="h-4 w-px bg-border/50" />
              <button
                type="button"
                onClick={() => patch({ actions: [...state.actions, newActionRow()] })}
                className="mt-1 flex items-center gap-2 rounded-full border-2 border-dashed border-orange-300/70 px-5 py-2.5 text-sm font-semibold text-orange-500 transition-all hover:border-orange-400 hover:bg-orange-50/60 hover:shadow-sm active:scale-[0.98] dark:border-orange-500/40 dark:text-orange-400 dark:hover:bg-orange-950/30"
              >
                <Plus size={15} aria-hidden />
                Add step
              </button>
            </div>
          )}
        </>
      )}

      {/* Autonomy — the closing trust decision. Set apart with a divider + extra
          top space so it lands as the climax of the flow (how much Chippi may do
          on its own), not another item in the stack. ──────────────────────────*/}
      <section className="space-y-2.5 border-t border-border/50 pt-5">
        <div className="space-y-0.5">
          <p className={SECTION_LABEL}>Autonomy — how much can I do on my own?</p>
          <p className={CAPTION}>The one call that decides whether anything sends without you.</p>
        </div>
        {/* Three independently-focusable toggle buttons (aria-pressed), not a
            radiogroup — honest about the behavior, matching the AND/OR group and
            the filter chips, rather than promising roving arrow-key focus we
            don't implement. */}
        <div role="group" aria-label="Autonomy" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {AUTONOMY_OPTIONS.map((o) => {
            const meta = AUTONOMY_META[o.value];
            const selected = state.autonomy === o.value;
            const isAuto = o.value === 'auto';
            const Icon = meta.icon;
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={selected}
                onClick={() => patch({ autonomy: o.value })}
                className={cn(
                  'flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-colors',
                  selected
                    ? isAuto
                      ? 'border-amber-400/70 bg-amber-50/60 dark:border-amber-500/50 dark:bg-amber-950/30'
                      : 'border-foreground/40 bg-foreground/[0.04]'
                    : 'border-border/60 hover:border-foreground/25 hover:bg-foreground/[0.02]',
                )}
              >
                <span
                  className={cn(
                    'inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors',
                    selected
                      ? isAuto
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                        : 'bg-foreground text-background'
                      : 'bg-foreground/[0.05] text-muted-foreground',
                  )}
                >
                  <Icon size={14} aria-hidden />
                </span>
                <span className="text-[13px] font-medium text-foreground">{meta.label}</span>
                <span className="text-[11px] leading-snug text-muted-foreground">
                  {meta.consequence}
                </span>
              </button>
            );
          })}
        </div>
        <p
          className={cn(
            CAPTION,
            state.autonomy === 'auto' && 'font-medium text-amber-600 dark:text-amber-500',
          )}
        >
          {AUTONOMY_CAPTION[state.autonomy]}
        </p>
      </section>

      {/* Validation issues from the client-side parse guard. */}
      {issues.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2.5">
          <p className="text-xs font-medium text-destructive">Fix these before saving:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-destructive">
            {issues.map((msg, i) => (
              <li key={i}>{msg}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Footer: Enable toggle + Save/Cancel — sticky so it's always reachable */}
      <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-wrap items-center gap-3 border-t border-border/60 bg-card/95 px-4 py-3 backdrop-blur-sm">
        {/* Zapier-style "Turn on" toggle */}
        <label
          htmlFor="wf-enabled-toggle"
          className={cn(
            'flex cursor-pointer select-none items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
            enabled
              ? 'border-green-300 bg-green-50 text-green-700 dark:border-green-700/50 dark:bg-green-950/30 dark:text-green-400'
              : 'border-border/60 bg-muted/30 text-muted-foreground',
          )}
        >
          <Power
            size={13}
            className={enabled ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground/60'}
            aria-hidden
          />
          <span>{workflowId ? (enabled ? 'On' : 'Paused') : (enabled ? 'Turn on when saved' : 'Save as draft')}</span>
          <Switch
            id="wf-enabled-toggle"
            checked={enabled}
            onCheckedChange={setEnabled}
            disabled={saving}
            className="ml-0.5"
          />
        </label>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-full h-9 px-5 text-sm font-semibold bg-orange-500 text-white hover:bg-orange-600 active:scale-[0.98] transition-all disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {saving ? 'Saving…' : 'Save workflow'}
          </button>
          <span className="text-[11px] text-muted-foreground/50 select-none">⌘S</span>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-md px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Webhook trigger display ───────────────────────────────────────────────────

/**
 * Shows the unique webhook URL that fires this workflow. The URL is just the
 * workflow's id routed through the webhook endpoint — the UUID randomness is
 * the auth token (128 bits, same security posture as Zapier webhook URLs).
 * For new (unsaved) workflows, a "save first" prompt.
 */
function WebhookTriggerDisplay({ workflowId }: { workflowId?: string }) {
  const [copied, setCopied] = useState(false);
  const url = workflowId
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/api/workflows/${workflowId}/webhook`
    : null;

  function copyUrl() {
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="space-y-2">
      <p className={CAPTION}>
        POST any JSON payload to this URL and the workflow fires immediately. The URL is your secret — keep it private.
      </p>
      {url ? (
        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
          <Webhook size={13} className="flex-shrink-0 text-muted-foreground" aria-hidden />
          <code className="flex-1 truncate text-[11px] font-mono text-foreground/80 select-all">
            {url}
          </code>
          <button
            type="button"
            onClick={copyUrl}
            aria-label={copied ? 'Copied' : 'Copy webhook URL'}
            className="flex-shrink-0 inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
          >
            {copied ? <CheckIcon size={12} className="text-emerald-500" /> : <Copy size={12} />}
          </button>
        </div>
      ) : (
        <p className={CAPTION}>
          <span className="font-medium text-foreground">Save this workflow first</span> — your unique webhook URL will appear here.
        </p>
      )}
    </div>
  );
}

// ── Trigger config — per-type fields ─────────────────────────────────────────

function TriggerConfig({
  state,
  patchTrigger,
  triggerOptions,
  workflowId,
}: {
  state: WorkflowFormState;
  patchTrigger: (next: Partial<WorkflowFormState['trigger']>) => void;
  triggerOptions: TriggerOptionsState;
  workflowId?: string;
}) {
  const t = state.trigger;

  if (t.type === 'lead_score_threshold') {
    return (
      <FieldRow label="Minimum score" htmlFor="wf-min">
        <Input
          id="wf-min"
          type="number"
          inputMode="numeric"
          value={t.min}
          onChange={(e) => patchTrigger({ min: e.target.value })}
          placeholder="80"
          className="h-8 w-28"
        />
      </FieldRow>
    );
  }

  if (t.type === 'inbound_message') {
    return (
      <FieldRow label="Channel" htmlFor="wf-channel">
        <MiniSelect
          id="wf-channel"
          value={t.channel}
          onValueChange={(v) => patchTrigger({ channel: v as 'sms' | 'email' | 'any' })}
          options={[
            { value: 'any', label: 'Any channel' },
            { value: 'sms', label: 'SMS' },
            { value: 'email', label: 'Email' },
          ]}
        />
      </FieldRow>
    );
  }

  if (t.type === 'integration_event') {
    return (
      <IntegrationEventConfig
        toolkit={t.toolkit}
        event={t.event}
        patchTrigger={patchTrigger}
        triggerOptions={triggerOptions}
      />
    );
  }

  if (t.type === 'deal_stage_changed') {
    return (
      <FieldRow label="To stage" htmlFor="wf-tostage">
        <Input
          id="wf-tostage"
          value={t.toStage}
          onChange={(e) => patchTrigger({ toStage: e.target.value })}
          placeholder="offer (leave blank for any)"
          className="h-8"
        />
      </FieldRow>
    );
  }

  if (t.type === 'schedule') {
    const hourOptions = Array.from({ length: 24 }, (_, h) => {
      const ampm = h < 12 ? 'AM' : 'PM';
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      return { value: String(h), label: `${h12}:00 ${ampm}` };
    });
    return (
      <div className="space-y-2.5">
        <FieldRow label="Cadence" htmlFor="wf-cadence">
          <MiniSelect
            id="wf-cadence"
            value={t.cadence}
            onValueChange={(v) =>
              patchTrigger({ cadence: v as 'hourly' | 'daily' | 'weekdays' })
            }
            options={[
              { value: 'hourly', label: 'Every hour' },
              { value: 'daily', label: 'Every day' },
              { value: 'weekdays', label: 'Weekdays (Mon–Fri)' },
            ]}
          />
        </FieldRow>
        {t.cadence !== 'hourly' && (
          <FieldRow label="Time" htmlFor="wf-hour">
            <MiniSelect
              id="wf-hour"
              value={t.hour || '9'}
              onValueChange={(v) => patchTrigger({ hour: v })}
              className="min-w-[8rem]"
              options={hourOptions}
            />
          </FieldRow>
        )}
      </div>
    );
  }

  if (t.type === 'webhook') {
    return <WebhookTriggerDisplay workflowId={workflowId} />;
  }

  // lead_created, tour_completed — no config.
  return <p className={CAPTION}>No extra settings — this trigger fires on its own.</p>;
}

// ── integration_event picker ─────────────────────────────────────────────────

/**
 * App → Event picker for the integration_event trigger. Drives the same
 * toolkit/event form strings the schema expects (so build-definition and
 * recordToFormState round-trip unchanged) — the picker just sets them from the
 * realtor's connected apps instead of free text.
 *
 * Graceful states: while options load, a muted line; on error or no connected
 * apps with triggers, a calm hint linking to integrations PLUS the free-text
 * fallback, so the builder never hard-blocks. When an existing workflow's
 * toolkit/event isn't among the connected apps (e.g. the app was disconnected),
 * the free-text values still show via the fallback.
 */
function IntegrationEventConfig({
  toolkit,
  event,
  patchTrigger,
  triggerOptions,
}: {
  toolkit: string;
  event: string;
  patchTrigger: (next: Partial<WorkflowFormState['trigger']>) => void;
  triggerOptions: TriggerOptionsState;
}) {
  // Routes are slug-scoped (/s/[slug]/…), so the integrations link has to carry
  // the current space slug — a bare /chippi/integrations doesn't resolve.
  const params = useParams();
  const slug = params?.slug as string | undefined;
  const integrationsHref = slug ? `/s/${slug}/chippi/integrations` : '/chippi/integrations';

  if (triggerOptions.status === 'loading') {
    return <p className={CAPTION}>Loading your connected apps…</p>;
  }

  const apps = triggerOptions.status === 'ready' ? triggerOptions.apps : [];
  const selectedApp = apps.find((a) => a.toolkit === toolkit) ?? null;
  // Show the picker only when there's at least one connected app to pick AND
  // the current toolkit (if set) is one of them — otherwise fall back to
  // free-text so a disconnected-app workflow stays editable.
  const canPick = apps.length > 0 && (toolkit === '' || selectedApp !== null);

  if (!canPick) {
    return (
      <div className="space-y-2.5">
        <p className={CAPTION}>
          Connect an app first to trigger on its events.{' '}
          <a
            href={integrationsHref}
            className="font-medium text-foreground underline underline-offset-2 hover:text-foreground/80"
          >
            Manage integrations
          </a>
        </p>
        <FieldRow label="Toolkit" htmlFor="wf-toolkit">
          <Input
            id="wf-toolkit"
            value={toolkit}
            onChange={(e) => patchTrigger({ toolkit: e.target.value })}
            placeholder="gmail"
            className="h-8"
          />
        </FieldRow>
        <FieldRow label="Event" htmlFor="wf-event">
          <Input
            id="wf-event"
            value={event}
            onChange={(e) => patchTrigger({ event: e.target.value })}
            placeholder="GMAIL_NEW_GMAIL_MESSAGE"
            className="h-8"
          />
        </FieldRow>
      </div>
    );
  }

  const events = selectedApp?.events ?? [];
  const selectedEvent = events.find((e) => e.slug === event) ?? null;

  return (
    <div className="space-y-2.5">
      <FieldRow label="App" htmlFor="wf-toolkit">
        <MiniSelect
          id="wf-toolkit"
          value={toolkit}
          onValueChange={(next) => {
            // Switching app clears the event — its slug won't exist on the new
            // app's list (so the schema never sees a stale toolkit/event pair).
            const nextApp = apps.find((a) => a.toolkit === next);
            patchTrigger({ toolkit: next, event: nextApp?.events[0]?.slug ?? '' });
          }}
          className="min-w-[12rem]"
          options={apps.map((a) => ({ value: a.toolkit, label: a.label }))}
        />
      </FieldRow>
      {selectedApp && (
        <FieldRow label="Event" htmlFor="wf-event">
          <MiniSelect
            id="wf-event"
            value={event}
            onValueChange={(next) => patchTrigger({ event: next })}
            className="min-w-[14rem]"
            options={events.map((e) => ({ value: e.slug, label: e.label }))}
          />
        </FieldRow>
      )}
      {selectedEvent && <p className={CAPTION}>Triggers when: {selectedEvent.label}</p>}
    </div>
  );
}

// ── Condition row ────────────────────────────────────────────────────────────

/** Sentinel option for the attribute picker's escape hatch to a raw path. */
const CUSTOM_ATTRIBUTE = '__custom__';

/**
 * One condition row, humanised. The row's stored shape stays
 * { field, operator, value } strings — this is a pure UI layer over it.
 *
 * Two modes, chosen by whether the stored `field` maps to a catalog attribute:
 *  - Human: an Attribute picker (friendly labels for the trigger), an Operator
 *    select narrowed to that attribute's type, and a Value input typed to match
 *    (number / enum select / text). The common path needs zero raw-path typing.
 *  - Advanced/custom: when the field is an unknown path OR the realtor picks
 *    "Custom field…", the original raw `field` text input returns alongside the
 *    full operator list — the escape hatch so arbitrary dotted paths are never
 *    lost or made un-editable.
 */
function ConditionRowEditor({
  row,
  triggerType,
  onChange,
  onRemove,
}: {
  row: ConditionRowState;
  triggerType: TriggerType;
  onChange: (next: Partial<ConditionRowState>) => void;
  onRemove: () => void;
}) {
  const attributes = useMemo(() => attributesForTrigger(triggerType), [triggerType]);
  const activeAttr = findAttributeByField(row.field);
  // Custom when the field is blank or an unrecognised path. A blank field on a
  // brand-new row only happens when the trigger has no attributes; new rows
  // normally default into an attribute (see newConditionRow).
  const [forcedCustom, setForcedCustom] = useState(false);
  const isCustom = forcedCustom || activeAttr === null;

  const needsValue = !VALUELESS_OPERATORS.has(row.operator);

  /** Switch the row to a chosen attribute, keeping operator/value valid. */
  function selectAttribute(attr: ConditionAttribute) {
    setForcedCustom(false);
    const operatorValid = attr.operators.includes(row.operator);
    const nextOperator = operatorValid ? row.operator : attr.operators[0];
    // Clear the value when the new type can't honour the old string (a number
    // attribute can't keep arbitrary text; an enum needs one of its options).
    const keepValue =
      attr.valueType === 'text' ||
      (attr.valueType === 'enum' && attr.options?.some((o) => o.value === row.value)) ||
      // A number attribute only keeps a FULLY numeric literal — mirrors
      // coerceConditionValue's own regex, so partials ('', '-', '.') clear
      // rather than surviving into a NaN/dead condition with no inline error.
      (attr.valueType === 'number' && /^-?\d+(\.\d+)?$/.test(row.value.trim()));
    onChange({
      field: attr.field,
      operator: nextOperator,
      ...(keepValue ? {} : { value: '' }),
    });
  }

  const attributeSelectValue = isCustom ? CUSTOM_ATTRIBUTE : (activeAttr?.key ?? CUSTOM_ATTRIBUTE);
  const operatorOptions = isCustom
    ? OPERATORS
    : (activeAttr?.operators ?? OPERATORS);

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-card p-2">
      <MiniSelect
        aria-label="Attribute"
        value={attributeSelectValue}
        onValueChange={(v) => {
          if (v === CUSTOM_ATTRIBUTE) {
            // Enter the escape hatch; keep the current field so the realtor
            // edits the raw path rather than losing it.
            setForcedCustom(true);
            return;
          }
          const attr = attributes.find((a) => a.key === v);
          if (attr) selectAttribute(attr);
        }}
        className="w-[11rem]"
        options={[
          ...attributes.map((a) => ({ value: a.key, label: a.label })),
          { value: CUSTOM_ATTRIBUTE, label: 'Custom field…' },
        ]}
      />

      {isCustom && (
        <Input
          aria-label="Field"
          value={row.field}
          onChange={(e) => onChange({ field: e.target.value })}
          placeholder="lead.score"
          className="h-8 flex-1 min-w-[8rem]"
        />
      )}

      <MiniSelect
        aria-label="Operator"
        value={row.operator}
        onValueChange={(v) => onChange({ operator: v as Operator })}
        className="w-[9.5rem]"
        options={operatorOptions.map((op) => ({ value: op, label: OPERATOR_LABELS[op] }))}
      />

      {needsValue &&
        (!isCustom && activeAttr?.valueType === 'enum' && activeAttr.options ? (
          <MiniSelect
            aria-label="Value"
            value={row.value}
            onValueChange={(v) => onChange({ value: v })}
            className="flex-1 min-w-[6rem]"
            options={activeAttr.options}
          />
        ) : (
          <Input
            aria-label="Value"
            type={!isCustom && activeAttr?.valueType === 'number' ? 'number' : 'text'}
            inputMode={!isCustom && activeAttr?.valueType === 'number' ? 'numeric' : undefined}
            value={row.value}
            onChange={(e) => onChange({ value: e.target.value })}
            placeholder="80"
            className="h-8 flex-1 min-w-[6rem]"
          />
        ))}

      <RemoveButton label="Remove condition" onClick={onRemove} />
    </li>
  );
}

function ActionConfig({
  row,
  onChange,
  connectedApps,
}: {
  row: ActionRowState;
  onChange: (next: Partial<ActionRowState>) => void;
  connectedApps: ConnectedAppsState;
}) {
  if (row.type === 'draft_message' || row.type === 'schedule_message') {
    return (
      <div className="space-y-2.5">
        <FieldRow label="Channel" htmlFor={`act-ch-${row.id}`}>
          <MiniSelect
            id={`act-ch-${row.id}`}
            value={row.channel}
            onValueChange={(v) => onChange({ channel: v as 'sms' | 'email' })}
            options={[
              { value: 'sms', label: 'SMS' },
              { value: 'email', label: 'Email' },
            ]}
          />
        </FieldRow>
        <InstructionField row={row} onChange={onChange} />
        {row.type === 'schedule_message' && (
          <FieldRow label="Delay (minutes)" htmlFor={`act-delay-${row.id}`}>
            <Input
              id={`act-delay-${row.id}`}
              type="number"
              inputMode="numeric"
              min={0}
              value={row.delayMinutes}
              onChange={(e) => onChange({ delayMinutes: e.target.value })}
              placeholder="60"
              className="h-8 w-28"
            />
          </FieldRow>
        )}
      </div>
    );
  }

  if (row.type === 'run_chippi') {
    return <InstructionField row={row} onChange={onChange} />;
  }

  if (row.type === 'create_task') {
    return (
      <div className="space-y-2.5">
        <div className="space-y-1.5">
          <Label htmlFor={`act-title-${row.id}`} className="text-[12px] text-muted-foreground">
            Task title
          </Label>
          <Input
            id={`act-title-${row.id}`}
            value={row.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="Follow up after tour"
            className="h-8"
          />
        </div>
        <FieldRow label="Due in days (optional)" htmlFor={`act-due-${row.id}`}>
          <Input
            id={`act-due-${row.id}`}
            type="number"
            inputMode="numeric"
            min={0}
            value={row.dueInDays}
            onChange={(e) => onChange({ dueInDays: e.target.value })}
            placeholder="2"
            className="h-8 w-24"
          />
        </FieldRow>
      </div>
    );
  }

  if (row.type === 'delay') {
    return (
      <div className="space-y-2.5">
        <p className={CAPTION}>
          Pause the automation before the next step runs.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor={`act-delay-amt-${row.id}`} className="text-[12px] text-muted-foreground">
            Wait for
          </Label>
          <Input
            id={`act-delay-amt-${row.id}`}
            type="number"
            inputMode="numeric"
            min={1}
            value={row.delayMinutes}
            onChange={(e) => onChange({ delayMinutes: e.target.value })}
            placeholder="2"
            className="h-8 w-20"
          />
          <MiniSelect
            value={row.delayUnit ?? 'minutes'}
            onValueChange={(v) => onChange({ delayUnit: v as 'minutes' | 'hours' | 'days' })}
            options={[
              { value: 'minutes', label: 'minutes' },
              { value: 'hours', label: 'hours' },
              { value: 'days', label: 'days' },
            ]}
          />
        </div>
      </div>
    );
  }

  if (row.type === 'filter') {
    return (
      <div className="space-y-2.5">
        <p className={CAPTION}>
          Only continue if this condition is true — otherwise the automation stops here.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={row.filterField}
            onChange={(e) => onChange({ filterField: e.target.value })}
            placeholder="lead.score"
            className="h-8 w-32"
            aria-label="Field"
          />
          <MiniSelect
            value={row.filterOperator}
            onValueChange={(v) => onChange({ filterOperator: v as Operator })}
            options={OPERATORS.map((op) => ({ value: op, label: OPERATOR_LABELS[op] }))}
            className="min-w-[8rem]"
            aria-label="Operator"
          />
          {!VALUELESS_OPERATORS.has(row.filterOperator) && (
            <Input
              value={row.filterValue}
              onChange={(e) => onChange({ filterValue: e.target.value })}
              placeholder="80"
              className="h-8 w-24"
              aria-label="Value"
            />
          )}
        </div>
      </div>
    );
  }

  // call_integration — app + action lead; show connected apps picker when apps
  // are available, else fall back to free-text so authoring is never blocked.
  const hasApps =
    connectedApps.status === 'ready' && connectedApps.apps.length > 0;
  const selectedApp =
    hasApps && connectedApps.status === 'ready'
      ? connectedApps.apps.find((a) => a.toolkit === row.toolkit)
      : null;
  const availableActions = selectedApp?.actions ?? [];

  return (
    <div className="space-y-2.5">
      {connectedApps.status === 'ready' && !hasApps && (
        <p className="rounded-lg border border-dashed border-border/60 px-3 py-2 text-[12px] text-muted-foreground text-center">
          No apps connected. Go to Automations → Configuration to connect Gmail, Slack, and more.
        </p>
      )}

      <FieldRow label="Connected app" htmlFor={`act-tk-${row.id}`}>
        {hasApps && connectedApps.status === 'ready' ? (
          <MiniSelect
            id={`act-tk-${row.id}`}
            value={row.toolkit || '__none__'}
            onValueChange={(v) => {
              const next = v === '__none__' ? '' : v;
              const app = connectedApps.apps.find((a) => a.toolkit === next);
              onChange({
                toolkit: next,
                // Reset action when toolkit changes
                action: app?.actions[0]?.value ?? '',
              });
            }}
            options={[
              { value: '__none__', label: 'Pick an app…' },
              ...connectedApps.apps.map((a) => ({ value: a.toolkit, label: a.label })),
            ]}
          />
        ) : (
          <Input
            id={`act-tk-${row.id}`}
            value={row.toolkit}
            onChange={(e) => onChange({ toolkit: e.target.value })}
            placeholder="slack"
            className="h-8"
          />
        )}
      </FieldRow>

      <FieldRow label="Action" htmlFor={`act-action-${row.id}`}>
        {availableActions.length > 0 ? (
          <MiniSelect
            id={`act-action-${row.id}`}
            value={row.action || '__none__'}
            onValueChange={(v) => onChange({ action: v === '__none__' ? '' : v })}
            options={[
              { value: '__none__', label: 'Pick an action…' },
              ...availableActions,
            ]}
          />
        ) : (
          <Input
            id={`act-action-${row.id}`}
            value={row.action}
            onChange={(e) => onChange({ action: e.target.value })}
            placeholder="SLACK_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL"
            className="h-8"
          />
        )}
      </FieldRow>
      <details className="group/adv">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground">
          <Plus
            size={12}
            aria-hidden
            className="transition-transform group-open/adv:rotate-45"
          />
          Advanced — params (optional JSON)
        </summary>
        <div className="mt-2 space-y-1.5">
          <Label htmlFor={`act-params-${row.id}`} className="sr-only">
            Params (optional JSON)
          </Label>
          <Textarea
            id={`act-params-${row.id}`}
            value={row.paramsJson}
            onChange={(e) => onChange({ paramsJson: e.target.value })}
            placeholder='{ "channel": "#leads" }'
            rows={2}
            className="font-mono text-xs"
          />
        </div>
      </details>
    </div>
  );
}

function InstructionField({
  row,
  onChange,
}: {
  row: ActionRowState;
  onChange: (next: Partial<ActionRowState>) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`act-instr-${row.id}`} className="text-[12px] text-muted-foreground">
        Instruction
      </Label>
      <Textarea
        id={`act-instr-${row.id}`}
        value={row.instruction}
        onChange={(e) => onChange({ instruction: e.target.value })}
        placeholder="Draft a warm, personal intro and reference their interest."
        rows={3}
      />
    </div>
  );
}

// ── Small shared primitives ──────────────────────────────────────────────────

function FieldRow({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Label htmlFor={htmlFor} className="text-[12px] text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function MiniSelect({
  id,
  value,
  onValueChange,
  options,
  className,
  'aria-label': ariaLabel,
}: {
  id?: string;
  value: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger id={id} aria-label={ariaLabel} className={cn('h-8', className)}>
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
      className="flex-shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
    >
      <X size={14} />
    </button>
  );
}
