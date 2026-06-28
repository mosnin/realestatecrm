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
import { Loader2, Plus, X, Sparkles } from 'lucide-react';
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
  type Operator,
  type TriggerType,
  type WorkflowActionType,
  type WorkflowAutonomy,
} from '@/lib/workflows/schema';
import {
  buildDefinition,
  type ActionRowState,
  type ConditionRowState,
  type WorkflowFormState,
} from './build-definition';
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

  return (
    <div className="rounded-xl border border-border/60 bg-muted/15 px-4 py-3.5">
      <div className="mb-1.5 flex items-center gap-1.5">
        <Sparkles size={12} className="text-muted-foreground" aria-hidden />
        <p className={SECTION_LABEL}>In plain English</p>
      </div>
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
  /** Validation message surfaced from parseWorkflowDefinition (client guard). */
  const [issues, setIssues] = useState<string[]>([]);
  const [nameError, setNameError] = useState('');
  /** Connected-app trigger options for the integration_event picker. */
  const triggerOptions = useTriggerOptions();

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

      {/* Autonomy ─────────────────────────────────────────────────────────── */}
      <section className="space-y-1.5">
        <Label htmlFor="wf-autonomy" className="text-[12.5px] font-medium text-foreground">
          Autonomy
        </Label>
        <Select
          value={state.autonomy}
          onValueChange={(v) => patch({ autonomy: v as WorkflowAutonomy })}
        >
          <SelectTrigger id="wf-autonomy" className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AUTONOMY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p
          className={cn(
            CAPTION,
            state.autonomy === 'auto' && 'text-amber-600 dark:text-amber-500',
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
      (attr.valueType === 'number' && /^-?\d*\.?\d*$/.test(row.value));
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

  // call_integration
  return (
    <div className="space-y-2.5">
      <FieldRow label="Toolkit" htmlFor={`act-tk-${row.id}`}>
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
      <div className="space-y-1.5">
        <Label htmlFor={`act-params-${row.id}`} className="text-[12px] text-muted-foreground">
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
