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
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { motion, useReducedMotion } from 'framer-motion';
import { STAGGER_CONTAINER, STAGGER_ITEM } from '@/lib/motion';
import {
  Loader2,
  Plus,
  Workflow as WorkflowIcon,
  Play,
  Pencil,
  PencilLine,
  Trash2,
  AlertTriangle,
  Check,
  X,
  Sparkles,
  History,
  ChevronRight,
  Zap,
  Mail,
  Sun,
  Home,
  GitBranch,
  Search,
  MessageCircle,
  TrendingUp,
  Clock,
  UserPlus,
  Target,
  Plug,
  Copy,
  CheckSquare,
  ArrowRight,
  Webhook,
  ArrowUpDown,
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
      // webhook trigger has no config fields
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
        a.type === 'schedule_message'
          ? String(a.config.delayMinutes)
          : a.type === 'delay'
            ? String(a.config.delayMinutes)
            : '',
      delayUnit: 'minutes' as const,
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
      filterOperator: a.type === 'filter' ? a.config.operator : 'eq' as const,
      filterValue:
        a.type === 'filter' && a.config.value !== undefined ? String(a.config.value) : '',
    })),
    autonomy: w.autonomy,
    // Carry the stored graph through so the builder opens an advanced workflow
    // straight onto the canvas.
    graph: w.graph ?? null,
  };
}

// ── Manager ──────────────────────────────────────────────────────────────────

