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
import { Loader2, Plus, X, Sparkles, PencilLine, BellRing, Zap, Filter, GitBranch, Clock, CheckSquare, Plug, AlertCircle, GripVertical, Webhook, Copy, Check as CheckIcon, Power, ChevronDown, Wand2, Send, UserCog } from 'lucide-react';
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
  FORMATTER_OPERATIONS,
  MAX_ACTIONS,
  OPERATORS,
  UPDATE_LEAD_FIELDS,
  parseWorkflowDefinition,
  WorkflowDefinitionError,
  type ConditionGroup,
  type FormatterOperation,
  type Operator,
  type TriggerType,
  type UpdateLeadField,
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
import { timeAgo } from '@/lib/formatting';

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

/** Sample trigger event data shown in the "Test trigger" panel. Each entry is a
 *  flat key → value map the user can reference when building conditions/messages. */
const TRIGGER_SAMPLE_DATA: Record<TriggerType, Record<string, string | number>> = {
  lead_created: {
    'lead.name': 'Jane Smith',
    'lead.email': 'jane@example.com',
    'lead.phone': '+1 555 123 4567',
    'lead.score': 55,
    'lead.source': 'Zillow',
    'lead.assignedAgent': 'Alex Johnson',
    'lead.propertyInterest': '3BR in Austin',
    'lead.createdAt': '2025-06-15T09:31:00Z',
  },
  lead_score_threshold: {
    'lead.name': 'Marcus Lee',
    'lead.email': 'marcus@example.com',
    'lead.phone': '+1 555 987 6543',
    'lead.score': 84,
    'lead.source': 'Realtor.com',
    'lead.assignedAgent': 'Alex Johnson',
    'lead.propertyInterest': '4BR in North Austin',
    'lead.previousScore': 72,
  },
  inbound_message: {
    'message.channel': 'sms',
    'message.body': 'Hey, I saw the listing on Oak Ave — is it still available?',
    'message.from': '+1 512 555 0192',
    'lead.name': 'Priya Patel',
    'lead.email': 'priya@example.com',
    'lead.score': 61,
    'message.receivedAt': '2025-06-15T14:20:00Z',
  },
  tour_completed: {
    'lead.name': 'Chris Nguyen',
    'lead.email': 'chris@example.com',
    'lead.phone': '+1 512 555 7788',
    'lead.score': 78,
    'property.address': '1204 Oak Ave, Austin TX 78703',
    'property.price': 585000,
    'tour.scheduledAt': '2025-06-15T11:00:00Z',
    'tour.completedAt': '2025-06-15T11:45:00Z',
  },
  deal_stage_changed: {
    'lead.name': 'Sam Torres',
    'lead.email': 'sam@example.com',
    'deal.stage': 'offer',
    'deal.previousStage': 'showing',
    'property.address': '340 Maple Dr, Austin TX 78704',
    'property.price': 620000,
    'deal.changedAt': '2025-06-15T16:05:00Z',
  },
  integration_event: {
    'event.toolkit': 'gmail',
    'event.name': 'new_message',
    'contact.email': 'buyer@example.com',
    'contact.name': 'Taylor Reed',
    'email.subject': 'Re: Oak Ave listing',
    'email.snippet': "Thanks for the info — can we schedule a tour?",
    'event.receivedAt': '2025-06-15T08:44:00Z',
  },
  schedule: {
    'schedule.firedAt': '2025-06-15T08:00:00Z',
    'schedule.cadence': 'weekdays',
    'schedule.dayOfWeek': 'Monday',
    'space.name': 'My CRM',
    'agent.name': 'Alex Johnson',
  },
  webhook: {
    'webhook.source': 'external-app',
    'payload.lead_id': 'lead_9a3f77',
    'payload.event': 'form_submitted',
    'payload.name': 'River Brooks',
    'payload.email': 'river@example.com',
    'payload.receivedAt': '2025-06-15T10:12:00Z',
  },
};

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
  formatter: 'Format data',
  webhook_post: 'POST to a webhook URL',
  update_lead: 'Update this lead',
  notify_agent: 'Notify me — send a push alert',
};

const ACTION_ORDER: WorkflowActionType[] = [
  'draft_message',
  'run_chippi',
  'create_task',
  'update_lead',
  'notify_agent',
  'schedule_message',
  'filter',
  'formatter',
  'delay',
  'call_integration',
  'webhook_post',
];

const ACTION_ICONS: Record<WorkflowActionType, LucideIcon> = {
  draft_message: PencilLine,
  schedule_message: Clock,
  create_task: CheckSquare,
  call_integration: Plug,
  run_chippi: Sparkles,
  delay: Clock,
  filter: Filter,
  formatter: Wand2,
  webhook_post: Send,
  update_lead: UserCog,
  notify_agent: BellRing,
};

const ACTION_DESCRIPTIONS: Record<WorkflowActionType, string> = {
  draft_message: 'Compose an SMS or email for you to review before sending',
  schedule_message: 'Auto-send a message after a delay',
  create_task: 'Create a follow-up task for you or your team',
  call_integration: 'Trigger an action in a connected app',
  run_chippi: 'Ask Chippi to research, summarize, or reason',
  delay: 'Pause the workflow before the next step',
  filter: 'Stop the run if a condition is not met',
  formatter: 'Transform text, numbers, or dates before the next step',
  webhook_post: 'POST JSON to any HTTPS endpoint — CRMs, Slack, or custom backends',
  update_lead: 'Set the score tier, follow-up date, or tags on this lead',
  notify_agent: 'Push a personal alert to your phone or browser — stay in the loop',
};

const FORMATTER_OPERATION_LABELS: Record<FormatterOperation, string> = {
  uppercase: 'Uppercase',
  lowercase: 'Lowercase',
  capitalize: 'Capitalize',
  trim: 'Trim whitespace',
  replace: 'Find & replace',
  number_format: 'Format number',
  date_format: 'Format date',
  extract_number: 'Extract number',
  extract_email: 'Extract email',
  extract_phone: 'Extract phone',
};

const DATE_FORMAT_OPTIONS = [
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (e.g. 06/28/2025)' },
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (e.g. 28/06/2025)' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (ISO, e.g. 2025-06-28)' },
  { value: 'Month D, YYYY', label: 'Month D, YYYY (e.g. June 28, 2025)' },
  { value: 'Mon D, YYYY', label: 'Mon D, YYYY (e.g. Jun 28, 2025)' },
  { value: 'relative', label: 'Relative (e.g. 3 days ago)' },
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

