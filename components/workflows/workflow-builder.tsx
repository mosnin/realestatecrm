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

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, Plus, X, Sparkles, PencilLine, BellRing, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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
  lead_score_threshold: 'A lead’s score crosses a threshold',
  inbound_message: 'An inbound message arrives',
  tour_completed: 'A tour is completed',
  deal_stage_changed: 'A deal changes stage',
  integration_event: 'A connected app fires an event',
  schedule: 'On a schedule',
};

const TRIGGER_ORDER: TriggerType[] = [
  'lead_score_threshold',
  'lead_created',
  'inbound_message',
  'tour_completed',
  'deal_stage_changed',
  'integration_event',
  'schedule',
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
};

const ACTION_ORDER: WorkflowActionType[] = [
  'draft_message',
  'run_chippi',
  'create_task',
  'schedule_message',
  'call_integration',
];

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
    title: '',
    dueInDays: '',
    toolkit: '',
    action: '',
    paramsJson: '',
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
function actionsToRows(actions: WorkflowAction[]): ActionRowState[] {
  return actions.map((a) => ({
    id: nextRowId('act'),
    type: a.type,
    channel:
      a.type === 'draft_message' || a.type === 'schedule_message' ? a.config.channel : 'sms',
    instruction:
      a.type === 'draft_message' || a.type === 'schedule_message' || a.type === 'run_chippi'
        ? a.config.instruction
        : '',
    delayMinutes: a.type === 'schedule_message' ? String(a.config.delayMinutes) : '',
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
  }));
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
          <span className="text-muted-foreground/80">, I’ll </span>
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
 * A numbered step label (When / If / Then read as 1 → 2 → 3). The small index
 * badge turns the three sections into one ordered flow rather than three
 * disconnected boxes — the realtor reads them as a sequence.
 */
function StepLabel({ index, children }: { index: number; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-foreground/[0.07] text-[10px] font-semibold tabular-nums text-muted-foreground">
        {index}
      </span>
      <p className={SECTION_LABEL}>{children}</p>
    </div>
  );
}

// ── The builder ──────────────────────────────────────────────────────────────

export function WorkflowBuilder({
  initial,
  saving,
  onSave,
  onCancel,
}: {
  initial?: WorkflowFormState;
  saving: boolean;
  /** Receives the validated definition + name; the manager owns the fetch. */
  onSave: (payload: { name: string; definition: ReturnType<typeof buildDefinition> }) => void;
  onCancel: () => void;
}) {
  const [state, setState] = useState<WorkflowFormState>(() => initial ?? emptyFormState());
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
  /** Connected-app trigger options for the integration_event picker. */
  const triggerOptions = useTriggerOptions();
  /** Narrow viewport → the advanced canvas is view-only (edit on a bigger screen). */
  const isNarrow = useIsNarrow();

  function patch(next: Partial<WorkflowFormState>) {
    setState((s) => ({ ...s, ...next }));
  }
  function patchTrigger(next: Partial<WorkflowFormState['trigger']>) {
    setState((s) => ({ ...s, trigger: { ...s.trigger, ...next } }));
  }

  function updateCondition(id: string, next: Partial<ConditionRowState>) {
    setState((s) => ({
      ...s,
      conditions: s.conditions.map((c) => (c.id === id ? { ...c, ...next } : c)),
    }));
  }
  function updateAction(id: string, next: Partial<ActionRowState>) {
    setState((s) => ({
      ...s,
      actions: s.actions.map((a) => (a.id === id ? { ...a, ...next } : a)),
    }));
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

    onSave({ name, definition });
  }

  return (
    <div className="space-y-6">
      {/* Live preview — the sentence assembling as you build. ──────────────── */}
      <WorkflowPreview state={state} />

      {/* Name ─────────────────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
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

      {/* Mode — Simple (linear) vs Advanced (visual canvas). ──────────────────
          The graph owns If/Then in Advanced; Simple keeps the When/If/Then form. */}
      <div className="space-y-1.5">
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
          <p className={CAPTION}>This automation branches — edit it on the canvas.</p>
        )}
      </div>

      {/* When ─────────────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <StepLabel index={1}>When</StepLabel>
        <div className="space-y-3 rounded-lg border border-border/60 bg-muted/10 p-3">
          <div className="space-y-1.5">
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
          </div>
          <TriggerConfig
            state={state}
            patchTrigger={patchTrigger}
            triggerOptions={triggerOptions}
          />
        </div>
      </section>

      {/* ADVANCED — the visual canvas owns the If/Then logic. The trigger above
          drives the canvas's trigger node; the linear If/Then sections below are
          hidden because the graph carries them. ────────────────────────────── */}
      {mode === 'advanced' && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className={SECTION_LABEL}>Flow</p>
            {isNarrow && (
              <p className={cn(CAPTION, 'text-amber-600 dark:text-amber-500')}>
                View only — open on a larger screen to edit.
              </p>
            )}
          </div>
          <WorkflowCanvasLazy
            graph={state.graph ?? emptyGraph}
            trigger={buildDefinition({ ...state, graph: null }).trigger}
            onChange={(g) => patch({ graph: g })}
            readOnly={isNarrow}
          />
        </section>
      )}

      {/* If / Then — SIMPLE mode only (the graph owns them in Advanced). ────── */}
      {mode === 'simple' && (
        <>
      {/* If ───────────────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <StepLabel index={2}>If</StepLabel>
          {state.conditions.length > 1 && (
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
          )}
        </div>

        {state.conditions.length === 0 ? (
          <p className={cn(CAPTION, 'rounded-lg border border-dashed border-border/60 px-3 py-2.5')}>
            No conditions — the workflow runs every time it’s triggered.
          </p>
        ) : (
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
        )}

        <button
          type="button"
          onClick={() =>
            patch({
              conditions: [
                ...state.conditions,
                newConditionRow(state.trigger.type),
              ],
            })
          }
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <Plus size={13} />
          Add condition
        </button>
      </section>

      {/* Then ─────────────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <StepLabel index={3}>Then</StepLabel>
        <ul className="space-y-2">
          {state.actions.map((row, i) => (
            <ActionRowEditor
              key={row.id}
              index={i}
              row={row}
              canRemove={state.actions.length > 1}
              onChange={(next) => updateAction(row.id, next)}
              onRemove={() =>
                patch({ actions: state.actions.filter((a) => a.id !== row.id) })
              }
            />
          ))}
        </ul>
        {state.actions.length < MAX_ACTIONS && (
          <button
            type="button"
            onClick={() => patch({ actions: [...state.actions, newActionRow()] })}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Plus size={13} />
            Add action
          </button>
        )}
      </section>
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

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className={cn(PRIMARY_PILL, 'disabled:cursor-not-allowed disabled:opacity-60')}
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {saving ? 'Saving' : 'Save workflow'}
        </button>
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
  );
}

// ── Trigger config — per-type fields ─────────────────────────────────────────

function TriggerConfig({
  state,
  patchTrigger,
  triggerOptions,
}: {
  state: WorkflowFormState;
  patchTrigger: (next: Partial<WorkflowFormState['trigger']>) => void;
  triggerOptions: TriggerOptionsState;
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
              { value: 'hourly', label: 'Hourly' },
              { value: 'daily', label: 'Daily' },
              { value: 'weekdays', label: 'Weekdays' },
            ]}
          />
        </FieldRow>
        {t.cadence !== 'hourly' && (
          <FieldRow label="Hour (0–23)" htmlFor="wf-hour">
            <Input
              id="wf-hour"
              type="number"
              inputMode="numeric"
              min={0}
              max={23}
              value={t.hour}
              onChange={(e) => patchTrigger({ hour: e.target.value })}
              placeholder="8"
              className="h-8 w-24"
            />
          </FieldRow>
        )}
      </div>
    );
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

// ── Action row ───────────────────────────────────────────────────────────────

function ActionRowEditor({
  index,
  row,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number;
  row: ActionRowState;
  canRemove: boolean;
  onChange: (next: Partial<ActionRowState>) => void;
  onRemove: () => void;
}) {
  return (
    <li className="space-y-2.5 rounded-lg border border-border/60 bg-card p-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold tabular-nums text-muted-foreground/70">
          {index + 1}
        </span>
        <Label htmlFor={`act-type-${row.id}`} className="sr-only">
          Action type
        </Label>
        <MiniSelect
          id={`act-type-${row.id}`}
          value={row.type}
          onValueChange={(v) => onChange({ type: v as WorkflowActionType })}
          className="flex-1"
          options={ACTION_ORDER.map((a) => ({ value: a, label: ACTION_LABELS[a] }))}
        />
        {canRemove && <RemoveButton label="Remove action" onClick={onRemove} />}
      </div>
      <ActionConfig row={row} onChange={onChange} />
    </li>
  );
}

function ActionConfig({
  row,
  onChange,
}: {
  row: ActionRowState;
  onChange: (next: Partial<ActionRowState>) => void;
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

  // call_integration — app + action lead; the raw JSON params are tucked into an
  // Advanced disclosure so the common case isn't dominated by a code box.
  return (
    <div className="space-y-2.5">
      <FieldRow label="App" htmlFor={`act-tk-${row.id}`}>
        <Input
          id={`act-tk-${row.id}`}
          value={row.toolkit}
          onChange={(e) => onChange({ toolkit: e.target.value })}
          placeholder="slack"
          className="h-8"
        />
      </FieldRow>
      <FieldRow label="Action" htmlFor={`act-action-${row.id}`}>
        <Input
          id={`act-action-${row.id}`}
          value={row.action}
          onChange={(e) => onChange({ action: e.target.value })}
          placeholder="send_message"
          className="h-8"
        />
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