export function WorkflowsManager() {
  const searchParams = useSearchParams();
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
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'on' | 'off' | 'failed'>('all');
  const [triggerFilter, setTriggerFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'created' | 'name' | 'lastRun'>('created');

  /** Unique trigger types present in the current workflow list for the filter dropdown. */
  const triggerTypes = useMemo(() => {
    const seen = new Set<string>();
    workflows.forEach((w) => seen.add(w.trigger.type));
    return Array.from(seen);
  }, [workflows]);

  const filteredWorkflows = useMemo(() => {
    let list = workflows;
    const q = searchQuery.trim().toLowerCase();
    if (q) list = list.filter((w) => w.name.toLowerCase().includes(q));
    if (statusFilter === 'on') list = list.filter((w) => w.enabled);
    else if (statusFilter === 'off') list = list.filter((w) => !w.enabled);
    else if (statusFilter === 'failed') list = list.filter((w) => w.lastRunStatus === 'error');
    if (triggerFilter !== 'all') list = list.filter((w) => w.trigger.type === triggerFilter);
    list = [...list].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'lastRun') {
        if (!a.lastRunAt && !b.lastRunAt) return 0;
        if (!a.lastRunAt) return 1;
        if (!b.lastRunAt) return -1;
        return b.lastRunAt.localeCompare(a.lastRunAt);
      }
      // created: newest first (default — the API already returns this order)
      return b.createdAt.localeCompare(a.createdAt);
    });
    return list;
  }, [workflows, searchQuery, statusFilter, triggerFilter, sortBy]);

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

  useEffect(() => {
    if (searchParams.get('new') === '1') openBlank();
  // Re-run when the ?new param changes so same-page nav from the sidebar works.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get('new')]);

  function pickTemplate(state: WorkflowFormState) {
    setComposerInitial(state);
    setEditingId(null);
    setComposer('new');
    setActionError('');
  }

  function duplicateWorkflow(workflow: WorkflowRecord) {
    const formState = recordToFormState(workflow);
    setComposerInitial({ ...formState, name: `${formState.name} (copy)` });
    setEditingId(null);
    setComposer('new');
    setActionError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
        setActionError(data.error || "Couldn't create the workflow.");
        return;
      }
      setWorkflows((ws) => [data as WorkflowRecord, ...ws]);
      closeComposer();
      toast.success('Workflow is live!', {
        description: `"${payload.name}" will run on its trigger.`,
        duration: 5000,
      });
    } catch {
      setActionError("Network hiccup. Try again.");
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
        setActionError(data.error || "Couldn't save the workflow.");
        return;
      }
      setWorkflows((ws) => ws.map((w) => (w.id === id ? (data as WorkflowRecord) : w)));
      setEditingId(null);
      toast.success('Workflow saved');
    } catch {
      setActionError("Network hiccup. Try again.");
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
      toast.success(next ? 'Workflow is on' : 'Workflow paused', {
        description: `"${workflow.name}" ${next ? 'will run on its trigger.' : 'will not run until you turn it on.'}`,
      });
    } catch {
      setWorkflows((ws) =>
        ws.map((w) => (w.id === workflow.id ? { ...w, enabled: workflow.enabled } : w)),
      );
      setActionError("Couldn't update the workflow.");
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
      toast.success('Workflow deleted');
    } catch {
      setActionError("Couldn't delete the workflow.");
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
      setActionError("Couldn't start the test run.");
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
        <p className="text-sm text-foreground">Couldn't load your workflows.</p>
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
        <div className="space-y-2">
          {/* Row 1: search + buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search
                size={14}
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search ${workflows.length} workflow${workflows.length === 1 ? '' : 's'}...`}
                className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 dark:bg-input/30"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setComposer('templates');
                setActionError('');
              }}
            >
              <Sparkles size={14} />
              Templates
            </Button>
            <Button
              size="sm"
              onClick={openBlank}
              className="bg-orange-500 text-white hover:bg-orange-600 dark:bg-orange-500/90 dark:hover:bg-orange-600"
            >
              <Plus size={14} />
              New workflow
            </Button>
          </div>
          {/* Row 2: status filter pills + sort */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1.5">
              {(
                [
                  { value: 'all', label: 'All' },
                  { value: 'on', label: 'On' },
                  { value: 'off', label: 'Off' },
                  { value: 'failed', label: 'Failed' },
                ] as const
              ).map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setStatusFilter(f.value)}
                  className={cn(
                    'rounded-full px-3 py-0.5 text-xs font-medium transition-colors',
                    statusFilter === f.value
                      ? f.value === 'failed'
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                        : 'bg-foreground text-background'
                      : 'bg-muted text-muted-foreground hover:bg-foreground/10 hover:text-foreground',
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {/* Trigger type filter — only shown when 2+ types exist */}
            {triggerTypes.length > 1 && (
              <select
                value={triggerFilter}
                onChange={(e) => setTriggerFilter(e.target.value)}
                className="h-6 rounded border border-border bg-background px-1.5 text-[11px] text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
              >
                <option value="all">All triggers</option>
                {triggerTypes.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            )}
            {/* Sort */}
            <div className="ml-auto flex items-center gap-1.5">
              <ArrowUpDown size={12} className="text-muted-foreground/60" aria-hidden />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="h-6 rounded border border-border bg-background px-1.5 text-[11px] text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
              >
                <option value="created">Newest first</option>
                <option value="name">Name A–Z</option>
                <option value="lastRun">Last run</option>
              </select>
            </div>
          </div>
        </div>
      ) : null}

      {workflows.length === 0 && composer === null ? (
        <TemplateGallery onPick={pickTemplate} onScratch={openBlank} />
      ) : workflows.length === 0 ? null : (
        <>
          {/* Editing builder — floats above the table so the table layout stays intact */}
          {editingId && (() => {
            const editing = workflows.find((w) => w.id === editingId);
            return editing ? (
              <div
                id={`workflow-${editingId}`}
                className="rounded-xl border border-border/60 bg-card p-4 scroll-mt-24"
              >
                <WorkflowBuilder
                  initial={recordToFormState(editing)}
                  saving={busyId === editingId}
                  workflowId={editingId}
                  onSave={(payload) => saveEdit(editingId, payload)}
                  onCancel={() => setEditingId(null)}
                />
              </div>
            ) : null;
          })()}

          {/* Table container */}
          <div className="rounded-xl border border-border/60 overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_160px_140px_60px_128px] border-b border-border/60 bg-muted/40 px-3 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Workflow
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Trigger
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Last run
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-center">
                On/Off
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">
                Actions
              </span>
            </div>

            {/* Table rows */}
            {filteredWorkflows.length > 0 ? (
              <div className="divide-y divide-border/60">
                {filteredWorkflows.map((workflow) => (
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
                    onDuplicate={() => duplicateWorkflow(workflow)}
                    onDelete={() => deleteWorkflow(workflow.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No workflows match <span className="font-medium text-foreground">{searchQuery}</span>
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Trigger type → icon + accent ─────────────────────────────────────────────

const TRIGGER_ICON_MAP: Record<string, { icon: LucideIcon; cls: string }> = {
  lead_score_threshold: { icon: Target, cls: 'bg-orange-100 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400' },
  inbound_message: { icon: MessageCircle, cls: 'bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400' },
  integration_event: { icon: Plug, cls: 'bg-violet-100 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400' },
  deal_stage_changed: { icon: TrendingUp, cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' },
  schedule: { icon: Clock, cls: 'bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400' },
  lead_created: { icon: UserPlus, cls: 'bg-sky-100 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400' },
  tour_completed: { icon: Home, cls: 'bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400' },
  webhook: { icon: Webhook, cls: 'bg-teal-100 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400' },
};

// ── Action type → icon ───────────────────────────────────────────────────────

const ACTION_ICON_MAP: Record<string, { icon: LucideIcon; cls: string }> = {
  draft_message:    { icon: PencilLine,   cls: 'bg-sky-100 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400' },
  schedule_message: { icon: Clock,        cls: 'bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400' },
  create_task:      { icon: CheckSquare,  cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' },
  call_integration: { icon: Plug,         cls: 'bg-violet-100 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400' },
  run_chippi:       { icon: Sparkles,     cls: 'bg-orange-100 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400' },
};

/**
 * Compact visual flow row: trigger icon → action icon(s) — mirrors the
 * Zapier list's app-icon row that lets you scan a workflow's shape at a glance.
 */
function WorkflowFlowLine({
  trigger,
  actions,
}: {
  trigger: WorkflowTrigger;
  actions: WorkflowAction[];
}) {
  const ti = TRIGGER_ICON_MAP[trigger.type];
  const visibleActions = actions.slice(0, 5);
  const overflow = actions.length - visibleActions.length;
  return (
    <div className="mt-1 flex items-center gap-1">
      {ti && (
        <>
          <span className={cn('flex h-4 w-4 flex-shrink-0 items-center justify-center rounded', ti.cls)}>
            <ti.icon size={9} aria-hidden />
          </span>
          <ArrowRight size={9} className="flex-shrink-0 text-muted-foreground/40" aria-hidden />
        </>
      )}
      {visibleActions.map((a, i) => {
        const ai = ACTION_ICON_MAP[a.type];
        if (!ai) return null;
        return (
          <div key={i} className="flex items-center gap-1">
            <span className={cn('flex h-4 w-4 flex-shrink-0 items-center justify-center rounded', ai.cls)}>
              <ai.icon size={9} aria-hidden />
            </span>
            {i < visibleActions.length - 1 && (
              <ArrowRight size={9} className="flex-shrink-0 text-muted-foreground/40" aria-hidden />
            )}
          </div>
        );
      })}
      {overflow > 0 && (
        <span className="text-[10px] text-muted-foreground/60">+{overflow}</span>
      )}
    </div>
  );
}

// ── Webhook URL chip ─────────────────────────────────────────────────────────

/**
 * Compact inline chip showing the webhook URL with a one-click copy. Sits under
 * the workflow name in the list row so the realtor can grab the URL without
 * opening the editor.
 */
function WebhookUrlChip({ workflowId }: { workflowId: string }) {
  const [copied, setCopied] = useState(false);
  const url = `/api/workflows/${workflowId}/webhook`;

  function copyUrl() {
    navigator.clipboard.writeText(`${window.location.origin}${url}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        copyUrl();
      }}
      aria-label={copied ? 'Copied!' : 'Copy webhook URL'}
      className="mt-1 inline-flex max-w-full items-center gap-1 rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-mono text-teal-700 transition-colors hover:bg-teal-100 dark:bg-teal-950/30 dark:text-teal-400 dark:hover:bg-teal-950/50"
    >
      <Webhook size={9} aria-hidden className="flex-shrink-0" />
      <span className="truncate">{url}</span>
      {copied ? (
        <Check size={9} className="flex-shrink-0 text-emerald-500" aria-hidden />
      ) : (
        <Copy size={9} className="flex-shrink-0 opacity-50" aria-hidden />
      )}
    </button>
  );
}

// ── Trigger type → human-readable label ──────────────────────────────────────

function triggerLabel(trigger: WorkflowTrigger): string {
  switch (trigger.type) {
    case 'lead_score_threshold':
      return 'Score threshold';
    case 'inbound_message':
      return 'Inbound message';
    case 'integration_event':
      return trigger.config.toolkit ? `${trigger.config.toolkit} event` : 'Integration event';
    case 'deal_stage_changed':
      return 'Deal stage change';
    case 'schedule':
      return 'Schedule';
    case 'lead_created':
      return 'New lead';
    case 'tour_completed':
      return 'Tour completed';
    case 'webhook':
      return 'Webhook';
    default:
      // Exhaustive narrowing fallback — if a new trigger type is added, show it
      // kebab-cased rather than an empty cell.
      return (trigger as { type: string }).type.replace(/_/g, ' ');
  }
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
  onCancelEdit: _onCancelEdit,
  onSave: _onSave,
  onToggle,
  onTest,
  onDuplicate,
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
  onDuplicate: () => void;
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

  const summary = summarizeWorkflow(workflow.trigger, workflow.conditions, workflow.actions);
  const hasExpansion = !!(testResult || showHistory);

  return (
    // Wrapper div — not a <li> anymore; the parent is a plain <div> container.
    <div
      id={`workflow-${workflow.id}`}
      className={cn(
        'group/row transition-colors scroll-mt-24',
        !workflow.enabled && 'opacity-60',
        highlighted && 'bg-sky-50 ring-2 ring-inset ring-sky-400/60 dark:bg-sky-950/30',
        // Highlight the row if it is being edited (builder is above the table).
        editing && 'bg-muted/30',
      )}
    >
      {/* Main grid row */}
      <div className="grid grid-cols-[1fr_160px_140px_60px_128px] items-center gap-0 px-3 py-2.5">

        {/* Col 1 — Name + visual flow */}
        <div className="min-w-0 pr-3">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium leading-snug text-foreground">
              {workflow.name}
            </p>
            {workflow.enabled && (
              <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" aria-label="On" />
            )}
            {!workflow.enabled && (
              <span className="inline-flex items-center rounded px-1 py-px text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 bg-muted/60">
                Paused
              </span>
            )}
            {workflow.actions.length > 0 && (
              <span className="inline-flex flex-shrink-0 items-center rounded-full bg-muted/60 px-1.5 py-px text-[10px] tabular-nums text-muted-foreground/60">
                {workflow.actions.length} {workflow.actions.length === 1 ? 'step' : 'steps'}
              </span>
            )}
          </div>
          <WorkflowFlowLine trigger={workflow.trigger} actions={workflow.actions} />
          {workflow.trigger.type === 'webhook' ? (
            <WebhookUrlChip workflowId={workflow.id} />
          ) : (
            <p className="mt-0.5 truncate text-[11px] leading-snug text-muted-foreground/70">
              {summary}
            </p>
          )}
        </div>

        {/* Col 2 — Trigger label + icon */}
        <div className="flex min-w-0 items-center gap-1.5 pr-2">
          {(() => {
            const ti = TRIGGER_ICON_MAP[workflow.trigger.type];
            if (!ti) return null;
            const TIcon = ti.icon;
            return (
              <span className={cn('flex h-5 w-5 flex-shrink-0 items-center justify-center rounded', ti.cls)}>
                <TIcon size={11} aria-hidden />
              </span>
            );
          })()}
          <span className="truncate text-[13px] text-muted-foreground">
            {triggerLabel(workflow.trigger)}
          </span>
        </div>

        {/* Col 3 — Run health + time */}
        <div className="flex items-center gap-1.5 pr-2">
          <RunHealthChip status={workflow.lastRunStatus} />
          {workflow.lastRunAt ? (
            <span className="tabular-nums text-[11px] text-muted-foreground/70">
              {timeAgo(workflow.lastRunAt)}
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground/40">Never</span>
          )}
        </div>

        {/* Col 4 — Toggle */}
        <div className="flex justify-center">
          <Switch
            checked={workflow.enabled}
            onCheckedChange={onToggle}
            aria-label={workflow.enabled ? 'Pause workflow' : 'Resume workflow'}
          />
        </div>

        {/* Col 5 — Actions */}
        <div className="flex items-center justify-end gap-0.5">
          {confirmingDelete ? (
            // Inline delete confirmation — stays within the row so layout stays clean.
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-muted-foreground">Delete?</span>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={busy}
                className="rounded px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground disabled:opacity-50"
              >
                No
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
              >
                {busy && <Loader2 size={11} className="animate-spin" />}
                Yes
              </button>
            </div>
          ) : (
            <>
              <RowAction
                icon={History}
                label="History"
                onClick={toggleHistory}
                disabled={busy || testing}
                active={showHistory}
              />
              <RowAction
                icon={Play}
                label="Test"
                onClick={onTest}
                loading={testing}
                disabled={busy}
              />
              <RowAction
                icon={Copy}
                label="Duplicate"
                onClick={onDuplicate}
                disabled={busy || testing}
              />
              <RowAction
                icon={Pencil}
                label="Edit"
                onClick={onEdit}
                disabled={busy || testing}
                active={editing}
              />
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

      {/* Full-width expansion panels — span all columns below the grid row */}
      {hasExpansion && (
        <div className="border-t border-border/40 px-3 pb-3 pt-2 space-y-2">
          {/* Test-run result — the "prove it works" panel. */}
          {testResult && <TestResultPanel result={testResult} workflow={workflow} />}

          {/* Run history (audit trail) — what fired, when, and what each step did. */}
          {showHistory && (
            <RunHistoryPanel runs={runs} loading={runsLoading} error={runsError} />
          )}
        </div>
      )}
    </div>
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
        <p className={CAPTION}>Couldn't load the run history — try again in a moment.</p>
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
          canvas: ran nodes light up, the untaken branch dims. Given its own
          breathing room (top divider + taller frame) so the graph reads clearly
          rather than cramped under the step list. */}
      {workflow.graph && (
        <div className="mt-4 space-y-2 border-t border-border/50 pt-4">
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
            heightClass="h-[400px]"
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
  // `?? map.new` guards an out-of-contract status (e.g. a future 'running')
  // from indexing to undefined and throwing on destructure.
  const { label, cls, icon: Icon } = map[status ?? 'new'] ?? map.new;
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

/** Icon + accent color per template — gives each card a visual identity. */
const TEMPLATE_META: Record<string, { icon: LucideIcon; accent: string; dot: string }> = {
  'hot-lead-instant-draft': {
    icon: Zap,
    accent: 'bg-orange-100 dark:bg-orange-950/40',
    dot: 'text-orange-500 dark:text-orange-400',
  },
  'gmail-client-reply': {
    icon: Mail,
    accent: 'bg-red-100 dark:bg-red-950/40',
    dot: 'text-red-500 dark:text-red-400',
  },
  'morning-follow-ups': {
    icon: Sun,
    accent: 'bg-amber-100 dark:bg-amber-950/40',
    dot: 'text-amber-500 dark:text-amber-400',
  },
  'tour-completed-thanks': {
    icon: Home,
    accent: 'bg-blue-100 dark:bg-blue-950/40',
    dot: 'text-blue-500 dark:text-blue-400',
  },
  'new-lead-welcome': {
    icon: UserPlus,
    accent: 'bg-sky-100 dark:bg-sky-950/40',
    dot: 'text-sky-500 dark:text-sky-400',
  },
  'deal-stage-changed-notify': {
    icon: TrendingUp,
    accent: 'bg-emerald-100 dark:bg-emerald-950/40',
    dot: 'text-emerald-600 dark:text-emerald-400',
  },
  'inbound-inquiry-multi-step': {
    icon: MessageCircle,
    accent: 'bg-indigo-100 dark:bg-indigo-950/40',
    dot: 'text-indigo-500 dark:text-indigo-400',
  },
  'hot-vs-warm-branch': {
    icon: GitBranch,
    accent: 'bg-violet-100 dark:bg-violet-950/40',
    dot: 'text-violet-500 dark:text-violet-400',
  },
  'webhook-any-service': {
    icon: Webhook,
    accent: 'bg-teal-100 dark:bg-teal-950/40',
    dot: 'text-teal-600 dark:text-teal-400',
  },
};

const TEMPLATE_META_DEFAULT = {
  icon: WorkflowIcon,
  accent: 'bg-muted',
  dot: 'text-muted-foreground',
};

/**
 * Zero-state front door — large visual template cards that look like Zapier's
 * template gallery. Each card shows what gets automated in plain language so
 * the realtor picks based on outcome, not on technical detail.
 */
function TemplateGallery({
  onPick,
  onScratch,
}: {
  onPick: (state: WorkflowFormState) => void;
  onScratch: () => void;
}) {
  const reduce = useReducedMotion();
  const [q, setQ] = useState('');
  const visibleTemplates = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return WORKFLOW_TEMPLATES;
    return WORKFLOW_TEMPLATES.filter(
      (t) =>
        t.name.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query),
    );
  }, [q]);

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <p className="text-[15px] font-medium text-foreground">
          What should Chippi handle for you?
        </p>
        <p className={CAPTION}>
          Pick a template — you see exactly what it does before anything turns on.
        </p>
      </div>

      {/* Template search */}
      <div className="relative max-w-sm">
        <Search
          size={14}
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search templates…"
          className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 dark:bg-input/30"
        />
      </div>

      {visibleTemplates.length === 0 ? (
        <p className={cn(CAPTION, 'py-4 text-center')}>
          No templates match <span className="font-medium text-foreground">{q}</span> — try a different search.
        </p>
      ) : (
        <>
          <motion.ul
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
            variants={reduce ? undefined : STAGGER_CONTAINER}
            initial={reduce ? undefined : 'initial'}
            animate={reduce ? undefined : 'enter'}
          >
            {visibleTemplates.map((template) => {
              const meta = TEMPLATE_META[template.id] ?? TEMPLATE_META_DEFAULT;
              const Icon = meta.icon;
              return (
                <motion.li key={template.id} variants={reduce ? undefined : STAGGER_ITEM} className="flex">
                  <button
                    type="button"
                    onClick={() => onPick(cloneTemplateState(template))}
                    className="group/card flex h-full w-full flex-col rounded-xl border border-border/60 bg-card text-left transition-colors hover:border-foreground/25 hover:shadow-sm"
                  >
                    {/* Icon area */}
                    <div className={cn('flex items-center justify-center rounded-t-xl px-4 py-6', meta.accent)}>
                      <Icon size={32} className={meta.dot} aria-hidden />
                    </div>
                    {/* Text area */}
                    <div className="flex flex-1 flex-col gap-1.5 p-4">
                      <span className="block text-sm font-semibold leading-snug text-foreground">
                        {template.name}
                      </span>
                      <span className="block flex-1 text-[13px] leading-relaxed text-muted-foreground">
                        {template.description}
                      </span>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wide">
                          {template.state.trigger.type.replace(/_/g, ' ')}
                        </span>
                        <ChevronRight
                          size={14}
                          aria-hidden
                          className="text-muted-foreground/30 transition-colors group-hover/card:text-foreground/60"
                        />
                      </div>
                    </div>
                  </button>
                </motion.li>
              );
            })}
          </motion.ul>

          <div className="flex items-center gap-2 pt-1">
            <span className={CAPTION}>Prefer to start blank?</span>
            <button
              type="button"
              onClick={onScratch}
              className="inline-flex items-center gap-1 text-xs font-medium text-foreground underline underline-offset-2 transition-colors hover:text-foreground/80"
            >
              <Plus size={13} aria-hidden />
              Build from scratch
            </button>
          </div>
        </>
      )}
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
  const [q, setQ] = useState('');
  const visibleTemplates = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return WORKFLOW_TEMPLATES;
    return WORKFLOW_TEMPLATES.filter(
      (t) =>
        t.name.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query),
    );
  }, [q]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className={SECTION_LABEL}>Start from a template</p>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search
          size={14}
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search templates…"
          className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 dark:bg-input/30"
        />
      </div>

      {visibleTemplates.length === 0 ? (
        <p className={cn(CAPTION, 'py-4 text-center')}>
          No templates match <span className="font-medium text-foreground">{q}</span> — try a different search.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {visibleTemplates.map((template) => {
            const meta = TEMPLATE_META[template.id] ?? TEMPLATE_META_DEFAULT;
            const Icon = meta.icon;
            return (
              <li key={template.id} className="flex">
                <button
                  type="button"
                  onClick={() => onPick(cloneTemplateState(template))}
                  className="group/tpl flex h-full w-full flex-col rounded-xl border border-border/60 bg-card text-left transition-colors hover:border-foreground/25 hover:shadow-sm"
                >
                  <div className={cn('flex items-center justify-center rounded-t-xl px-4 py-4', meta.accent)}>
                    <Icon size={24} className={meta.dot} aria-hidden />
                  </div>
                  <div className="flex flex-1 flex-col gap-1 p-3">
                    <span className="block text-sm font-semibold leading-snug text-foreground">
                      {template.name}
                    </span>
                    <span className="block flex-1 text-[12px] leading-relaxed text-muted-foreground">
                      {template.description}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
