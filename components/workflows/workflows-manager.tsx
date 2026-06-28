'use client';

/**
 * WorkflowsManager — the realtor's standing automations: When → If → Then.
 *
 * Reads and writes through /api/workflows. Each row is a workflow: its name, a
 * one-line human summary, an enabled toggle (PATCH enabled, optimistic), a
 * last-run status pill + relative time, and row actions (Edit, Test, Delete).
 *
 * "New workflow" opens the builder blank; the template picker opens it
 * pre-filled. Test fires POST /api/workflows/[id]/test-run and shows each
 * step's outcome inline — so the realtor SEES the draft get created before
 * trusting a live trigger. Every mutating action mirrors routines-manager:
 * optimistic-with-revert for the toggle, busy/error states everywhere,
 * delete-with-confirm.
 */

import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { STAGGER_CONTAINER, STAGGER_ITEM } from '@/lib/motion';
import {
  Loader2,
  Plus,
  Workflow as WorkflowIcon,
  Play,
  Pencil,
  Trash2,
  AlertTriangle,
  Check,
  X,
  Sparkles,
  History,
  ChevronRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { CAPTION, SECTION_LABEL } from '@/lib/typography';
import { timeAgo } from '@/lib/formatting';
import type {
  ConditionGroup,
  Operator,
  WorkflowAction,
  WorkflowAutonomy,
  WorkflowDefinition,
  WorkflowGraph,
  WorkflowTrigger,
} from '@/lib/workflows/schema';
import { WorkflowBuilder } from './workflow-builder';
import type { WorkflowFormState } from './build-definition';
import { summarizeWorkflow } from './summary';
import { WORKFLOW_TEMPLATES, cloneTemplateState } from './templates';
import { WorkflowCanvasLazy } from './workflow-canvas-lazy';
import { highlightsFromSteps } from './run-highlights';
import { useHashHighlight } from '@/hooks/use-hash-highlight';

// ── The record shape the API returns (subset we render) ──────────────────────

interface WorkflowRecord {
  id: string;
  name: string;
  enabled: boolean;
  trigger: WorkflowTrigger;
  conditions: ConditionGroup;
  actions: WorkflowAction[];
  autonomy: WorkflowAutonomy;
  /** Advanced-mode branching graph (null/absent for linear workflows). */
  graph?: WorkflowGraph | null;
  lastRunAt: string | null;
  lastRunStatus: 'ok' | 'error' | 'skipped' | null;
  createdAt: string;
}

interface TestStep {
  stepIndex: number;
  kind: string;
  actionType: string | null;
  status: string;
  // jsonb from the run ledger — an object ({ passed, branch, nodeId } for a
  // condition, an action's result shape, …), NOT a string. Rendered via the
  // safe detailLine() helper, never inlined as a React child.
  detail: unknown;
}

interface TestResult {
  runId: string;
  status: string;
  steps: TestStep[];
}

// ── Run history (audit trail) ────────────────────────────────────────────────

interface RunStep {
  id: string;
  stepIndex: number;
  kind: string;
  actionType: string | null;
  status: string;
  detail: unknown;
}

interface WorkflowRun {
  id: string;
  status: 'running' | 'completed' | 'failed' | 'skipped';
  summary: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  steps: RunStep[];
}

const API_BASE = '/api/workflows';

// ── Map a stored record back to editable form state ──────────────────────────

let editSeq = 0;
function editRowId(prefix: string): string {
  editSeq += 1;
  return `${prefix}-edit-${editSeq}`;
}

/**
 * Convert a stored (validated) record into the loose form state the builder
 * edits. Numbers become strings (inputs are strings), optional fields fall back
 * to '', and value-less condition operators get an empty value field. The
 * inverse of buildDefinition for the common cases.
 */
function recordToFormState(w: WorkflowRecord): WorkflowFormState {
  const t = w.trigger;
  return {
    name: w.name,
    trigger: {
      type: t.type,
      min: t.type === 'lead_score_threshold' ? String(t.config.min) : '',
      channel: t.type === 'inbound_message' ? (t.config.channel ?? 'any') : 'any',
      toolkit: t.type === 'integration_event' ? t.config.toolkit : '',
      event: t.type === 'integration_event' ? t.config.event : '',
      toStage: t.type === 'deal_stage_changed' ? (t.config.toStage ?? '') : '',
      cadence: t.type === 'schedule' ? t.config.cadence : 'daily',
      hour:
        t.type === 'schedule' && typeof t.config.hour === 'number'
          ? String(t.config.hour)
          : '',
    },
    conditionOp: w.conditions.op,
    conditions: w.conditions.rules.flatMap((r) => {
      // Flat group only — skip any nested sub-groups (v1 doesn't author them).
      if ('rules' in r) return [];
      return [
        {
          id: editRowId('cond'),
          field: r.field,
          operator: r.operator as Operator,
          value:
            r.value === undefined || r.value === null ? '' : String(r.value),
        },
      ];
    }),
    actions: w.actions.map((a) => ({
      id: editRowId('act'),
      type: a.type,
      channel:
        a.type === 'draft_message' || a.type === 'schedule_message'
          ? a.config.channel
          : 'sms',
      instruction:
        a.type === 'draft_message' ||
        a.type === 'schedule_message' ||
        a.type === 'run_chippi'
          ? a.config.instruction
          : '',
      delayMinutes:
        a.type === 'schedule_message' ? String(a.config.delayMinutes) : '',
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
    })),
    autonomy: w.autonomy,
    // Carry the stored graph through so the builder opens an advanced workflow
    // straight onto the canvas.
    graph: w.graph ?? null,
  };
}

// ── Manager ──────────────────────────────────────────────────────────────────

export function WorkflowsManager() {
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  /** 'new' | 'templates' | null — what the composer area shows. */
  const [composer, setComposer] = useState<'new' | 'templates' | null>(null);
  const [composerInitial, setComposerInitial] = useState<WorkflowFormState | undefined>(
    undefined,
  );
  const [editingId, setEditingId] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [actionError, setActionError] = useState('');

  // Deep-link target: the activity feed links a workflow_run to #workflow-<id>.
  const highlightedAnchor = useHashHighlight();

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(API_BASE);
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        if (!active) return;
        setWorkflows(Array.isArray(data.workflows) ? data.workflows : []);
      } catch {
        if (active) setLoadError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  function openBlank() {
    setComposerInitial(undefined);
    setEditingId(null);
    setComposer('new');
    setActionError('');
  }

  function pickTemplate(state: WorkflowFormState) {
    setComposerInitial(state);
    setEditingId(null);
    setComposer('new');
    setActionError('');
  }

  function closeComposer() {
    setComposer(null);
    setComposerInitial(undefined);
    setEditingId(null);
    setActionError('');
  }

  async function createWorkflow(payload: { name: string; definition: WorkflowDefinition }) {
    setBusyId('new');
    setActionError('');
    try {
      const res = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(data.error || 'Couldn’t create the workflow.');
        return;
      }
      setWorkflows((ws) => [data as WorkflowRecord, ...ws]);
      closeComposer();
    } catch {
      setActionError('Network hiccup. Try again.');
    } finally {
      setBusyId(null);
    }
  }

  async function saveEdit(
    id: string,
    payload: { name: string; definition: WorkflowDefinition },
  ) {
    setBusyId(id);
    setActionError('');
    try {
      const res = await fetch(`${API_BASE}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(data.error || 'Couldn’t save the workflow.');
        return;
      }
      setWorkflows((ws) => ws.map((w) => (w.id === id ? (data as WorkflowRecord) : w)));
      setEditingId(null);
    } catch {
      setActionError('Network hiccup. Try again.');
    } finally {
      setBusyId(null);
    }
  }

  async function toggleWorkflow(workflow: WorkflowRecord) {
    const next = !workflow.enabled;
    // Optimistic — the Switch should feel instant.
    setWorkflows((ws) => ws.map((w) => (w.id === workflow.id ? { ...w, enabled: next } : w)));
    setActionError('');
    try {
      const res = await fetch(`${API_BASE}/${workflow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) throw new Error('toggle failed');
      const data = (await res.json()) as WorkflowRecord;
      setWorkflows((ws) => ws.map((w) => (w.id === workflow.id ? data : w)));
    } catch {
      setWorkflows((ws) =>
        ws.map((w) => (w.id === workflow.id ? { ...w, enabled: workflow.enabled } : w)),
      );
      setActionError('Couldn’t update the workflow.');
    }
  }

  async function deleteWorkflow(id: string) {
    setBusyId(id);
    setActionError('');
    try {
      const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
      setWorkflows((ws) => ws.filter((w) => w.id !== id));
      if (editingId === id) setEditingId(null);
    } catch {
      setActionError('Couldn’t delete the workflow.');
    } finally {
      setBusyId(null);
    }
  }

  async function testWorkflow(id: string) {
    setTestingId(id);
    setActionError('');
    try {
      const res = await fetch(`${API_BASE}/${id}/test-run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(data.error || 'Test run failed.');
        return;
      }
      setTestResults((r) => ({ ...r, [id]: data as TestResult }));
    } catch {
      setActionError('Couldn’t start the test run.');
    } finally {
      setTestingId(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-9 w-36 animate-pulse rounded-md bg-muted" />
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-10 text-center">
        <p className="text-sm text-foreground">Couldn’t load your workflows.</p>
        <p className={cn(CAPTION, 'mt-1')}>Usually temporary — refresh to try again.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      {/* Composer area: the builder for a new workflow, the template picker, or
          the New / From a template buttons. */}
      {composer === 'new' ? (
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <WorkflowBuilder
            initial={composerInitial}
            saving={busyId === 'new'}
            onSave={createWorkflow}
            onCancel={closeComposer}
          />
        </div>
      ) : composer === 'templates' ? (
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <TemplatePicker onPick={pickTemplate} onCancel={closeComposer} />
        </div>
      ) : workflows.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={openBlank}>
            <Plus size={14} />
            New workflow
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setComposer('templates');
              setActionError('');
            }}
          >
            <Sparkles size={14} />
            Start from a template
          </Button>
        </div>
      ) : null}

      {workflows.length === 0 && composer === null ? (
        <TemplateGallery onPick={pickTemplate} onScratch={openBlank} />
      ) : workflows.length === 0 ? null : (
        <ul className="divide-y divide-border/60">
          {workflows.map((workflow) => (
            <WorkflowRow
              key={workflow.id}
              workflow={workflow}
              highlighted={highlightedAnchor === `workflow-${workflow.id}`}
              editing={editingId === workflow.id}
              busy={busyId === workflow.id}
              testing={testingId === workflow.id}
              testResult={testResults[workflow.id]}
              onEdit={() => {
                setEditingId(workflow.id);
                setComposer(null);
                setActionError('');
              }}
              onCancelEdit={() => setEditingId(null)}
              onSave={(payload) => saveEdit(workflow.id, payload)}
              onToggle={() => toggleWorkflow(workflow)}
              onTest={() => testWorkflow(workflow.id)}
              onDelete={() => deleteWorkflow(workflow.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ── One workflow ─────────────────────────────────────────────────────────────

function WorkflowRow({
  workflow,
  highlighted,
  editing,
  busy,
  testing,
  testResult,
  onEdit,
  onCancelEdit,
  onSave,
  onToggle,
  onTest,
  onDelete,
}: {
  workflow: WorkflowRecord;
  highlighted: boolean;
  editing: boolean;
  busy: boolean;
  testing: boolean;
  testResult: TestResult | undefined;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (payload: { name: string; definition: WorkflowDefinition }) => void;
  onToggle: () => void;
  onTest: () => void;
  onDelete: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Run history (audit trail) — lazy: fetched the first time the row is expanded.
  const [showHistory, setShowHistory] = useState(false);
  const [runs, setRuns] = useState<WorkflowRun[] | null>(null);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsError, setRunsError] = useState(false);

  async function loadHistory() {
    setRunsLoading(true);
    setRunsError(false);
    try {
      const res = await fetch(`${API_BASE}/${workflow.id}/runs`);
      if (!res.ok) throw new Error('load failed');
      const data = await res.json();
      setRuns(Array.isArray(data.runs) ? (data.runs as WorkflowRun[]) : []);
    } catch {
      setRunsError(true);
    } finally {
      setRunsLoading(false);
    }
  }

  function toggleHistory() {
    const next = !showHistory;
    setShowHistory(next);
    // Fetch on first open; reuse the cache afterwards so the toggle is cheap.
    if (next && runs === null && !runsLoading) void loadHistory();
  }

  if (editing) {
    return (
      <li id={`workflow-${workflow.id}`} className="scroll-mt-24 py-3 first:pt-0">
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <WorkflowBuilder
            initial={recordToFormState(workflow)}
            saving={busy}
            onSave={onSave}
            onCancel={onCancelEdit}
          />
        </div>
      </li>
    );
  }

  const summary = summarizeWorkflow(workflow.trigger, workflow.conditions, workflow.actions);

  return (
    <li
      id={`workflow-${workflow.id}`}
      className={cn(
        'group/row flex flex-col gap-2 py-3 first:pt-0 transition-all scroll-mt-24',
        !workflow.enabled && 'opacity-60',
        // Deep-link flash: a feed link to this workflow scrolls it here and
        // rings it for a couple of seconds so the jump is legible.
        highlighted &&
          'rounded-xl bg-sky-50 ring-2 ring-sky-400/60 dark:bg-sky-950/30 -mx-2 px-2',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-snug text-foreground">{workflow.name}</p>
          <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{summary}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            <RunHealthChip status={workflow.lastRunStatus} />
            {workflow.lastRunAt && (
              <span className="tabular-nums text-muted-foreground/70">
                {timeAgo(workflow.lastRunAt)}
              </span>
            )}
            <span className="text-muted-foreground/40">·</span>
            <AutonomyPill autonomy={workflow.autonomy} />
            {!workflow.enabled && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span>Paused</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {confirmingDelete ? (
            <>
              <span className="px-1 text-xs text-muted-foreground">Delete?</span>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={busy}
                className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground disabled:opacity-50"
              >
                Keep
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
              >
                {busy && <Loader2 size={13} className="animate-spin" />}
                Delete
              </button>
            </>
          ) : (
            <>
              <Switch
                checked={workflow.enabled}
                onCheckedChange={onToggle}
                aria-label={workflow.enabled ? 'Pause workflow' : 'Resume workflow'}
              />
              <RowAction
                icon={History}
                label="History"
                onClick={toggleHistory}
                disabled={busy || testing}
                active={showHistory}
              />
              <RowAction icon={Play} label="Test" onClick={onTest} loading={testing} disabled={busy} />
              <RowAction icon={Pencil} label="Edit" onClick={onEdit} disabled={busy || testing} />
              <RowAction
                icon={Trash2}
                label="Delete"
                onClick={() => setConfirmingDelete(true)}
                disabled={busy || testing}
                destructive
              />
            </>
          )}
        </div>
      </div>

      {/* Test-run result — the "prove it works" panel. */}
      {testResult && <TestResultPanel result={testResult} workflow={workflow} />}

      {/* Run history (audit trail) — what fired, when, and what each step did. */}
      {showHistory && (
        <RunHistoryPanel runs={runs} loading={runsLoading} error={runsError} />
      )}
    </li>
  );
}

// ── Run history panel ────────────────────────────────────────────────────────

function RunHistoryPanel({
  runs,
  loading,
  error,
}: {
  runs: WorkflowRun[] | null;
  loading: boolean;
  error: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
      <p className={cn(SECTION_LABEL, 'mb-2')}>Run history</p>
      {loading ? (
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <Loader2 size={13} className="animate-spin" />
          Loading runs…
        </div>
      ) : error ? (
        <p className={CAPTION}>Couldn’t load the run history — try again in a moment.</p>
      ) : !runs || runs.length === 0 ? (
        <p className={CAPTION}>No runs yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {runs.map((run) => (
            <RunHistoryItem key={run.id} run={run} />
          ))}
        </ul>
      )}
    </div>
  );
}

function RunHistoryItem({ run }: { run: WorkflowRun }) {
  const [open, setOpen] = useState(false);
  const hasSteps = run.steps.length > 0;

  return (
    <li className="rounded-md border border-border/50 bg-card/40">
      <button
        type="button"
        onClick={() => hasSteps && setOpen((o) => !o)}
        disabled={!hasSteps}
        className={cn(
          'flex w-full items-start gap-2 px-2.5 py-2 text-left',
          hasSteps && 'transition-colors hover:bg-foreground/[0.03]',
          !hasSteps && 'cursor-default',
        )}
      >
        <ChevronRight
          size={13}
          aria-hidden
          className={cn(
            'mt-0.5 flex-shrink-0 text-muted-foreground/50 transition-transform',
            !hasSteps && 'opacity-0',
            open && 'rotate-90',
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <RunStatusPill status={run.status} />
            <span className="tabular-nums text-[11px] text-muted-foreground/70">
              {timeAgo(run.startedAt)}
            </span>
          </span>
          {(run.summary || run.error) && (
            <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
              {run.error ?? run.summary}
            </span>
          )}
        </span>
      </button>

      {open && hasSteps && (
        <ul className="space-y-1.5 border-t border-border/50 px-3 py-2 pl-7">
          {run.steps.map((step) => (
            <li
              key={step.id}
              className="flex items-start gap-2 text-[12px] leading-snug"
            >
              <StepStatusDot status={step.status} />
              <span className="tabular-nums text-muted-foreground/50">
                {step.stepIndex + 1}.
              </span>
              <span className="font-medium text-foreground">
                {step.actionType ?? step.kind}
              </span>
              <span className="text-muted-foreground">{step.status}</span>
              {detailLine(step.detail) && (
                <span className="min-w-0 flex-1 truncate text-muted-foreground/80">
                  {detailLine(step.detail)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * A short, human-readable line from a step's jsonb detail. detail shapes vary by
 * action; we pick the first present string-ish field and otherwise fall back to a
 * compact JSON string. Always returns a single trimmed line (the row truncates).
 */
function detailLine(detail: unknown): string {
  if (detail == null) return '';
  if (typeof detail === 'string') return detail;
  if (typeof detail !== 'object') return String(detail);
  const obj = detail as Record<string, unknown>;
  for (const key of ['message', 'summary', 'reason', 'detail', 'result', 'error']) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  try {
    return JSON.stringify(detail);
  } catch {
    return '';
  }
}

function RunStatusPill({ status }: { status: WorkflowRun['status'] }) {
  const map: Record<WorkflowRun['status'], { label: string; cls: string }> = {
    completed: {
      label: 'Completed',
      cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400',
    },
    failed: {
      label: 'Failed',
      cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400',
    },
    skipped: {
      label: 'Skipped',
      cls: 'bg-muted text-muted-foreground',
    },
    running: {
      label: 'Running',
      cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400',
    },
  };
  const { label, cls } = map[status] ?? map.skipped;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        cls,
      )}
    >
      {label}
    </span>
  );
}

function TestResultPanel({
  result,
  workflow,
}: {
  result: TestResult;
  workflow: WorkflowRecord;
}) {
  const ok = result.status === 'ok' || result.status === 'success';
  // For a branching workflow, derive which nodes ran so the canvas can light up
  // the executed path; linear workflows have no node ids → empty map → no canvas.
  const highlights = useMemo(() => highlightsFromSteps(result.steps), [result.steps]);
  return (
    <div className="ml-0 rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'inline-flex h-4 w-4 items-center justify-center rounded-full',
            ok
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400',
          )}
          aria-hidden
        >
          {ok ? <Check size={11} /> : <X size={11} />}
        </span>
        <p className="text-xs font-medium text-foreground">
          Test run {ok ? 'completed' : `finished — ${result.status}`}
        </p>
      </div>
      {result.steps.length === 0 ? (
        <p className={cn(CAPTION, 'mt-2')}>
          No steps ran — conditions may not have matched the sample.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {result.steps.map((step) => (
            <li
              key={step.stepIndex}
              className="flex items-start gap-2 text-[12px] leading-snug"
            >
              <StepStatusDot status={step.status} />
              <span className="font-medium text-foreground">
                {step.actionType ?? step.kind}
              </span>
              <span className="text-muted-foreground">{step.status}</span>
              {detailLine(step.detail) && (
                <span className="min-w-0 flex-1 truncate text-muted-foreground/80">
                  {detailLine(step.detail)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Branching workflow → show the path that actually ran on a read-only
          canvas: ran nodes light up, the untaken branch dims. */}
      {workflow.graph && (
        <div className="mt-3 space-y-1.5">
          <p className={cn(SECTION_LABEL, 'text-[10px]')}>Path taken</p>
          <WorkflowCanvasLazy
            // Re-mount per run so a fresh test seeds the new highlights (the
            // canvas seeds its node state once at mount).
            key={result.runId}
            graph={workflow.graph}
            trigger={workflow.trigger}
            onChange={() => {}}
            readOnly
            highlights={highlights}
            heightClass="h-[320px]"
          />
        </div>
      )}
    </div>
  );
}

function StepStatusDot({ status }: { status: string }) {
  const cls =
    status === 'ok' || status === 'success' || status === 'completed'
      ? 'bg-emerald-500'
      : status === 'skipped'
        ? 'bg-muted-foreground/40'
        : status === 'error' || status === 'failed'
          ? 'bg-rose-500'
          : 'bg-amber-500';
  return <span className={cn('mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full', cls)} aria-hidden />;
}

/**
 * The workflow's run health at a glance. Four states, each legible on its own
 * (no reliance on a neighbouring word):
 *   - null  → "New" — never run yet. Reads as fresh/expected, NOT broken (the
 *             old bare "—" looked like an error or missing data).
 *   - ok    → "Ran" — last run completed.
 *   - error → "Failed" — last run errored (carries the warning icon + color).
 *   - skipped → "Skipped" — conditions didn't match; benign.
 */
function RunHealthChip({ status }: { status: WorkflowRecord['lastRunStatus'] }) {
  const map = {
    ok: { label: 'Ran', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400', icon: null },
    error: {
      label: 'Failed',
      cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400',
      icon: AlertTriangle,
    },
    skipped: { label: 'Skipped', cls: 'bg-muted text-muted-foreground', icon: null },
    new: {
      label: 'New',
      cls: 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-400',
      icon: null,
    },
  } as const;
  const { label, cls, icon: Icon } = map[status ?? 'new'];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        cls,
      )}
    >
      {Icon && <Icon size={10} aria-hidden />}
      {label}
    </span>
  );
}

function AutonomyPill({ autonomy }: { autonomy: WorkflowAutonomy }) {
  const label =
    autonomy === 'draft' ? 'Drafts' : autonomy === 'notify' ? 'Auto + notify' : 'Autonomous';
  const cls =
    autonomy === 'auto'
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400'
      : 'bg-muted text-muted-foreground';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        cls,
      )}
    >
      {label}
    </span>
  );
}

function RowAction({
  icon: Icon,
  label,
  onClick,
  disabled,
  loading,
  destructive,
  active,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  destructive?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        'flex-shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-md',
        // Actions are ALWAYS visible — hover-only reveal hid them entirely on
        // touch/mobile (no hover state), so a realtor couldn't find Test/Edit.
        // An active (toggled-on) action reads stronger; the rest sit at a quiet
        // baseline and brighten on hover for the pointer case.
        active
          ? 'text-foreground bg-foreground/[0.06]'
          : 'text-muted-foreground/60 group-hover/row:text-muted-foreground/80',
        'transition-colors disabled:opacity-50',
        destructive
          ? 'hover:text-destructive hover:bg-destructive/10'
          : 'hover:text-foreground hover:bg-foreground/[0.05]',
      )}
    >
      {loading ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />}
    </button>
  );
}

// ── Template gallery (zero-state front door) ─────────────────────────────────

/**
 * The first thing a realtor sees before they have any automations. Instead of a
 * dead "nothing yet" box, it leads with the outcomes Chippi can take off their
 * plate — every template card reads as a plain-English result, one tap drops
 * them into a pre-filled builder, and a quiet "start from scratch" stays for the
 * realtor who'd rather compose their own. Show the value, then invite the tap.
 */
function TemplateGallery({
  onPick,
  onScratch,
}: {
  onPick: (state: WorkflowFormState) => void;
  onScratch: () => void;
}) {
  const reduce = useReducedMotion();
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-[15px] font-medium text-foreground">
          What should I take off your plate?
        </p>
        <p className={CAPTION}>
          Pick one to start — you’ll see exactly what it does before it turns on.
        </p>
      </div>

      <motion.ul
        className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
        variants={reduce ? undefined : STAGGER_CONTAINER}
        initial={reduce ? undefined : 'initial'}
        animate={reduce ? undefined : 'enter'}
      >
        {WORKFLOW_TEMPLATES.map((template) => (
          <motion.li key={template.id} variants={reduce ? undefined : STAGGER_ITEM}>
            <button
              type="button"
              onClick={() => onPick(cloneTemplateState(template))}
              className="group/card flex h-full w-full items-start gap-3 rounded-xl border border-border/60 bg-card p-4 text-left transition-colors hover:border-foreground/30 hover:bg-foreground/[0.02]"
            >
              <span className="mt-0.5 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-foreground/[0.05] text-muted-foreground transition-colors group-hover/card:bg-foreground group-hover/card:text-background">
                <WorkflowIcon size={15} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium leading-snug text-foreground">
                  {template.name}
                </span>
                <span className="mt-1 block text-[13px] leading-snug text-muted-foreground">
                  {template.description}
                </span>
              </span>
              <ChevronRight
                size={15}
                aria-hidden
                className="mt-0.5 flex-shrink-0 text-muted-foreground/40 transition-colors group-hover/card:text-foreground"
              />
            </button>
          </motion.li>
        ))}
      </motion.ul>

      <div className="flex items-center gap-2 pt-1">
        <span className={CAPTION}>Prefer to build your own?</span>
        <button
          type="button"
          onClick={onScratch}
          className="inline-flex items-center gap-1 text-xs font-medium text-foreground underline underline-offset-2 transition-colors hover:text-foreground/80"
        >
          <Plus size={13} aria-hidden />
          Start from scratch
        </button>
      </div>
    </div>
  );
}

// ── Template picker ──────────────────────────────────────────────────────────

function TemplatePicker({
  onPick,
  onCancel,
}: {
  onPick: (state: WorkflowFormState) => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className={SECTION_LABEL}>Start from a template</p>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Cancel
        </button>
      </div>
      <ul className="space-y-2">
        {WORKFLOW_TEMPLATES.map((template) => (
          <li key={template.id}>
            <button
              type="button"
              onClick={() => onPick(cloneTemplateState(template))}
              className="group/tpl flex w-full items-start gap-3 rounded-lg border border-border/60 bg-card p-3 text-left transition-colors hover:border-foreground/30 hover:bg-foreground/[0.02]"
            >
              <WorkflowIcon
                size={16}
                className="mt-0.5 flex-shrink-0 text-muted-foreground group-hover/tpl:text-foreground"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{template.name}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
                  {template.description}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