function newActionRow(type: WorkflowActionType = 'draft_message'): ActionRowState {
  return {
    id: nextRowId('act'),
    type,
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
    formatterInput: '',
    formatterOperation: 'uppercase',
    formatterFind: '',
    formatterReplace: '',
    formatterFormat: 'MM/DD/YYYY',
    formatterToFixed: '',
    webhookUrl: '',
    webhookBody: '',
    webhookHeaders: '',
    updateField: 'score_label',
    updateValue: '',
    notifyTitle: '',
    notifyBody: '',
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
    const delayDisplay =
      a.type === 'delay' || a.type === 'schedule_message'
        ? minutesToDisplay(a.config.delayMinutes)
        : null;
    return {
      id: nextRowId('act'),
      type: a.type,
      label: a.label,
      note: a.note,
      channel:
        a.type === 'draft_message' || a.type === 'schedule_message' ? a.config.channel : 'sms',
      instruction:
        a.type === 'draft_message' || a.type === 'schedule_message' || a.type === 'run_chippi'
          ? a.config.instruction
          : '',
      delayMinutes:
        a.type === 'schedule_message' || a.type === 'delay'
          ? (delayDisplay?.amount ?? '')
          : '',
      delayUnit: delayDisplay?.unit ?? 'hours',
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
      formatterInput: a.type === 'formatter' ? a.config.input : '',
      formatterOperation: a.type === 'formatter' ? a.config.operation : 'uppercase',
      formatterFind: a.type === 'formatter' ? (a.config.find ?? '') : '',
      formatterReplace: a.type === 'formatter' ? (a.config.replacement ?? '') : '',
      formatterFormat: a.type === 'formatter' ? (a.config.format ?? 'MM/DD/YYYY') : 'MM/DD/YYYY',
      formatterToFixed: a.type === 'formatter' && a.config.toFixed !== undefined ? String(a.config.toFixed) : '',
      webhookUrl: a.type === 'webhook_post' ? a.config.url : '',
      webhookBody: a.type === 'webhook_post' ? (a.config.bodyJson ?? '') : '',
      webhookHeaders: a.type === 'webhook_post' ? (a.config.headersJson ?? '') : '',
      updateField: a.type === 'update_lead' ? a.config.field : 'score_label',
      updateValue: a.type === 'update_lead' ? a.config.value : '',
      notifyTitle: a.type === 'notify_agent' ? a.config.title : '',
      notifyBody: a.type === 'notify_agent' ? (a.config.body ?? '') : '',
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
 * Collapsible "Test trigger" panel shown below the trigger config — like Zapier's
 * step 1 "Find data" that shows what a sample event looks like. Helps the user
 * understand what fields are available for conditions and {{token}} insertions.
 */
function TriggerSampleData({ triggerType }: { triggerType: TriggerType }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const data = TRIGGER_SAMPLE_DATA[triggerType];

  function copyJson() {
    const obj: Record<string, string | number> = {};
    Object.entries(data).forEach(([k, v]) => {
      const key = k.split('.').pop()!;
      obj[key] = v;
    });
    navigator.clipboard.writeText(JSON.stringify(data, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="border-t border-border/30 pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
        aria-expanded={open}
      >
        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/50">
          <CheckIcon size={11} className="text-emerald-600 dark:text-emerald-400" aria-hidden />
        </span>
        <span className="flex-1 text-[12px] font-medium text-foreground">
          {open ? 'Hide' : 'Show'} sample trigger data
        </span>
        <ChevronDown
          size={13}
          className={cn(
            'flex-shrink-0 text-muted-foreground/50 transition-transform',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div className="mt-2 space-y-1.5">
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Sample event fields
              </p>
              <button
                type="button"
                onClick={copyJson}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
              >
                {copied ? (
                  <><CheckIcon size={11} /> Copied</>
                ) : (
                  <><Copy size={11} /> Copy JSON</>
                )}
              </button>
            </div>
            <dl className="space-y-1.5">
              {Object.entries(data).map(([key, val]) => (
                <div key={key} className="flex items-center gap-2 text-[12px]">
                  <dt className="flex-shrink-0 font-mono text-[11px] text-indigo-600 dark:text-indigo-400">
                    {`{{${key}}}`}
                  </dt>
                  <dd className="ml-auto flex-shrink-0 truncate text-muted-foreground">
                    {String(val)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <p className={CAPTION}>
            These are example values — real events will carry actual lead and deal data.
          </p>
        </div>
      )}
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

/** One-line summary of a configured action step — shown in the collapsed card. */
function actionSummary(row: ActionRowState): string {
  const trunc = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n)}…` : s);
  switch (row.type) {
    case 'draft_message':
      return `${row.channel.toUpperCase()} — ${trunc(row.instruction) || 'no instruction'}`;
    case 'schedule_message':
      return `${row.channel.toUpperCase()} in ${row.delayMinutes || '?'} ${row.delayUnit}${row.instruction ? ` — ${trunc(row.instruction, 40)}` : ''}`;
    case 'create_task':
      return row.title ? `Task: ${trunc(row.title)}` : 'No title set';
    case 'run_chippi':
      return trunc(row.instruction) || 'no instruction';
    case 'delay':
      return `Wait ${row.delayMinutes || '?'} ${row.delayUnit}`;
    case 'filter':
      return row.filterField
        ? `${row.filterField} ${row.filterOperator}${row.filterValue ? ` ${row.filterValue}` : ''}`
        : 'No filter set';
    case 'call_integration':
      return [row.toolkit, row.action].filter(Boolean).join(' / ') || 'No app selected';
    case 'formatter':
      return row.formatterInput
        ? `${FORMATTER_OPERATION_LABELS[row.formatterOperation]}: ${row.formatterInput}`
        : 'No input set';
    case 'webhook_post':
      return row.webhookUrl ? `POST ${row.webhookUrl.slice(0, 50)}` : 'No URL set';
    case 'update_lead': {
      const fieldLabels: Record<UpdateLeadField, string> = {
        score_label: 'Set score tier',
        follow_up_in_days: 'Set follow-up in',
        tag_add: 'Add tag',
        tag_remove: 'Remove tag',
      };
      return row.updateValue
        ? `${fieldLabels[row.updateField]}: ${row.updateValue}`
        : `${fieldLabels[row.updateField]} — no value set`;
    }
    case 'notify_agent':
      return row.notifyTitle ? `"${trunc(row.notifyTitle)}"` : 'No title set';
    default:
      return '';
  }
}

/** Per-action-type accent colors: delay = amber, filter = sky, formatter = teal, else violet. */
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
  if (type === 'formatter') {
    return {
      border: 'border-l-teal-400 dark:border-l-teal-500/70',
      badge: 'bg-teal-500',
      icon: 'bg-teal-100 text-teal-600 dark:bg-teal-950/50 dark:text-teal-400',
    };
  }
  if (type === 'webhook_post') {
    return {
      border: 'border-l-orange-400 dark:border-l-orange-500/70',
      badge: 'bg-orange-500',
      icon: 'bg-orange-100 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400',
    };
  }
  if (type === 'update_lead') {
    return {
      border: 'border-l-indigo-400 dark:border-l-indigo-500/70',
      badge: 'bg-indigo-500',
      icon: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400',
    };
  }
  if (type === 'notify_agent') {
    return {
      border: 'border-l-rose-400 dark:border-l-rose-500/70',
      badge: 'bg-rose-500',
      icon: 'bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400',
    };
  }
  return {
    border: 'border-l-violet-400 dark:border-l-violet-500/70',
    badge: 'bg-violet-500',
    icon: 'bg-violet-100 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400',
  };
}

// ── Variable / token picker ──────────────────────────────────────────────────
//
// Zapier's killer feature: click "{}" in any instruction field to insert a
// variable like {{lead.name}} at the cursor. The catalog is grouped by source
// (Lead | Trigger) and filtered by the active trigger type so only relevant
// tokens appear (e.g. {{trigger.message}} only shows for inbound_message).

interface TokenDef {
  label: string;
  token: string;
  hint: string;
}
interface TokenGroup {
  label: string;
  tokens: TokenDef[];
}

const LEAD_TOKEN_GROUP: TokenGroup = {
  label: 'Lead',
  tokens: [
    { label: 'Full name', token: '{{lead.name}}', hint: 'e.g. Jane Smith' },
    { label: 'Email', token: '{{lead.email}}', hint: 'e.g. jane@example.com' },
    { label: 'Phone', token: '{{lead.phone}}', hint: 'e.g. +1 555 123 4567' },
    { label: 'Lead score', token: '{{lead.score}}', hint: 'e.g. 82' },
    { label: 'Source', token: '{{lead.source}}', hint: 'e.g. Zillow' },
    { label: 'Assigned agent', token: '{{lead.assignedAgent}}', hint: 'e.g. Alex Johnson' },
    { label: 'Property interest', token: '{{lead.propertyInterest}}', hint: 'e.g. 3BR in Austin' },
  ],
};

const TRIGGER_TOKEN_GROUPS: Partial<Record<TriggerType, TokenGroup>> = {
  lead_score_threshold: {
    label: 'Trigger',
    tokens: [
      { label: 'Current score', token: '{{trigger.score}}', hint: 'e.g. 85' },
      { label: 'Threshold', token: '{{trigger.threshold}}', hint: 'e.g. 80' },
    ],
  },
  inbound_message: {
    label: 'Trigger',
    tokens: [
      { label: 'Message text', token: '{{trigger.message}}', hint: 'the raw message body' },
      { label: 'Channel', token: '{{trigger.channel}}', hint: 'sms or email' },
    ],
  },
  tour_completed: {
    label: 'Trigger',
    tokens: [
      { label: 'Tour date', token: '{{trigger.tourDate}}', hint: 'e.g. June 28, 2026' },
    ],
  },
  deal_stage_changed: {
    label: 'Trigger',
    tokens: [
      { label: 'New stage', token: '{{trigger.stage}}', hint: 'e.g. Under Contract' },
      { label: 'Previous stage', token: '{{trigger.previousStage}}', hint: 'e.g. Active' },
    ],
  },
  integration_event: {
    label: 'Trigger',
    tokens: [
      { label: 'Event name', token: '{{trigger.event}}', hint: 'e.g. contact.updated' },
      { label: 'App / toolkit', token: '{{trigger.toolkit}}', hint: 'e.g. hubspot' },
    ],
  },
  schedule: {
    label: 'Trigger',
    tokens: [
      { label: 'Run date', token: '{{trigger.date}}', hint: 'e.g. 2026-06-28' },
      { label: 'Run time', token: '{{trigger.time}}', hint: 'e.g. 09:00' },
    ],
  },
  webhook: {
    label: 'Trigger',
    tokens: [{ label: 'Payload JSON', token: '{{trigger.payload}}', hint: 'full JSON body' }],
  },
};

/** Build step-output token groups from the previous action rows. */
function stepOutputGroups(prevSteps: ActionRowState[]): TokenGroup[] {
  return prevSteps
    .map((s, i): TokenGroup | null => {
      const n = i + 1;
      const label = s.label || ACTION_LABELS[s.type] || `Step ${n}`;
      const base: TokenDef[] = [{ label: 'Status', token: `{{step${n}.status}}`, hint: 'ok / failed / skipped' }];
      if (s.type === 'formatter') {
        return {
          label: `Step ${n}: ${label}`,
          tokens: [
            { label: 'Formatted output', token: `{{step${n}.output}}`, hint: 'result of the format operation' },
            ...base,
          ],
        };
      }
      if (s.type === 'run_chippi') {
        return {
          label: `Step ${n}: ${label}`,
          tokens: [
            { label: "Chippi's response", token: `{{step${n}.response}}`, hint: "text Chippi returned" },
            ...base,
          ],
        };
      }
      if (s.type === 'call_integration') {
        return {
          label: `Step ${n}: ${label}`,
          tokens: [
            { label: 'Result (JSON)', token: `{{step${n}.result}}`, hint: 'raw JSON from the integration' },
            ...base,
          ],
        };
      }
      if (s.type === 'create_task') {
        return {
          label: `Step ${n}: ${label}`,
          tokens: [
            { label: 'Task ID', token: `{{step${n}.taskId}}`, hint: 'ID of the created task' },
            ...base,
          ],
        };
      }
      return null;
    })
    .filter((g): g is TokenGroup => g !== null);
}

function TokenPicker({
  triggerType,
  prevSteps = [],
  onInsert,
}: {
  triggerType: TriggerType;
  prevSteps?: ActionRowState[];
  onInsert: (token: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const triggerGroup = TRIGGER_TOKEN_GROUPS[triggerType];
  const groups: TokenGroup[] = [
    LEAD_TOKEN_GROUP,
    ...(triggerGroup ? [triggerGroup] : []),
    ...stepOutputGroups(prevSteps),
  ];

  const q = search.trim().toLowerCase();
  const filtered = q
    ? groups
        .map((g) => ({
          ...g,
          tokens: g.tokens.filter(
            (t) =>
              t.label.toLowerCase().includes(q) ||
              t.token.toLowerCase().includes(q) ||
              t.hint.toLowerCase().includes(q),
          ),
        }))
        .filter((g) => g.tokens.length > 0)
    : groups;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Insert variable"
        title="Insert a variable like {{lead.name}}"
        className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-background px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
      >
        <span className="font-mono">{'{ }'}</span>
        Insert variable
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setOpen(false);
              setSearch('');
            }}
            aria-hidden
          />
          <div className="absolute left-0 top-full z-50 mt-1.5 w-60 rounded-xl border border-border/60 bg-popover shadow-xl">
            <div className="border-b border-border/40 p-2">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search variables…"
                autoFocus
                className="w-full rounded-lg border border-border/40 bg-background px-2.5 py-1.5 text-[12px] outline-none placeholder:text-muted-foreground/40 focus:border-foreground/30"
              />
            </div>
            <div className="max-h-64 overflow-y-auto p-1.5">
              {filtered.length === 0 && (
                <p className="py-4 text-center text-[12px] text-muted-foreground">
                  No variables match.
                </p>
              )}
              {filtered.map((group) => (
                <div key={group.label}>
                  <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                    {group.label}
                  </p>
                  {group.tokens.map((t) => (
                    <button
                      key={t.token}
                      type="button"
                      onClick={() => {
                        onInsert(t.token);
                        setOpen(false);
                        setSearch('');
                      }}
                      className="flex w-full flex-col gap-0.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent"
                    >
                      <span className="text-[12px] font-medium text-foreground">
                        {t.label}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground/70">
                        {t.token}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Zapier-style action type picker shown when clicking "Add step". Renders a
 * 2-column grid of all action types with icon + name + description. Clicking a
 * type calls onSelect and closes.
 */
function AddStepPicker({
  onSelect,
  onClose,
}: {
  onSelect: (type: WorkflowActionType) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const q = query.toLowerCase().trim();
  const filtered = q
    ? ACTION_ORDER.filter(
        (t) =>
          ACTION_LABELS[t].toLowerCase().includes(q) ||
          ACTION_DESCRIPTIONS[t].toLowerCase().includes(q),
      )
    : ACTION_ORDER;

  return (
    <div className="rounded-xl border border-border/60 bg-card shadow-md">
      <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
        <p className="text-[13px] font-semibold text-foreground">Choose an action</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
        >
          <X size={13} aria-hidden />
        </button>
      </div>
      <div className="border-b border-border/40 px-3 py-2">
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search actions…"
          className="h-8 text-[12.5px]"
          aria-label="Search actions"
        />
      </div>
      <div className="grid grid-cols-1 gap-1.5 p-3 sm:grid-cols-2">
        {filtered.length === 0 ? (
          <p className="col-span-2 py-4 text-center text-[12px] text-muted-foreground">
            No actions match "{query}"
          </p>
        ) : (
          filtered.map((type) => {
            const Icon = ACTION_ICONS[type];
            const cl = actionAccent(type);
            return (
              <button
                key={type}
                type="button"
                onClick={() => onSelect(type)}
                className="flex items-start gap-3 rounded-lg border border-transparent p-3 text-left transition-colors hover:border-border/60 hover:bg-accent"
              >
                <span className={cn('mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg', cl.icon)}>
                  <Icon size={15} aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-[12.5px] font-semibold text-foreground">{ACTION_LABELS[type]}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                    {ACTION_DESCRIPTIONS[type]}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

/**
 * Private notes field for an action step (Zapier-style "Note on this step").
 * Collapsed by default; expands inline below the config body when clicked.
 */
function StepNotes({
  note,
  onChange,
  rowId,
}: {
  note: string;
  onChange: (note: string) => void;
  rowId: string;
}) {
  const [open, setOpen] = useState(!!note);
  return (
    <div className="border-t border-border/30 pt-2">
      {open ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label htmlFor={`step-note-${rowId}`} className="text-[11px] text-muted-foreground/70">
              Step note (private)
            </Label>
            {!note && (
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              >
                Hide
              </button>
            )}
          </div>
          <Textarea
            id={`step-note-${rowId}`}
            value={note}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Add a private note — why this step exists, edge cases to watch, etc."
            maxLength={500}
            rows={2}
            className="text-[12px]"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/50 transition-colors hover:text-muted-foreground"
        >
          <Plus size={11} aria-hidden />
          Add note
        </button>
      )}
    </div>
  );
}

/**
 * One action step card. The action type selector lives in the card header so
 * the realtor sees at a glance what each step does — identical to how Zapier
 * shows each action as its own titled card.
 *
 * Collapse/expand: a chevron button in the header toggles the body. When
 * collapsed the card shows a one-line summary of the configured values.
 */
function ActionZapCard({
  step,
  row,
  canRemove,
  incomplete,
  collapsed,
  showDragHandle,
  triggerType,
  prevSteps = [],
  onChange,
  onRemove,
  onDuplicate,
  onToggleCollapse,
  connectedApps,
}: {
  step: number;
  row: ActionRowState;
  canRemove: boolean;
  incomplete?: boolean;
  collapsed?: boolean;
  showDragHandle?: boolean;
  triggerType: TriggerType;
  prevSteps?: ActionRowState[];
  onChange: (next: Partial<ActionRowState>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onToggleCollapse: () => void;
  connectedApps: ConnectedAppsState;
}) {
  const Icon = ACTION_ICONS[row.type] ?? Sparkles;
  const cl = actionAccent(row.type);
  const summary = collapsed ? actionSummary(row) : null;
  return (
    <div className={cn('overflow-hidden rounded-xl border border-border/60 border-l-4 bg-card', cl.border)}>
      <div className={cn('flex items-center gap-3 bg-muted/20 px-4 py-3', !collapsed && 'border-b border-border/40')}>
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
        <div className="flex-1 min-w-0">
          {collapsed ? (
            /* Collapsed: show step label/type + summary as read-only text */
            <button
              type="button"
              onClick={onToggleCollapse}
              className="w-full text-left"
              aria-label="Expand step"
            >
              <p className="text-sm font-semibold text-foreground leading-tight">
                {row.label || ACTION_LABELS[row.type]}
              </p>
              {summary && (
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground/70">{summary}</p>
              )}
            </button>
          ) : (
            <div className="space-y-0.5">
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
          )}
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
        {/* Collapse / expand toggle */}
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand step' : 'Collapse step'}
          title={collapsed ? 'Expand' : 'Collapse'}
          className="flex-shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
        >
          <ChevronDown
            size={14}
            aria-hidden
            className={cn('transition-transform', collapsed && '-rotate-90')}
          />
        </button>
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
      {!collapsed && (
        <div className="px-4 py-4 space-y-3">
          <ActionConfig row={row} onChange={onChange} connectedApps={connectedApps} triggerType={triggerType} prevSteps={prevSteps} />
          <div className="border-t border-border/30 pt-2 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] text-muted-foreground">On error:</span>
              <div className="flex overflow-hidden rounded-md border border-border/50">
                {(['stop', 'skip'] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => onChange({ onError: opt === 'stop' ? undefined : opt })}
                    aria-pressed={opt === 'skip' ? row.onError === 'skip' : row.onError !== 'skip'}
                    className={cn(
                      'px-2.5 py-1 text-[11px] font-medium capitalize transition-colors',
                      (opt === 'skip' ? row.onError === 'skip' : row.onError !== 'skip')
                        ? 'bg-foreground text-background'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {opt === 'stop' ? 'Stop workflow' : 'Skip & continue'}
                  </button>
                ))}
              </div>
            </div>
            <StepNotes note={row.note ?? ''} onChange={(n) => onChange({ note: n || undefined })} rowId={row.id} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── The builder ──────────────────────────────────────────────────────────────

export function WorkflowBuilder({
  initial,
  initialEnabled,
  saving,
  workflowId,
  lastRunAt,
  lastRunStatus,
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
  /** Last execution time / status — shown in the builder footer for existing workflows. */
  lastRunAt?: string | null;
  lastRunStatus?: 'ok' | 'error' | 'skipped' | null;
  /** Receives the validated definition + name + description + enabled; the manager owns the fetch. */
  onSave: (payload: { name: string; description?: string; definition: ReturnType<typeof buildDefinition>; enabled: boolean }) => void;
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
  /** Set of action row ids whose cards are collapsed (body hidden, summary shown). */
  const [collapsedSteps, setCollapsedSteps] = useState<Set<string>>(() => new Set());
  /** Whether the "Add step" type picker is open at the end of the list. */
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  /** Index of the insert-between-steps picker (null = closed). */
  const [insertPickerAt, setInsertPickerAt] = useState<number | null>(null);

  function toggleCollapse(id: string) {
    setCollapsedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
    setState((s) => {
      const updated = { ...s.trigger, ...next };
      // Auto-suggest a name when the trigger TYPE changes and the name is still
      // blank — same pattern Zapier uses ("New Gmail > Do this").
      let name = s.name;
      if (next.type && next.type !== s.trigger.type && !s.name.trim()) {
        name = TRIGGER_LABELS[next.type] ?? '';
      }
      return { ...s, trigger: updated, name };
    });
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
    if (row.type === 'formatter') return !row.formatterInput.trim();
    if (row.type === 'webhook_post') return !row.webhookUrl.trim();
    if (row.type === 'update_lead') return !row.updateValue.trim();
    if (row.type === 'notify_agent') return !row.notifyTitle.trim();
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

    const description = state.description?.trim() || undefined;
    onSave({ name, description, definition, enabled });
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
        <div className="w-full basis-full">
          <Textarea
            value={state.description ?? ''}
            onChange={(e) => patch({ description: e.target.value || undefined })}
            placeholder="Add a description… (optional — shown on the workflow list)"
            rows={1}
            maxLength={300}
            className="resize-none text-[12.5px] text-muted-foreground placeholder:text-muted-foreground/50 focus:text-foreground"
          />
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
          <TriggerSampleData triggerType={state.trigger.type} />
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
                insertPickerAt === i ? (
                  <div className="py-1">
                    <AddStepPicker
                      onSelect={(type) => {
                        const next = [...state.actions];
                        next.splice(i, 0, newActionRow(type));
                        patch({ actions: next });
                        setInsertPickerAt(null);
                      }}
                      onClose={() => setInsertPickerAt(null)}
                    />
                  </div>
                ) : (
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
                          onClick={() => setInsertPickerAt(i)}
                          className="flex h-5 w-5 items-center justify-center rounded-full border border-border/60 bg-background text-muted-foreground/50 opacity-0 transition-all hover:border-orange-400 hover:bg-orange-50 hover:text-orange-500 hover:opacity-100 group-hover/insert:opacity-100 dark:hover:bg-orange-950/30"
                        >
                          <Plus size={10} aria-hidden />
                        </button>
                        <div className="h-2 w-px bg-border/50" />
                      </>
                    )}
                  </div>
                )
              )}
              <ActionZapCard
                step={3 + i}
                row={row}
                canRemove={state.actions.length > 1}
                incomplete={actionIncomplete(row)}
                collapsed={collapsedSteps.has(row.id)}
                showDragHandle={state.actions.length > 1}
                triggerType={state.trigger.type}
                prevSteps={state.actions.slice(0, i)}
                onChange={(next) => updateAction(row.id, next)}
                onRemove={() =>
                  patch({ actions: state.actions.filter((a) => a.id !== row.id) })
                }
                onDuplicate={() => {
                  const next = [...state.actions];
                  next.splice(i + 1, 0, { ...row, id: nextRowId('act') });
                  patch({ actions: next });
                }}
                onToggleCollapse={() => toggleCollapse(row.id)}
                connectedApps={connectedApps}
              />
            </div>
          ))}

          {state.actions.length < MAX_ACTIONS && (
            <div className="pt-1">
              <div className="flex justify-center">
                <div className="h-4 w-px bg-border/50" />
              </div>
              {addPickerOpen ? (
                <AddStepPicker
                  onSelect={(type) => {
                    patch({ actions: [...state.actions, newActionRow(type)] });
                    setAddPickerOpen(false);
                  }}
                  onClose={() => setAddPickerOpen(false)}
                />
              ) : (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => setAddPickerOpen(true)}
                    className="mt-1 flex items-center gap-2 rounded-full border-2 border-dashed border-orange-300/70 px-5 py-2.5 text-sm font-semibold text-orange-500 transition-all hover:border-orange-400 hover:bg-orange-50/60 hover:shadow-sm active:scale-[0.98] dark:border-orange-500/40 dark:text-orange-400 dark:hover:bg-orange-950/30"
                  >
                    <Plus size={15} aria-hidden />
                    Add step
                  </button>
                </div>
              )}
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

        {lastRunAt && (
          <span
            className={cn(
              'hidden sm:flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium',
              lastRunStatus === 'error'
                ? 'border-rose-300/60 bg-rose-50 text-rose-600 dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-rose-400'
                : lastRunStatus === 'ok'
                  ? 'border-emerald-300/60 bg-emerald-50 text-emerald-700 dark:border-emerald-700/40 dark:bg-emerald-950/30 dark:text-emerald-400'
                  : 'border-border/60 bg-muted/30 text-muted-foreground',
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full flex-shrink-0',
                lastRunStatus === 'error' ? 'bg-rose-500' : lastRunStatus === 'ok' ? 'bg-emerald-500' : 'bg-muted-foreground/40',
              )}
              aria-hidden
            />
            {lastRunStatus === 'error' ? 'Last run failed' : 'Last run'} · {timeAgo(lastRunAt)}
          </span>
        )}

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

function FormatterActionConfig({
  row,
  onChange,
  triggerType = 'lead_created',
  prevSteps = [],
}: {
  row: ActionRowState;
  onChange: (next: Partial<ActionRowState>) => void;
  triggerType?: TriggerType;
  prevSteps?: ActionRowState[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const selRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });

  function saveInputSel() {
    const el = inputRef.current;
    if (el) selRef.current = { start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 };
  }

  function insertInputToken(token: string) {
    const { start, end } = selRef.current;
    const cur = row.formatterInput;
    const next = cur.slice(0, start) + token + cur.slice(end);
    onChange({ formatterInput: next });
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        const pos = start + token.length;
        el.setSelectionRange(pos, pos);
        selRef.current = { start: pos, end: pos };
      }
    });
  }

  const op = row.formatterOperation;
  const needsReplace = op === 'replace';
  const needsFormat = op === 'date_format';
  const needsToFixed = op === 'number_format';

  return (
    <div className="space-y-2.5">
      <p className={CAPTION}>
        Transform a value and make it available as <code className="rounded bg-muted px-1 py-px text-[10px]">{'{{step#.output}}'}</code> for the next step.
      </p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`fmt-input-${row.id}`} className="text-[12px] text-muted-foreground">
            Input (field path or literal)
          </Label>
          <TokenPicker triggerType={triggerType} prevSteps={prevSteps} onInsert={insertInputToken} />
        </div>
        <Input
          ref={inputRef}
          id={`fmt-input-${row.id}`}
          value={row.formatterInput}
          onChange={(e) => onChange({ formatterInput: e.target.value })}
          onSelect={saveInputSel}
          onKeyUp={saveInputSel}
          onClick={saveInputSel}
          placeholder="lead.name  or  Austin TX  or  {{step1.output}}"
          className="h-8"
        />
      </div>
      <FieldRow label="Operation" htmlFor={`fmt-op-${row.id}`}>
        <MiniSelect
          id={`fmt-op-${row.id}`}
          value={op}
          onValueChange={(v) => onChange({ formatterOperation: v as FormatterOperation })}
          className="w-[14rem]"
          options={FORMATTER_OPERATIONS.map((o) => ({ value: o, label: FORMATTER_OPERATION_LABELS[o] }))}
        />
      </FieldRow>
      {needsReplace && (
        <>
          <FieldRow label="Find" htmlFor={`fmt-find-${row.id}`}>
            <Input
              id={`fmt-find-${row.id}`}
              value={row.formatterFind}
              onChange={(e) => onChange({ formatterFind: e.target.value })}
              placeholder="Austin"
              className="h-8"
            />
          </FieldRow>
          <FieldRow label="Replace with" htmlFor={`fmt-repl-${row.id}`}>
            <Input
              id={`fmt-repl-${row.id}`}
              value={row.formatterReplace}
              onChange={(e) => onChange({ formatterReplace: e.target.value })}
              placeholder="(leave blank to delete)"
              className="h-8"
            />
          </FieldRow>
        </>
      )}
      {needsFormat && (
        <FieldRow label="Date format" htmlFor={`fmt-fmt-${row.id}`}>
          <MiniSelect
            id={`fmt-fmt-${row.id}`}
            value={row.formatterFormat || 'MM/DD/YYYY'}
            onValueChange={(v) => onChange({ formatterFormat: v })}
            className="w-[16rem]"
            options={DATE_FORMAT_OPTIONS}
          />
        </FieldRow>
      )}
      {needsToFixed && (
        <FieldRow label="Decimal places (optional)" htmlFor={`fmt-fixed-${row.id}`}>
          <Input
            id={`fmt-fixed-${row.id}`}
            type="number"
            inputMode="numeric"
            min={0}
            max={20}
            value={row.formatterToFixed}
            onChange={(e) => onChange({ formatterToFixed: e.target.value })}
            placeholder="2"
            className="h-8 w-24"
          />
        </FieldRow>
      )}
    </div>
  );
}

function FilterActionConfig({
  row,
  onChange,
  triggerType,
}: {
  row: ActionRowState;
  onChange: (next: Partial<ActionRowState>) => void;
  triggerType: TriggerType;
}) {
  const attributes = useMemo(() => attributesForTrigger(triggerType), [triggerType]);
  const activeAttr = findAttributeByField(row.filterField);
  const [forcedCustom, setForcedCustom] = useState(false);
  const isCustom = forcedCustom || activeAttr === null;

  const needsValue = !VALUELESS_OPERATORS.has(row.filterOperator);

  function selectAttribute(attr: ConditionAttribute) {
    setForcedCustom(false);
    const operatorValid = attr.operators.includes(row.filterOperator);
    const nextOperator = operatorValid ? row.filterOperator : attr.operators[0];
    const keepValue =
      attr.valueType === 'text' ||
      (attr.valueType === 'enum' && attr.options?.some((o) => o.value === row.filterValue)) ||
      (attr.valueType === 'number' && /^-?\d+(\.\d+)?$/.test(row.filterValue.trim()));
    onChange({
      filterField: attr.field,
      filterOperator: nextOperator,
      ...(keepValue ? {} : { filterValue: '' }),
    });
  }

  const attributeSelectValue = isCustom ? CUSTOM_ATTRIBUTE : (activeAttr?.key ?? CUSTOM_ATTRIBUTE);
  const operatorOptions = isCustom ? OPERATORS : (activeAttr?.operators ?? OPERATORS);

  return (
    <div className="space-y-2.5">
      <p className={CAPTION}>
        Only continue if this condition is true — otherwise the automation stops here.
      </p>
      <div className="flex flex-wrap items-center gap-2">
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
          className="w-[11rem]"
          options={[
            ...attributes.map((a) => ({ value: a.key, label: a.label })),
            { value: CUSTOM_ATTRIBUTE, label: 'Custom field…' },
          ]}
        />

        {isCustom && (
          <Input
            aria-label="Field"
            value={row.filterField}
            onChange={(e) => onChange({ filterField: e.target.value })}
            placeholder="lead.score"
            className="h-8 flex-1 min-w-[8rem]"
          />
        )}

        <MiniSelect
          aria-label="Operator"
          value={row.filterOperator}
          onValueChange={(v) => onChange({ filterOperator: v as Operator })}
          className="w-[9.5rem]"
          options={operatorOptions.map((op) => ({ value: op, label: OPERATOR_LABELS[op] }))}
        />

        {needsValue &&
          (!isCustom && activeAttr?.valueType === 'enum' && activeAttr.options ? (
            <MiniSelect
              aria-label="Value"
              value={row.filterValue}
              onValueChange={(v) => onChange({ filterValue: v })}
              className="flex-1 min-w-[6rem]"
              options={activeAttr.options}
            />
          ) : (
            <Input
              aria-label="Value"
              type={!isCustom && activeAttr?.valueType === 'number' ? 'number' : 'text'}
              inputMode={!isCustom && activeAttr?.valueType === 'number' ? 'numeric' : undefined}
              value={row.filterValue}
              onChange={(e) => onChange({ filterValue: e.target.value })}
              placeholder="80"
              className="h-8 flex-1 min-w-[6rem]"
            />
          ))}
      </div>
    </div>
  );
}

function WebhookPostActionConfig({
  row,
  onChange,
  triggerType = 'lead_created',
  prevSteps = [],
}: {
  row: ActionRowState;
  onChange: (next: Partial<ActionRowState>) => void;
  triggerType?: TriggerType;
  prevSteps?: ActionRowState[];
}) {
  const urlRef = useRef<HTMLInputElement>(null);
  const urlSelRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const bodySelRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });

  function saveUrlSel() {
    const el = urlRef.current;
    if (el) urlSelRef.current = { start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 };
  }
  function insertUrlToken(token: string) {
    const { start, end } = urlSelRef.current;
    const next = row.webhookUrl.slice(0, start) + token + row.webhookUrl.slice(end);
    onChange({ webhookUrl: next });
    requestAnimationFrame(() => {
      const el = urlRef.current;
      if (el) { el.focus(); const p = start + token.length; el.setSelectionRange(p, p); urlSelRef.current = { start: p, end: p }; }
    });
  }
  function saveBodySel() {
    const el = bodyRef.current;
    if (el) bodySelRef.current = { start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 };
  }
  function insertBodyToken(token: string) {
    const { start, end } = bodySelRef.current;
    const next = row.webhookBody.slice(0, start) + token + row.webhookBody.slice(end);
    onChange({ webhookBody: next });
    requestAnimationFrame(() => {
      const el = bodyRef.current;
      if (el) { el.focus(); const p = start + token.length; el.setSelectionRange(p, p); bodySelRef.current = { start: p, end: p }; }
    });
  }

  return (
    <div className="space-y-3">
      <p className={CAPTION}>
        POST JSON to any HTTPS URL. Use <code className="rounded bg-muted px-1 py-px text-[10px]">{'{{lead.name}}'}</code> tokens in the URL or body.
      </p>

      {/* URL */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`wh-url-${row.id}`} className="text-[12px] text-muted-foreground">
            URL <span className="text-rose-500">*</span>
          </Label>
          <TokenPicker triggerType={triggerType} prevSteps={prevSteps} onInsert={insertUrlToken} />
        </div>
        <Input
          ref={urlRef}
          id={`wh-url-${row.id}`}
          value={row.webhookUrl}
          onChange={(e) => onChange({ webhookUrl: e.target.value })}
          onSelect={saveUrlSel}
          onKeyUp={saveUrlSel}
          onClick={saveUrlSel}
          placeholder="https://hooks.example.com/lead-created"
          className="h-8 font-mono text-[12px]"
          type="url"
        />
        {row.webhookUrl && !row.webhookUrl.startsWith('https://') && (
          <p className="text-[11px] text-rose-500">URL must use HTTPS.</p>
        )}
      </div>

      {/* Body */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`wh-body-${row.id}`} className="text-[12px] text-muted-foreground">
            Body (JSON, optional)
          </Label>
          <TokenPicker triggerType={triggerType} prevSteps={prevSteps} onInsert={insertBodyToken} />
        </div>
        <Textarea
          ref={bodyRef}
          id={`wh-body-${row.id}`}
          value={row.webhookBody}
          onChange={(e) => onChange({ webhookBody: e.target.value })}
          onSelect={saveBodySel}
          onKeyUp={saveBodySel}
          onClick={saveBodySel}
          placeholder={'{\n  "lead": "{{lead.name}}",\n  "score": "{{lead.score}}"\n}'}
          rows={4}
          className="font-mono text-[12px]"
        />
      </div>

      {/* Headers — advanced */}
      <details className="group/adv">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground">
          <Plus size={12} aria-hidden className="transition-transform group-open/adv:rotate-45" />
          Custom headers (optional)
        </summary>
        <div className="mt-2 space-y-1.5">
          <Label htmlFor={`wh-headers-${row.id}`} className="text-[12px] text-muted-foreground">
            Headers (JSON object)
          </Label>
          <Textarea
            id={`wh-headers-${row.id}`}
            value={row.webhookHeaders}
            onChange={(e) => onChange({ webhookHeaders: e.target.value })}
            placeholder={'{ "Authorization": "Bearer YOUR_TOKEN" }'}
            rows={2}
            className="font-mono text-[12px]"
          />
        </div>
      </details>
    </div>
  );
}

const UPDATE_LEAD_FIELD_OPTIONS: { value: UpdateLeadField; label: string; hint: string }[] = [
  { value: 'score_label', label: 'Set score tier', hint: 'hot, warm, or cold' },
  { value: 'follow_up_in_days', label: 'Set follow-up in N days', hint: 'e.g. 3 (from now)' },
  { value: 'tag_add', label: 'Add tag', hint: 'e.g. toured, high-intent' },
  { value: 'tag_remove', label: 'Remove tag', hint: 'remove a tag from the lead' },
];

const SCORE_LABEL_OPTIONS = [
  { value: 'hot', label: '🔥 Hot' },
  { value: 'warm', label: '🌤 Warm' },
  { value: 'cold', label: '🧊 Cold' },
];

function UpdateLeadActionConfig({
  row,
  onChange,
}: {
  row: ActionRowState;
  onChange: (next: Partial<ActionRowState>) => void;
}) {
  const fieldOpt = UPDATE_LEAD_FIELD_OPTIONS.find((o) => o.value === row.updateField);
  return (
    <div className="space-y-3">
      <p className={CAPTION}>Write a field back to this lead's contact record in the CRM.</p>
      <FieldRow label="Field to update" htmlFor={`act-uf-${row.id}`}>
        <Select
          value={row.updateField}
          onValueChange={(v) => onChange({ updateField: v as UpdateLeadField, updateValue: '' })}
        >
          <SelectTrigger id={`act-uf-${row.id}`} className="h-8 text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {UPDATE_LEAD_FIELD_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-[12px]">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>

      {row.updateField === 'score_label' ? (
        <FieldRow label="Score tier" htmlFor={`act-uv-sl-${row.id}`}>
          <Select
            value={row.updateValue || 'hot'}
            onValueChange={(v) => onChange({ updateValue: v })}
          >
            <SelectTrigger id={`act-uv-sl-${row.id}`} className="h-8 text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCORE_LABEL_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-[12px]">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor={`act-uv-${row.id}`} className="text-[12px] text-muted-foreground">
            Value
            {fieldOpt && <span className="ml-1 text-muted-foreground/60">({fieldOpt.hint})</span>}
          </Label>
          <Input
            id={`act-uv-${row.id}`}
            value={row.updateValue}
            onChange={(e) => onChange({ updateValue: e.target.value })}
            placeholder={
              row.updateField === 'follow_up_in_days' ? '3' :
              row.updateField === 'tag_add' ? 'toured' :
              'tag-name'
            }
            className="h-8"
          />
        </div>
      )}
    </div>
  );
}

function NotifyAgentActionConfig({
  row,
  onChange,
  triggerType,
  prevSteps = [],
}: {
  row: ActionRowState;
  onChange: (next: Partial<ActionRowState>) => void;
  triggerType: TriggerType;
  prevSteps?: ActionRowState[];
}) {
  function insertTitle(token: string) {
    onChange({ notifyTitle: (row.notifyTitle + token) });
  }
  function insertBody(token: string) {
    onChange({ notifyBody: (row.notifyBody + token) });
  }
  return (
    <div className="space-y-3">
      <p className={CAPTION}>{'Send a push notification to your phone or browser. {{tokens}} are replaced with live lead data.'}</p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor={`act-nt-${row.id}`} className="text-[12px] text-muted-foreground">
            Notification title <span className="text-red-500">*</span>
          </Label>
          <TokenPicker triggerType={triggerType} prevSteps={prevSteps} onInsert={insertTitle} />
        </div>
        <Input
          id={`act-nt-${row.id}`}
          value={row.notifyTitle}
          onChange={(e) => onChange({ notifyTitle: e.target.value })}
          placeholder={`Hot lead: {{lead.name}}`}
          maxLength={200}
          className="h-8"
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor={`act-nb-${row.id}`} className="text-[12px] text-muted-foreground">
            Body (optional)
          </Label>
          <TokenPicker triggerType={triggerType} prevSteps={prevSteps} onInsert={insertBody} />
        </div>
        <Textarea
          id={`act-nb-${row.id}`}
          value={row.notifyBody}
          onChange={(e) => onChange({ notifyBody: e.target.value })}
          placeholder={`Score hit {{lead.score}} — tap to review their profile.`}
          maxLength={500}
          rows={2}
          className="text-[12px]"
        />
      </div>
    </div>
  );
}

function ActionConfig({
  row,
  onChange,
  connectedApps,
  triggerType,
  prevSteps = [],
}: {
  row: ActionRowState;
  onChange: (next: Partial<ActionRowState>) => void;
  connectedApps: ConnectedAppsState;
  triggerType: TriggerType;
  prevSteps?: ActionRowState[];
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
        <InstructionField row={row} onChange={onChange} triggerType={triggerType} prevSteps={prevSteps} />
        {row.type === 'schedule_message' && (
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-[12px] text-muted-foreground">Send after</Label>
            <Input
              id={`act-delay-${row.id}`}
              type="number"
              inputMode="numeric"
              min={0}
              value={row.delayMinutes}
              onChange={(e) => onChange({ delayMinutes: e.target.value })}
              placeholder="2"
              className="h-8 w-20"
            />
            <MiniSelect
              value={row.delayUnit ?? 'hours'}
              onValueChange={(v) => onChange({ delayUnit: v as 'minutes' | 'hours' | 'days' })}
              options={[
                { value: 'minutes', label: 'minutes' },
                { value: 'hours', label: 'hours' },
                { value: 'days', label: 'days' },
              ]}
            />
          </div>
        )}
      </div>
    );
  }

  if (row.type === 'run_chippi') {
    return <InstructionField row={row} onChange={onChange} triggerType={triggerType} prevSteps={prevSteps} />;
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
    return <FilterActionConfig row={row} onChange={onChange} triggerType={triggerType} />;
  }

  if (row.type === 'formatter') {
    return <FormatterActionConfig row={row} onChange={onChange} triggerType={triggerType} prevSteps={prevSteps} />;
  }

  if (row.type === 'webhook_post') {
    return <WebhookPostActionConfig row={row} onChange={onChange} triggerType={triggerType} prevSteps={prevSteps} />;
  }

  if (row.type === 'update_lead') {
    return <UpdateLeadActionConfig row={row} onChange={onChange} />;
  }

  if (row.type === 'notify_agent') {
    return <NotifyAgentActionConfig row={row} onChange={onChange} triggerType={triggerType} prevSteps={prevSteps} />;
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

const INSTRUCTION_MAX = 4000;

function InstructionField({
  row,
  onChange,
  triggerType,
  prevSteps = [],
}: {
  row: ActionRowState;
  onChange: (next: Partial<ActionRowState>) => void;
  triggerType: TriggerType;
  prevSteps?: ActionRowState[];
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Track the last cursor/selection position so token insertion lands at cursor.
  const selectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });

  function saveSelection() {
    const el = textareaRef.current;
    if (el) selectionRef.current = { start: el.selectionStart, end: el.selectionEnd };
  }

  function insertToken(token: string) {
    const { start, end } = selectionRef.current;
    const current = row.instruction;
    const next = current.slice(0, start) + token + current.slice(end);
    onChange({ instruction: next });
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        const pos = start + token.length;
        el.setSelectionRange(pos, pos);
        selectionRef.current = { start: pos, end: pos };
      }
    });
  }

  const len = row.instruction.length;
  const nearLimit = len > INSTRUCTION_MAX * 0.85;
  const hasTokens = /{{[^}]+}}/.test(row.instruction);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={`act-instr-${row.id}`} className="text-[12px] text-muted-foreground">
          Instruction
        </Label>
        <div className="flex items-center gap-2">
          {nearLimit && (
            <span className={cn('text-[11px] tabular-nums', len >= INSTRUCTION_MAX ? 'font-semibold text-destructive' : 'text-muted-foreground/60')}>
              {len}/{INSTRUCTION_MAX}
            </span>
          )}
          <TokenPicker triggerType={triggerType} prevSteps={prevSteps} onInsert={insertToken} />
        </div>
      </div>
      <Textarea
        ref={textareaRef}
        id={`act-instr-${row.id}`}
        value={row.instruction}
        onChange={(e) => onChange({ instruction: e.target.value })}
        onSelect={saveSelection}
        onKeyUp={saveSelection}
        onClick={saveSelection}
        placeholder="Draft a warm, personal intro and reference {{lead.name}}'s interest."
        maxLength={INSTRUCTION_MAX}
        rows={3}
      />
      {hasTokens && (
        <div className="rounded-md border border-indigo-200/60 bg-indigo-50/40 px-2.5 py-2 dark:border-indigo-700/30 dark:bg-indigo-950/20">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-500/70 dark:text-indigo-400/60">
            with variables filled in
          </p>
          <p className="text-[12.5px] leading-relaxed text-foreground/80">
            {row.instruction.split(/({{[^}]+}})/).map((part, i) =>
              /^{{[^}]+}}$/.test(part) ? (
                <span
                  key={i}
                  className="mx-[1px] inline-flex items-center rounded bg-indigo-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300"
                >
                  {part}
                </span>
              ) : (
                part
              ),
            )}
          </p>
        </div>
      )}
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
