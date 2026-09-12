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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Filter,
  Download,
  Upload,
  RotateCcw,
  Wand2,
  Activity,
  BellRing,
  Eye,
  Building2,
  RefreshCw,
  Table2,
  Variable,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { WorkflowBuilder, actionsToRows } from './workflow-builder';
import type { ConditionRowState, WorkflowFormState } from './build-definition';
import { summarizeWorkflow } from './summary';
import { WORKFLOW_TEMPLATES, cloneTemplateState } from './templates';
import type { TemplateCategory } from './templates';
import { WorkflowCanvasLazy } from './workflow-canvas-lazy';
import { highlightsFromSteps } from './run-highlights';
import { useHashHighlight } from '@/hooks/use-hash-highlight';

// ── Sort labels — mirrors People's "Sort:" dropdown vocabulary ───────────────

const WORKFLOW_SORT_LABELS = {
  created: 'Newest first',
  name: 'Name A–Z',
  lastRun: 'Last run',
  modified: 'Last modified',
} as const;

type WorkflowSortKey = keyof typeof WORKFLOW_SORT_LABELS;

// ── The record shape the API returns (subset we render) ──────────────────────

interface WorkflowRecord {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  notifyOnError: boolean;
  trigger: WorkflowTrigger;
  conditions: ConditionGroup;
  actions: WorkflowAction[];
  autonomy: WorkflowAutonomy;
  /** Advanced-mode branching graph (null/absent for linear workflows). */
  graph?: WorkflowGraph | null;
  lastRunAt: string | null;
  lastRunStatus: 'ok' | 'error' | 'skipped' | null;
  createdAt: string;
  updatedAt: string;
  runCount?: number;
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
  triggerEvent: unknown;
  steps: RunStep[];
}

interface GlobalRun {
  id: string;
  workflowId: string;
  workflowName: string;
  status: 'running' | 'completed' | 'failed' | 'skipped';
  summary: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
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
    description: w.description ?? undefined,
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
      timezone:
        t.type === 'schedule'
          ? ((t.config as { timezone?: string }).timezone ?? '')
          : '',
      webhookSecret:
        t.type === 'webhook'
          ? ((t.config as { webhookSecret?: string }).webhookSecret ?? '')
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
      label: a.label,
      note: a.note,
      onError: a.onError as 'stop' | 'skip' | 'retry' | undefined,
      retryCount: 'maxRetries' in a && typeof a.maxRetries === 'number' ? String(a.maxRetries) : '3',
      stepEnabled: a.enabled !== false,
      channel:
        a.type === 'draft_message' || a.type === 'schedule_message'
          ? a.config.channel
          : 'email',
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
            ? String(a.config.delayMinutes ?? '')
            : '',
      delayUnit: 'minutes' as const,
      delayMode: (a.type === 'delay' ? (a.config.delayMode ?? 'relative') : 'relative') as 'relative' | 'until_weekday' | 'until_date',
      untilWeekday: a.type === 'delay' && a.config.untilWeekday !== undefined ? String(a.config.untilWeekday) : '1',
      untilHour: a.type === 'delay' && a.config.untilHour !== undefined ? String(a.config.untilHour) : '9',
      untilDate: a.type === 'delay' && 'untilDate' in a.config && typeof a.config.untilDate === 'string' ? a.config.untilDate : '',
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
      formatterInput: a.type === 'formatter' ? a.config.input : '',
      formatterOperation: a.type === 'formatter' ? a.config.operation : 'uppercase' as const,
      formatterFind: a.type === 'formatter' ? (a.config.find ?? '') : '',
      formatterReplace: a.type === 'formatter' ? (a.config.replacement ?? '') : '',
      formatterFormat: a.type === 'formatter' ? (a.config.format ?? 'MM/DD/YYYY') : 'MM/DD/YYYY',
      formatterToFixed: a.type === 'formatter' && a.config.toFixed !== undefined ? String(a.config.toFixed) : '',
      formatterFallback: a.type === 'formatter' ? (a.config.fallback ?? '') : '',
      formatterTruncateLength: a.type === 'formatter' && a.config.truncateLength !== undefined ? String(a.config.truncateLength) : '',
      formatterTruncateSuffix: a.type === 'formatter' ? (a.config.truncateSuffix ?? '') : '',
      formatterSplitSeparator: a.type === 'formatter' ? (a.config.splitSeparator ?? '') : '',
      formatterSplitIndex: a.type === 'formatter' && a.config.splitIndex !== undefined ? String(a.config.splitIndex) : '',
      formatterRegexPattern: a.type === 'formatter' ? (a.config.regexPattern ?? '') : '',
      formatterRegexFlags: a.type === 'formatter' ? (a.config.regexFlags ?? '') : '',
      subWorkflowId: a.type === 'run_workflow' ? a.config.workflowId : '',
      lookupInput: a.type === 'lookup_table' ? a.config.input : '',
      lookupEntriesJson: a.type === 'lookup_table' ? JSON.stringify(a.config.entries) : '',
      lookupFallback: a.type === 'lookup_table' ? (a.config.fallback ?? '') : '',
      varName: (a.type === 'set_variable' || a.type === 'get_variable') ? a.config.name : '',
      varValue: a.type === 'set_variable' ? a.config.value : '',
      varDefault: a.type === 'get_variable' ? (a.config.defaultValue ?? '') : '',
      webhookUrl: a.type === 'webhook_post' ? a.config.url : '',
      webhookBody: a.type === 'webhook_post' ? (a.config.bodyJson ?? '') : '',
      webhookHeaders: a.type === 'webhook_post' ? (a.config.headersJson ?? '') : '',
      updateField: a.type === 'update_lead' ? a.config.field : 'score_label' as const,
      updateValue: a.type === 'update_lead' ? a.config.value : '',
      notifyTitle: a.type === 'notify_agent' ? a.config.title : '',
      notifyBody: a.type === 'notify_agent' ? (a.config.body ?? '') : '',
      // Branch paths — previously DROPPED here, so editing/duplicating a branch
      // workflow loaded zero paths and then failed to re-save (paths.min(1)).
      // Reuse the builder's canonical converter for the nested sub-actions.
      branchPaths:
        a.type === 'branch'
          ? a.config.paths.map((p) => ({
              id: editRowId('bp'),
              label: p.label ?? '',
              field: p.field,
              operator: p.operator as Operator,
              value: p.value !== undefined && p.value !== null ? String(p.value) : '',
              actions: actionsToRows(p.actions as WorkflowAction[]),
            }))
          : [],
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
  const [sortBy, setSortBy] = useState<'created' | 'name' | 'lastRun' | 'modified'>('created');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [, setBulkBusy] = useState(false);

  const [activeTab, setActiveTab] = useState<'workflows' | 'history'>('workflows');
  const [globalRuns, setGlobalRuns] = useState<GlobalRun[] | null>(null);
  const [globalRunsLoading, setGlobalRunsLoading] = useState(false);
  const [globalRunsError, setGlobalRunsError] = useState(false);
  const [globalRunsStatusFilter, setGlobalRunsStatusFilter] = useState<'all' | 'completed' | 'failed'>('all');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredWorkflows = useMemo(() => {
    let list = workflows;
    const q = searchQuery.trim().toLowerCase();
    if (q) list = list.filter(
      (w) => w.name.toLowerCase().includes(q) || (w.description ?? '').toLowerCase().includes(q),
    );
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
      if (sortBy === 'modified') return b.updatedAt.localeCompare(a.updatedAt);
      // created: newest first (default — the API already returns this order)
      return b.createdAt.localeCompare(a.createdAt);
    });
    return list;
  }, [workflows, searchQuery, statusFilter, triggerFilter, sortBy]);

  // Deep-link target: the activity feed links a workflow_run to #workflow-<id>.
  const highlightedAnchor = useHashHighlight();

  const loadWorkflows = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch(API_BASE);
      if (!res.ok) throw new Error('load failed');
      const data = await res.json();
      setWorkflows(Array.isArray(data.workflows) ? data.workflows : []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkflows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openBlank() {
    setComposerInitial(undefined);
    setEditingId(null);
    setComposer('new');
    // The composer + saved result live on the Workflows tab — snap back so a
    // builder opened from History isn't stacked over the runs table, and the
    // saved workflow is visible after Save.
    setActiveTab('workflows');
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

  function exportWorkflow(workflow: WorkflowRecord) {
    const payload = {
      name: workflow.name,
      ...(workflow.description ? { description: workflow.description } : {}),
      definition: {
        trigger: workflow.trigger,
        conditions: workflow.conditions,
        actions: workflow.actions,
        autonomy: workflow.autonomy,
        ...(workflow.graph ? { graph: workflow.graph } : {}),
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workflow.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function importWorkflowFile(file: File) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as {
        name?: string;
        description?: string;
        definition?: {
          trigger: WorkflowTrigger;
          conditions: ConditionGroup;
          actions: WorkflowAction[];
          autonomy: WorkflowAutonomy;
          graph?: WorkflowGraph | null;
        };
      };
      if (!parsed.name || !parsed.definition) {
        setActionError('Invalid workflow file — expected { name, definition }.');
        return;
      }
      const fakeRecord: WorkflowRecord = {
        id: '',
        name: parsed.name,
        description: parsed.description ?? null,
        enabled: true,
        notifyOnError: false,
        trigger: parsed.definition.trigger,
        conditions: parsed.definition.conditions ?? { op: 'and', rules: [] },
        actions: parsed.definition.actions ?? [],
        autonomy: parsed.definition.autonomy ?? 'draft',
        graph: parsed.definition.graph ?? null,
        lastRunAt: null,
        lastRunStatus: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const formState = recordToFormState(fakeRecord);
      setComposerInitial({ ...formState, name: `${formState.name} (imported)` });
      setEditingId(null);
      setComposer('new');
      setActionError('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setActionError("Couldn't read the file — make sure it's a valid JSON workflow export.");
    }
  }

  function closeComposer() {
    setComposer(null);
    setComposerInitial(undefined);
    setEditingId(null);
    setActionError('');
  }

  async function createWorkflow(payload: { name: string; description?: string; definition: WorkflowDefinition; enabled: boolean; notifyOnError?: boolean }) {
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
      if (payload.enabled) {
        toast.success('Workflow is live!', {
          description: `"${payload.name}" will run on its trigger.`,
          duration: 5000,
        });
      } else {
        toast.success('Workflow saved as draft', {
          description: `"${payload.name}" is paused — turn it on when ready.`,
          duration: 5000,
        });
      }
    } catch {
      setActionError("Network hiccup. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function saveEdit(
    id: string,
    payload: { name: string; description?: string; definition: WorkflowDefinition; enabled: boolean; notifyOnError?: boolean },
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

  async function renameWorkflow(id: string, name: string) {
    // Optimistic rename — feels instant.
    setWorkflows((ws) => ws.map((w) => (w.id === id ? { ...w, name } : w)));
    try {
      const res = await fetch(`${API_BASE}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        // Revert on failure.
        const data = await res.json().catch(() => ({}));
        setActionError(data.error || "Couldn't rename the workflow.");
        // Reload to get the true name back.
        const reload = await fetch(API_BASE);
        if (reload.ok) {
          const d = await reload.json();
          setWorkflows(Array.isArray(d.workflows) ? (d.workflows as WorkflowRecord[]) : []);
        }
      }
    } catch {
      setActionError("Network hiccup — rename didn't save.");
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
      // Drop the deleted row from any bulk selection so the sticky bar can't
      // keep counting (and operating on) a workflow that no longer exists.
      setSelectedIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (editingId === id) setEditingId(null);
      toast.success('Workflow deleted');
    } catch {
      setActionError("Couldn't delete the workflow.");
    } finally {
      setBusyId(null);
    }
  }

  async function bulkSetEnabled(enabled: boolean) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      // Track per-id outcome — an HTTP error is a failure even though fetch
      // resolves, so a 500 must not read as "N workflows turned on".
      const results = await Promise.all(
        ids.map((id) =>
          fetch(`${API_BASE}/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled }),
          }).then(async (res) => {
            if (!res.ok) return { id, ok: false };
            const data = await res.json();
            setWorkflows((ws) => ws.map((w) => (w.id === id ? (data as WorkflowRecord) : w)));
            return { id, ok: true };
          }).catch(() => ({ id, ok: false })),
        ),
      );
      const failed = results.filter((r) => !r.ok);
      // Keep only the failed rows selected so a retry targets exactly them.
      setSelectedIds(new Set(failed.map((r) => r.id)));
      const okCount = ids.length - failed.length;
      if (failed.length === 0) {
        toast.success(enabled ? `${okCount} workflow${okCount > 1 ? 's' : ''} turned on` : `${okCount} workflow${okCount > 1 ? 's' : ''} paused`);
      } else {
        setActionError(`${failed.length} of ${ids.length} couldn't be updated — they're still selected, try again.`);
      }
    } catch {
      setActionError('Bulk action failed. Try again.');
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      const results = await Promise.all(
        ids.map((id) =>
          fetch(`${API_BASE}/${id}`, { method: 'DELETE' }).then((res) => {
            if (!res.ok) return { id, ok: false };
            setWorkflows((ws) => ws.filter((w) => w.id !== id));
            if (editingId === id) setEditingId(null);
            return { id, ok: true };
          }).catch(() => ({ id, ok: false })),
        ),
      );
      const failed = results.filter((r) => !r.ok);
      setSelectedIds(new Set(failed.map((r) => r.id)));
      const okCount = ids.length - failed.length;
      if (failed.length === 0) {
        toast.success(`${okCount} workflow${okCount > 1 ? 's' : ''} deleted`);
      } else {
        setActionError(`${failed.length} of ${ids.length} couldn't be deleted — they're still selected, try again.`);
      }
    } catch {
      setActionError('Bulk delete failed. Try again.');
    } finally {
      setBulkBusy(false);
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

  async function loadGlobalHistory() {
    setGlobalRunsLoading(true);
    setGlobalRunsError(false);
    try {
      const res = await fetch(`${API_BASE}/runs`);
      if (!res.ok) throw new Error('load failed');
      const data = await res.json();
      setGlobalRuns(Array.isArray(data.runs) ? (data.runs as GlobalRun[]) : []);
    } catch {
      setGlobalRunsError(true);
    } finally {
      setGlobalRunsLoading(false);
    }
  }

  function switchTab(tab: 'workflows' | 'history') {
    setActiveTab(tab);
    if (tab === 'history' && globalRuns === null && !globalRunsLoading) {
      void loadGlobalHistory();
    }
  }

  // Global keyboard shortcuts — only fire when no input/textarea is focused.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const inInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;
      if (inInput) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === 'n') {
        e.preventDefault();
        openBlank();
      } else if (e.key === '/') {
        e.preventDefault();
        switchTab('workflows');
        setTimeout(() => searchInputRef.current?.focus(), 50);
      } else if (e.key === '?') {
        e.preventDefault();
        setShowShortcuts((v) => !v);
      } else if (e.key === 'Escape') {
        if (showShortcuts) setShowShortcuts(false);
        else if (composer !== null) closeComposer();
        else if (editingId !== null) setEditingId(null);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composer, showShortcuts, editingId]);

  if (loading) {
    return (
      <ul className="mx-auto w-full max-w-5xl divide-y divide-border/60">
        {[1, 2, 3, 4].map((i) => (
          <li key={i} className="flex items-center gap-3 py-3">
            <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
            <div className="flex-1 min-w-0 space-y-1.5">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-xl tracking-tight font-semibold text-foreground mb-1">
          Couldn&apos;t load your workflows.
        </p>
        <p className="text-sm text-muted-foreground">Usually temporary.</p>
        <button
          type="button"
          onClick={() => void loadWorkflows()}
          className="mt-4 inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {actionError && (
        <p className="mx-auto w-full max-w-5xl text-sm text-destructive">{actionError}</p>
      )}

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
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[160px] flex-1">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                ref={searchInputRef}
                placeholder="Search"
                className="h-9 w-full bg-background pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {(['all', 'on', 'off'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusFilter(value)}
                  className={cn(
                    'rounded-full px-2.5 py-1 capitalize',
                    statusFilter === value
                      ? 'bg-foreground text-background'
                      : 'hover:bg-foreground/[0.05] hover:text-foreground',
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => switchTab(activeTab === 'history' ? 'workflows' : 'history')}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {activeTab === 'history' ? 'Back to list' : 'History'}
            </button>
            <Button size="sm" onClick={openBlank}>
              New
            </Button>
          </div>
        </div>
      ) : null}

      {workflows.length === 0 && composer === null ? (
        <StarterList onPick={pickTemplate} onScratch={openBlank} />
      ) : workflows.length === 0 ? null : activeTab === 'history' ? (
        <div className="mx-auto w-full max-w-5xl">
          <GlobalHistoryPanel
            runs={globalRuns}
            loading={globalRunsLoading}
            error={globalRunsError}
            statusFilter={globalRunsStatusFilter}
            onStatusFilter={setGlobalRunsStatusFilter}
            onRefresh={() => void loadGlobalHistory()}
            onNavigate={(workflowId) => {
              setActiveTab('workflows');
              // Clear list filters first — the target row doesn't exist in the DOM
              // if the active search/status/trigger filter hides it, and the
              // scroll would silently no-op.
              setSearchQuery('');
              setStatusFilter('all');
              setTriggerFilter('all');
              setActionError('');
              setTimeout(() => {
                document.getElementById(`workflow-${workflowId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, 50);
            }}
          />
        </div>
      ) : (
        <>
          {/* Editing builder — floats above the row list so the list rhythm stays intact */}
          {editingId && (() => {
            const editing = workflows.find((w) => w.id === editingId);
            return editing ? (
              <div
                id={`workflow-${editingId}`}
                className="rounded-xl border border-border/60 bg-card p-4 scroll-mt-24"
              >
                <WorkflowBuilder
                  initial={recordToFormState(editing)}
                  initialEnabled={editing.enabled}
                  initialNotifyOnError={editing.notifyOnError}
                  saving={busyId === editingId}
                  workflowId={editingId}
                  lastRunAt={editing.lastRunAt}
                  lastRunStatus={editing.lastRunStatus}
                  onSave={(payload) => saveEdit(editingId, payload)}
                  onCancel={() => setEditingId(null)}
                />
              </div>
            ) : null;
          })()}

          {/* Browse column — list + selection chrome at People's width; the
              editing builder above intentionally spans the full frame. */}
          <div className="space-y-6">
          <>
            {/* Rows */}
            {filteredWorkflows.length > 0 ? (
              <ul className="divide-y divide-border/60">
                {filteredWorkflows.map((workflow) => (
                  <WorkflowRow
                    key={workflow.id}
                    workflow={workflow}
                    highlighted={highlightedAnchor === `workflow-${workflow.id}`}
                    editing={editingId === workflow.id}
                    busy={busyId === workflow.id}
                    testing={testingId === workflow.id}
                    testResult={testResults[workflow.id]}
                    selected={false}
                    onSelect={() => undefined}
                    onEdit={() => {
                      setEditingId(workflow.id);
                      setComposer(null);
                      setActionError('');
                    }}
                    onCancelEdit={() => setEditingId(null)}
                    onSave={(payload) => saveEdit(workflow.id, payload)}
                    onToggle={() => toggleWorkflow(workflow)}
                    onTest={() => testWorkflow(workflow.id)}
                    onDismissTest={() => setTestResults((r) => {
                      const next = { ...r };
                      delete next[workflow.id];
                      return next;
                    })}
                    onDuplicate={() => duplicateWorkflow(workflow)}
                    onExport={() => exportWorkflow(workflow)}
                    onDelete={() => deleteWorkflow(workflow.id)}
                    onRename={(name) => renameWorkflow(workflow.id, name)}
                  />
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-12 h-12 rounded-full bg-foreground/[0.04] flex items-center justify-center mb-4">
                  <Search size={20} className="text-muted-foreground/60" strokeWidth={1.5} />
                </div>
                <p className="text-xl tracking-tight font-semibold text-foreground mb-1">
                  No matches.
                </p>
                <p className="text-sm text-muted-foreground">
                  Try a shorter query or clear filters.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                    setTriggerFilter('all');
                  }}
                  className="mt-4 inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
                >
                  <X size={13} /> Clear filters
                </button>
              </div>
            )}
          </>

          </div>
        </>
      )}

      {/* Keyboard shortcuts modal */}
      {showShortcuts && (
        <KeyboardShortcutsModal onClose={() => setShowShortcuts(false)} />
      )}
    </div>
  );
}

// ── Keyboard shortcuts modal ──────────────────────────────────────────────────

const SHORTCUTS = [
  { key: 'n', description: 'New workflow' },
  { key: '/', description: 'Focus search' },
  { key: '?', description: 'Show / hide shortcuts' },
  { key: 'Esc', description: 'Close builder / modal' },
];

function KeyboardShortcutsModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-72 rounded-xl border border-border/60 bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Keyboard shortcuts</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground/60 hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>
        <ul className="space-y-2">
          {SHORTCUTS.map((s) => (
            <li key={s.key} className="flex items-center justify-between gap-4">
              <span className="text-[13px] text-muted-foreground">{s.description}</span>
              <kbd className="flex-shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                {s.key}
              </kbd>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[11px] text-muted-foreground/50">
          Shortcuts only fire when no text field is focused.
        </p>
      </div>
    </div>
  );
}

// ── Trigger type → icon + accent ─────────────────────────────────────────────

// Monochrome per docs/ui/STYLESHEET.md — trigger/action type is carried by the
// adjacent label (a word), not by color. Every chip reads the same neutral way.
const NEUTRAL_CHIP = 'bg-muted text-muted-foreground';

const TRIGGER_ICON_MAP: Record<string, { icon: LucideIcon; cls: string }> = {
  lead_score_threshold: { icon: Target, cls: NEUTRAL_CHIP },
  inbound_message: { icon: MessageCircle, cls: NEUTRAL_CHIP },
  integration_event: { icon: Plug, cls: NEUTRAL_CHIP },
  deal_stage_changed: { icon: TrendingUp, cls: NEUTRAL_CHIP },
  schedule: { icon: Clock, cls: NEUTRAL_CHIP },
  lead_created: { icon: UserPlus, cls: NEUTRAL_CHIP },
  tour_completed: { icon: Home, cls: NEUTRAL_CHIP },
  webhook: { icon: Webhook, cls: NEUTRAL_CHIP },
  deal_created: { icon: Building2, cls: NEUTRAL_CHIP },
  contact_updated: { icon: RefreshCw, cls: NEUTRAL_CHIP },
};

const TRIGGER_LABEL_MAP: Record<string, string> = {
  lead_created: 'New lead created',
  lead_score_threshold: 'Lead score threshold reached',
  inbound_message: 'Inbound message received',
  integration_event: 'External integration event',
  deal_stage_changed: 'Deal stage changed',
  tour_completed: 'Tour completed',
  schedule: 'Scheduled time',
  webhook: 'Incoming webhook',
  deal_created: 'New deal created',
  contact_updated: 'Contact record updated',
};

const ACTION_LABEL_MAP: Record<string, string> = {
  draft_message: 'Draft message',
  schedule_message: 'Schedule message',
  create_task: 'Create task',
  call_integration: 'Call integration',
  run_chippi: 'Run AI (Chippi)',
  delay: 'Wait / Delay',
  filter: 'Filter (condition gate)',
  formatter: 'Format text',
  webhook_post: 'Send webhook',
  update_lead: 'Update contact',
  notify_agent: 'Push notification',
  iterate: 'Loop / Iterate',
  branch: 'Paths (branch)',
  run_workflow: 'Run sub-workflow',
  lookup_table: 'Lookup table',
  set_variable: 'Set variable',
  get_variable: 'Get variable',
};

// ── Action type → icon ───────────────────────────────────────────────────────

const ACTION_ICON_MAP: Record<string, { icon: LucideIcon; cls: string }> = {
  draft_message:    { icon: PencilLine,   cls: NEUTRAL_CHIP },
  schedule_message: { icon: Clock,        cls: NEUTRAL_CHIP },
  create_task:      { icon: CheckSquare,  cls: NEUTRAL_CHIP },
  call_integration: { icon: Plug,         cls: NEUTRAL_CHIP },
  run_chippi:       { icon: Sparkles,     cls: NEUTRAL_CHIP },
  delay:            { icon: Clock,        cls: NEUTRAL_CHIP },
  filter:           { icon: Filter,       cls: NEUTRAL_CHIP },
  formatter:        { icon: Wand2,        cls: NEUTRAL_CHIP },
  webhook_post:     { icon: Webhook,      cls: NEUTRAL_CHIP },
  update_lead:      { icon: UserPlus,     cls: NEUTRAL_CHIP },
  notify_agent:     { icon: BellRing,     cls: NEUTRAL_CHIP },
  iterate:          { icon: RotateCcw,    cls: NEUTRAL_CHIP },
  branch:           { icon: GitBranch,    cls: NEUTRAL_CHIP },
  run_workflow:     { icon: WorkflowIcon, cls: NEUTRAL_CHIP },
  lookup_table:     { icon: Table2,       cls: NEUTRAL_CHIP },
  set_variable:     { icon: Variable,     cls: NEUTRAL_CHIP },
  get_variable:     { icon: Variable,     cls: NEUTRAL_CHIP },
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
  void trigger; // the trigger reads on the line above; this shows the steps
  if (actions.length === 0) return null;
  const visibleActions = actions.slice(0, 5);
  const overflow = actions.length - visibleActions.length;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground">
      {visibleActions.map((a, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {i > 0 && <span className="text-muted-foreground/40" aria-hidden>→</span>}
          <span className="rounded border border-border/70 px-1.5 py-px">
            {ACTION_TYPE_LABELS[a.type] ?? a.type.replace(/_/g, ' ')}
          </span>
        </span>
      ))}
      {overflow > 0 && <span className="text-muted-foreground/60">+{overflow} more</span>}
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
      className="mt-1 inline-flex max-w-full items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground transition-colors hover:bg-muted/70"
    >
      <Webhook size={9} aria-hidden className="flex-shrink-0" />
      <span className="truncate">{url}</span>
      {copied ? (
        <Check size={9} className="flex-shrink-0 text-muted-foreground" aria-hidden />
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
  selected: _selected,
  onSelect: _onSelect,
  onEdit,
  onCancelEdit: _onCancelEdit,
  onSave: _onSave,
  onToggle,
  onTest,
  onDismissTest,
  onDuplicate,
  onExport,
  onDelete,
  onRename,
}: {
  workflow: WorkflowRecord;
  highlighted: boolean;
  editing: boolean;
  busy: boolean;
  testing: boolean;
  testResult: TestResult | undefined;
  selected: boolean;
  onSelect: (v: boolean) => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (payload: { name: string; description?: string; definition: WorkflowDefinition; enabled: boolean; notifyOnError?: boolean }) => void;
  onToggle: () => void;
  onTest: () => void;
  onDismissTest: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [renamingName, setRenamingName] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

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

  function startRename() {
    setRenamingName(workflow.name);
    // Focus the input on the next paint.
    setTimeout(() => renameInputRef.current?.select(), 0);
  }

  function commitRename() {
    const trimmed = renamingName?.trim() ?? '';
    setRenamingName(null);
    if (!trimmed || trimmed === workflow.name) return;
    onRename(trimmed);
  }

  const summary = summarizeWorkflow(workflow.trigger, workflow.conditions, workflow.actions);
  const hasExpansion = !!(testResult || showHistory);

  return (
    <li
      // While editing, the floating builder card above the list carries this id —
      // suppress it here so the document never has two identical ids and deep-link
      // scroll/highlight resolves to the builder (the active surface).
      id={editing ? undefined : `workflow-${workflow.id}`}
      className={cn(
        'group/row py-3 px-2 -mx-2 rounded-md transition-colors scroll-mt-24',
        'hover:bg-muted/30',
        !workflow.enabled && 'opacity-60',
        highlighted && 'bg-muted/40 ring-2 ring-inset ring-foreground/20',
        // Mark the row if it is being edited (builder is above the list).
        editing && 'bg-muted/30',
      )}
    >
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          {renamingName !== null ? (
            <input
              ref={renameInputRef}
              type="text"
              value={renamingName}
              onChange={(e) => setRenamingName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                if (e.key === 'Escape') setRenamingName(null);
              }}
              maxLength={120}
              className="min-w-0 flex-1 rounded border border-ring bg-background px-1.5 py-0.5 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
              autoFocus
            />
          ) : (
            <span
              className="truncate text-sm font-medium text-foreground cursor-text"
              onDoubleClick={startRename}
              title="Double-click to rename"
            >
              {workflow.name}
            </span>
          )}
          {workflow.enabled ? (
            <span className="inline-flex flex-shrink-0 items-center rounded px-1 py-px text-[10px] font-semibold uppercase tracking-wider text-foreground/70 bg-foreground/[0.06]">
              On
            </span>
          ) : (
            <span className="inline-flex flex-shrink-0 items-center rounded px-1 py-px text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 bg-muted/60">
              Paused
            </span>
          )}
          {workflow.actions.length > 0 && (
            <span className="hidden sm:inline-flex flex-shrink-0 items-center rounded-full bg-muted/60 px-1.5 py-px text-[10px] tabular-nums text-muted-foreground/60">
              {workflow.actions.length} {workflow.actions.length === 1 ? 'step' : 'steps'}
            </span>
          )}
          {workflow.enabled &&
            workflow.actions.length === 0 &&
            (!workflow.graph || workflow.graph.nodes.every((n) => n.kind !== 'action')) && (
            <span
              title="Workflow is on but has no actions — add at least one step"
              className="hidden sm:inline-flex flex-shrink-0 items-center rounded border border-border px-1.5 py-px text-[10px] font-medium text-muted-foreground"
            >
              No steps
            </span>
          )}
        </div>

        {/* Trigger label · description/summary — single truncating line, like People's email·phone line */}
        <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground truncate">
          <span className="truncate">{triggerLabel(workflow.trigger)}</span>
          {workflow.description ? (
            <>
              <span className="text-muted-foreground/40 flex-shrink-0">·</span>
              <span className="truncate not-italic">{workflow.description}</span>
            </>
          ) : workflow.trigger.type !== 'webhook' ? (
            <>
              <span className="text-muted-foreground/40 flex-shrink-0">·</span>
              <span className="truncate">{summary}</span>
            </>
          ) : null}
        </div>
        {!workflow.description && workflow.trigger.type === 'webhook' && (
          <div className="mt-0.5">
            <WebhookUrlChip workflowId={workflow.id} />
          </div>
        )}
        {/* Run health + counts — secondary metadata line, People's realtor-byline slot */}
        <div className="mt-0.5 flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5">
            <RunHealthChip status={workflow.lastRunStatus} />
            {workflow.lastRunAt ? (
              <span className="tabular-nums text-[11px] text-muted-foreground/70">
                {timeAgo(workflow.lastRunAt)}
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground/40">Never run</span>
            )}
          </span>
          {/* Autonomy — shown only when it departs from the safe default, so a
              workflow that sends without review is visibly different at a glance. */}
          {workflow.autonomy !== 'draft' && <AutonomyPill autonomy={workflow.autonomy} />}
          {typeof workflow.runCount === 'number' && workflow.runCount > 0 && (
            <span
              title={`${workflow.runCount.toLocaleString()} total run${workflow.runCount === 1 ? '' : 's'}`}
              className="inline-flex items-center gap-0.5 rounded bg-muted/70 px-1 py-px text-[10px] tabular-nums text-muted-foreground/70"
            >
              <Activity size={8} aria-hidden />
              {workflow.runCount.toLocaleString()}
            </span>
          )}
          {workflow.updatedAt !== workflow.createdAt && (
            <span className="text-[10px] text-muted-foreground/40" title={`Modified: ${new Date(workflow.updatedAt).toLocaleString()}`}>
              Edited {timeAgo(workflow.updatedAt)}
            </span>
          )}
        </div>
      </div>

      {/* Right cluster: toggle + actions — People's metadata-on-the-right slot */}
      <div className="flex items-center gap-2 flex-shrink-0 pt-1">
        <Switch
          checked={workflow.enabled}
          onCheckedChange={onToggle}
          aria-label={workflow.enabled ? 'Pause workflow' : 'Resume workflow'}
        />
        <div className="flex items-center gap-0.5">
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
                icon={Download}
                label="Export JSON"
                onClick={onExport}
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
    </div>

      {/* Full-width expansion panels — span the row below the flex layout */}
      {hasExpansion && (
        <div className="border-t border-border/40 px-3 pb-3 pt-2 mt-2 space-y-2">
          {/* Test-run result — the "prove it works" panel. */}
          {testResult && <TestResultPanel result={testResult} workflow={workflow} onDismiss={onDismissTest} />}

          {/* Run history (audit trail) — what fired, when, and what each step did. */}
          {showHistory && (
            <RunHistoryPanel runs={runs} loading={runsLoading} error={runsError} workflowId={workflow.id} />
          )}
        </div>
      )}
    </li>
  );
}

// ── Run history panel ────────────────────────────────────────────────────────

function RunHistoryPanel({
  runs,
  loading,
  error,
  workflowId,
}: {
  runs: WorkflowRun[] | null;
  loading: boolean;
  error: boolean;
  workflowId: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="mb-2.5 flex items-center justify-between">
        <p className={SECTION_LABEL}>Run history</p>
        {runs && runs.length > 0 && (
          <span className="text-[11px] text-muted-foreground/60">
            Last {runs.length} run{runs.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <Loader2 size={13} className="animate-spin" />
          Loading runs…
        </div>
      ) : error ? (
        <p className={CAPTION}>Couldn&apos;t load the run history — try again in a moment.</p>
      ) : !runs || runs.length === 0 ? (
        <div className="flex flex-col items-center py-4 text-center">
          <History size={22} className="mb-1.5 text-muted-foreground/30" />
          <p className={CAPTION}>No runs yet — this workflow hasn&apos;t fired.</p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {runs.map((run) => (
            <RunHistoryItem key={run.id} run={run} workflowId={workflowId} />
          ))}
        </ul>
      )}
    </div>
  );
}

const ACTION_TYPE_LABELS: Record<string, string> = {
  draft_message: 'Draft message',
  schedule_message: 'Schedule message',
  create_task: 'Create task',
  call_integration: 'Call integration',
  run_chippi: 'Run Chippi',
  formatter: 'Format data',
  delay: 'Delay',
  filter: 'Filter',
  webhook_post: 'Webhook POST',
  update_lead: 'Update lead',
  notify_agent: 'Push alert',
  condition: 'Condition check',
  iterate: 'Loop / Iterate',
  branch: 'Paths (branch)',
  run_workflow: 'Run sub-workflow',
  lookup_table: 'Lookup table',
  set_variable: 'Set variable',
  get_variable: 'Get variable',
};

function RunHistoryItem({ run, workflowId }: { run: WorkflowRun; workflowId: string }) {
  const [open, setOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const hasSteps = run.steps.length > 0;

  async function retryRun(e: React.MouseEvent) {
    e.stopPropagation();
    setRetrying(true);
    try {
      const res = await fetch(`${API_BASE}/${workflowId}/test-run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        toast.success('Re-run triggered', { description: 'Check the test panel above for results.' });
      } else {
        toast.error('Re-run failed — try again.');
      }
    } catch {
      toast.error('Re-run failed — try again.');
    } finally {
      setRetrying(false);
    }
  }

  const durationMs =
    run.finishedAt ? new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime() : null;
  const durationLabel =
    durationMs === null ? null
    : durationMs < 1000 ? `${durationMs}ms`
    : `${(durationMs / 1000).toFixed(1)}s`;

  return (
    <li className="overflow-hidden rounded-lg border border-border/50 bg-card/40">
      {/* Run header row — flex wrapper so the retry button can sit outside the toggle */}
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={() => hasSteps && setOpen((o) => !o)}
          disabled={!hasSteps}
          className={cn(
            'flex flex-1 items-center gap-2.5 px-3 py-2.5 text-left',
            hasSteps && 'transition-colors hover:bg-foreground/[0.03]',
            !hasSteps && 'cursor-default',
          )}
        >
          {/* Status icon */}
          <span
            className={cn(
              'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full',
              run.status === 'completed' && 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400',
              run.status === 'failed' && 'bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400',
              run.status === 'skipped' && 'bg-muted text-muted-foreground',
              run.status === 'running' && 'bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400',
            )}
            aria-hidden
          >
            {run.status === 'completed' && <Check size={11} strokeWidth={2.5} />}
            {run.status === 'failed' && <X size={11} strokeWidth={2.5} />}
            {run.status === 'skipped' && <ArrowUpDown size={9} />}
            {run.status === 'running' && <Loader2 size={10} className="animate-spin" />}
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className={cn(
                'text-[12.5px] font-medium',
                run.status === 'completed' && 'text-foreground',
                run.status === 'failed' && 'text-rose-600 dark:text-rose-400',
                run.status === 'running' && 'text-amber-700 dark:text-amber-400',
                run.status === 'skipped' && 'text-muted-foreground',
              )}>
                {run.status === 'completed' ? 'Completed' : run.status === 'failed' ? 'Failed' : run.status === 'running' ? 'Running' : 'Skipped'}
              </span>
              <span className="text-[11px] text-muted-foreground/60">
                {timeAgo(run.startedAt)}
              </span>
              {durationLabel && (
                <span className="text-[11px] tabular-nums text-muted-foreground/50">
                  · {durationLabel}
                </span>
              )}
              {hasSteps && (
                <span className="ml-auto text-[11px] text-muted-foreground/50">
                  {run.steps.length} step{run.steps.length !== 1 ? 's' : ''}
                </span>
              )}
            </span>
            {(run.error || run.summary) && (
              <span className="mt-0.5 block truncate text-[11.5px] leading-snug text-muted-foreground/80">
                {run.error ?? run.summary}
              </span>
            )}
          </span>

          {hasSteps && (
            <ChevronRight
              size={13}
              aria-hidden
              className={cn(
                'flex-shrink-0 text-muted-foreground/40 transition-transform',
                open && 'rotate-90',
              )}
            />
          )}
        </button>

        {/* Retry button — only visible on failed runs */}
        {run.status === 'failed' && (
          <button
            type="button"
            onClick={retryRun}
            disabled={retrying}
            aria-label="Retry this run"
            title="Re-run this workflow (test mode)"
            className="flex flex-shrink-0 flex-col items-center justify-center gap-0.5 border-l border-border/40 px-2.5 text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
          >
            {retrying
              ? <Loader2 size={11} className="animate-spin" />
              : <RotateCcw size={11} />
            }
            <span className="text-[9px] font-medium">Retry</span>
          </button>
        )}
      </div>

      {/* Expanded detail — trigger event + step timeline */}
      {open && hasSteps && (
        <div className="border-t border-border/40 bg-muted/10 px-3 py-2.5">
          {/* Trigger data — "Data In" panel, mirrors Zapier's trigger step */}
          {((): React.ReactNode => {
            if (!run.triggerEvent || typeof run.triggerEvent !== 'object' || Array.isArray(run.triggerEvent)) return null;
            const ev = run.triggerEvent as Record<string, unknown>;
            const entries = Object.entries(ev).filter(([, v]) => v !== undefined && v !== null).slice(0, 6);
            if (entries.length === 0) return null;
            return (
              <div className="mb-3">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">Trigger data</p>
                <dl className="overflow-hidden rounded-md border border-border/40 bg-background/60 text-[11px]">
                  {entries.map(([k, v], i) => (
                    <div key={k} className={cn('flex items-start gap-2 px-2.5 py-1', i !== entries.length - 1 && 'border-b border-border/30')}>
                      <dt className="w-24 flex-shrink-0 font-medium capitalize text-muted-foreground/70">{k.replace(/_/g, ' ')}</dt>
                      <dd className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-foreground/70">
                        {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })()}
          <ul className="relative space-y-0">
            {run.steps.map((step, idx) => {
              const isLast = idx === run.steps.length - 1;
              const ai = step.actionType ? ACTION_ICON_MAP[step.actionType] : null;
              const AIcon = ai?.icon;
              return (
                <li key={step.id} className="relative flex gap-3 pb-3 last:pb-0">
                  {/* Vertical connector line */}
                  {!isLast && (
                    <span
                      aria-hidden
                      className="absolute left-[9px] top-5 w-px bg-border/50"
                      style={{ height: 'calc(100% - 4px)' }}
                    />
                  )}
                  {/* Step status dot */}
                  <span
                    className={cn(
                      'relative z-10 mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[9px]',
                      step.status === 'ok' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400',
                      step.status === 'failed' && 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400',
                      step.status === 'skipped' && 'bg-muted text-muted-foreground',
                    )}
                    aria-label={step.status}
                  >
                    {step.status === 'ok' && <Check size={9} strokeWidth={2.5} />}
                    {step.status === 'failed' && <X size={9} strokeWidth={2.5} />}
                    {step.status === 'skipped' && <span>–</span>}
                  </span>
                  {/* Step info */}
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex items-center gap-1.5">
                      {AIcon && (
                        <span className={cn('flex h-4 w-4 flex-shrink-0 items-center justify-center rounded', ai!.cls)}>
                          <AIcon size={9} aria-hidden />
                        </span>
                      )}
                      <span className="text-[12px] font-medium text-foreground">
                        {ACTION_TYPE_LABELS[step.actionType ?? step.kind] ?? (step.actionType ?? step.kind)}
                      </span>
                      <span className={cn(
                        'text-[10px] font-medium uppercase tracking-wide',
                        step.status === 'ok' && 'text-emerald-600 dark:text-emerald-400',
                        step.status === 'failed' && 'text-rose-600 dark:text-rose-400',
                        step.status === 'skipped' && 'text-muted-foreground',
                      )}>
                        {step.status === 'ok' ? 'OK' : step.status === 'failed' ? 'Error' : 'Skipped'}
                      </span>
                    </div>
                    <StepDetailTable detail={step.detail} actionType={step.actionType} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </li>
  );
}

/**
 * Rich key-value display for a step's output detail — mirrors Zapier's
 * per-step data panel in Zap History. Shows the most relevant fields for
 * each action type in a scannable pill-row layout.
 */
function StepDetailTable({ detail, actionType }: { detail: unknown; actionType: string | null }) {
  if (detail == null || typeof detail !== 'object') return null;
  const obj = detail as Record<string, unknown>;

  type Row = { key: string; value: string };
  const rows: Row[] = [];

  function add(key: string, value: unknown) {
    if (value === undefined || value === null) return;
    const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (str.trim()) rows.push({ key, value: str.trim() });
  }

  if (actionType === 'formatter') {
    add('operation', obj.operation);
    add('input', obj.inputResolved ?? obj.input);
    add('output', obj.output);
  } else if (actionType === 'draft_message' || actionType === 'schedule_message') {
    add('channel', obj.channel);
    add('recipient', obj.recipient);
    add('summary', obj.summary);
    if (obj.error) add('error', obj.error);
  } else if (actionType === 'create_task') {
    add('title', obj.title);
    add('due', obj.dueAt);
    if (obj.error) add('error', obj.error);
  } else if (actionType === 'run_chippi') {
    add('summary', obj.summary);
    if (obj.error) add('error', obj.error);
  } else if (actionType === 'call_integration') {
    add('toolkit', obj.toolkit);
    add('action', obj.action);
    if (obj.error) add('error', obj.error);
  } else if (actionType === 'delay') {
    add('waited', obj.waited ?? obj.delayMinutes);
  } else if (actionType === 'filter') {
    add('field', obj.field);
    add('result', obj.passed !== undefined ? (obj.passed ? 'passed' : 'blocked') : undefined);
    if (obj.reason) add('reason', obj.reason);
  } else if (actionType === 'webhook_post') {
    add('url', obj.url);
    add('status', obj.statusCode);
    add('response', obj.responseSnippet);
    if (obj.error) add('error', obj.error);
  } else if (actionType === 'update_lead') {
    add('field', obj.field);
    add('value', obj.value ?? obj.tag ?? obj.days);
    if (obj.followUpAt) add('followUpAt', obj.followUpAt);
    if (obj.error) add('error', obj.error);
  } else if (actionType === 'notify_agent') {
    add('title', obj.title);
    if (obj.body) add('body', obj.body);
    add('sent', obj.sent !== undefined ? `${obj.sent} device${obj.sent === 1 ? '' : 's'}` : undefined);
    if (obj.note) add('note', obj.note);
  } else if (actionType === 'iterate') {
    add('processed', obj.processed !== undefined ? `${obj.processed} of ${obj.total}` : undefined);
    if (obj.failed) add('failed', obj.failed);
    if (obj.error) add('error', obj.error);
  } else if (actionType === 'branch') {
    add('path taken', obj.pathTaken != null ? String(obj.pathTaken) : 'none matched');
    if (obj.stepsRun !== undefined) add('steps run', obj.stepsRun);
    if (obj.reason) add('reason', obj.reason);
  } else if (actionType === 'run_workflow') {
    add('workflow', obj.workflowId);
    add('run', obj.runId);
    add('status', obj.status);
    if (obj.error) add('error', obj.error);
  } else if (actionType === 'lookup_table') {
    add('input', obj.input);
    add('matched', obj.matched !== undefined ? (obj.matched ? `yes (${obj.matchedKey})` : 'no') : undefined);
    add('output', obj.output);
  } else if (actionType === 'set_variable' || actionType === 'get_variable') {
    add('name', obj.name);
    add('value', obj.value);
    if (obj.found !== undefined) add('found', obj.found ? 'yes' : 'no (default used)');
  } else {
    for (const [k, v] of Object.entries(obj).slice(0, 4)) {
      if (typeof v !== 'object') add(k, v);
    }
  }

  if (rows.length === 0) return null;

  return (
    <dl className="mt-1 flex flex-col gap-0.5">
      {rows.map(({ key, value }) => (
        <div key={key} className="flex items-start gap-1.5 text-[11px]">
          <dt className="min-w-[52px] flex-shrink-0 font-medium text-muted-foreground/60 capitalize">{key}</dt>
          <dd className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-foreground/70">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ── Global History Panel (cross-workflow activity feed) ──────────────────────

function GlobalHistoryPanel({
  runs,
  loading,
  error,
  statusFilter,
  onStatusFilter,
  onRefresh,
  onNavigate,
}: {
  runs: GlobalRun[] | null;
  loading: boolean;
  error: boolean;
  statusFilter: 'all' | 'completed' | 'failed';
  onStatusFilter: (f: 'all' | 'completed' | 'failed') => void;
  onRefresh: () => void;
  onNavigate: (workflowId: string) => void;
}) {
  const [historySearch, setHistorySearch] = useState('');

  const filtered = useMemo(() => {
    if (!runs) return [];
    let list = statusFilter === 'all' ? runs : runs.filter((r) => r.status === statusFilter);
    const q = historySearch.trim().toLowerCase();
    if (q) list = list.filter((r) => r.workflowName.toLowerCase().includes(q) || (r.error ?? r.summary ?? '').toLowerCase().includes(q));
    return list;
  }, [runs, statusFilter, historySearch]);

  return (
    <div className="space-y-3">
      {/* History toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by workflow name…"
            className="pl-9 h-9 w-full bg-background border-border/70"
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1.5">
          {(
            [
              { value: 'all' as const, label: 'All' },
              { value: 'completed' as const, label: 'Completed' },
              { value: 'failed' as const, label: 'Failed' },
            ]
          ).map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => onStatusFilter(f.value)}
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
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-[12px] font-medium text-muted-foreground hover:bg-muted/80 hover:text-foreground disabled:opacity-50 transition-colors"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
          Refresh
        </button>
      </div>

      {/* History table */}
      <div className="rounded-xl border border-border/60 overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[auto_1fr_140px_120px] border-b border-border/60 bg-muted/40 px-4 py-2">
          <div />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Workflow
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Status
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            When
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-[13px] text-muted-foreground">
            <Loader2 size={16} className="animate-spin" />
            Loading history…
          </div>
        ) : error ? (
          <div className="flex flex-col items-center py-12 text-center">
            <p className="text-sm text-muted-foreground">Couldn&apos;t load history — try refreshing.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <History size={30} className="mb-2 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">
              {statusFilter === 'all' ? "No workflow runs yet." : `No ${statusFilter} runs.`}
            </p>
            {statusFilter === 'all' && (
              <p className="mt-1 text-[12px] text-muted-foreground/60">
                Runs appear here when a trigger fires or you test a workflow.
              </p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {filtered.map((run) => (
              <GlobalRunRow key={run.id} run={run} onNavigate={onNavigate} />
            ))}
          </div>
        )}
      </div>

      {runs && runs.length > 0 && (
        <p className="text-right text-[11px] text-muted-foreground/50">
          Showing last {runs.length} run{runs.length !== 1 ? 's' : ''} across all workflows
        </p>
      )}
    </div>
  );
}

function GlobalRunRow({
  run,
  onNavigate,
}: {
  run: GlobalRun;
  onNavigate: (workflowId: string) => void;
}) {
  const durationMs =
    run.finishedAt ? new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime() : null;
  const durationLabel =
    durationMs === null ? null
    : durationMs < 1000 ? `${durationMs}ms`
    : `${(durationMs / 1000).toFixed(1)}s`;

  return (
    <div className="grid grid-cols-[auto_1fr_140px_120px] items-center gap-0 px-4 py-2.5 transition-colors hover:bg-muted/20">
      {/* Status dot */}
      <div className="pr-3">
        <span
          className={cn(
            'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full',
            run.status === 'completed' && 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400',
            run.status === 'failed' && 'bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400',
            run.status === 'skipped' && 'bg-muted text-muted-foreground',
            run.status === 'running' && 'bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400',
          )}
          aria-hidden
        >
          {run.status === 'completed' && <Check size={10} strokeWidth={2.5} />}
          {run.status === 'failed' && <X size={10} strokeWidth={2.5} />}
          {run.status === 'skipped' && <span className="text-[9px]">–</span>}
          {run.status === 'running' && <Loader2 size={9} className="animate-spin" />}
        </span>
      </div>

      {/* Workflow name + summary */}
      <div className="min-w-0 pr-3">
        <button
          type="button"
          onClick={() => onNavigate(run.workflowId)}
          className="group flex items-center gap-1 text-left"
          title="Go to workflow"
        >
          <span className="truncate text-[13px] font-medium text-foreground transition-colors">
            {run.workflowName}
          </span>
          <ArrowRight size={11} className="flex-shrink-0 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" aria-hidden />
        </button>
        {(run.error || run.summary) && (
          <p className="mt-0.5 truncate text-[11px] leading-snug text-muted-foreground/70">
            {run.error ?? run.summary}
          </p>
        )}
      </div>

      {/* Status + duration */}
      <div className="flex items-center gap-1.5 pr-2">
        <span className={cn(
          'text-[12px] font-medium',
          run.status === 'completed' && 'text-emerald-600 dark:text-emerald-400',
          run.status === 'failed' && 'text-rose-600 dark:text-rose-400',
          run.status === 'running' && 'text-amber-600 dark:text-amber-400',
          run.status === 'skipped' && 'text-muted-foreground',
        )}>
          {run.status === 'completed' ? 'Completed'
            : run.status === 'failed' ? 'Failed'
            : run.status === 'running' ? 'Running'
            : 'Skipped'}
        </span>
        {durationLabel && (
          <span className="text-[11px] tabular-nums text-muted-foreground/50">· {durationLabel}</span>
        )}
      </div>

      {/* Time */}
      <span className="text-[12px] text-muted-foreground/70 tabular-nums">
        {timeAgo(run.startedAt)}
      </span>
    </div>
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

function TestResultPanel({
  result,
  workflow,
  onDismiss,
}: {
  result: TestResult;
  workflow: WorkflowRecord;
  onDismiss: () => void;
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
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss test result"
          title="Dismiss"
          className="ml-auto flex h-5 w-5 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
        >
          <X size={12} aria-hidden />
        </button>
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
                {ACTION_TYPE_LABELS[step.actionType ?? step.kind] ?? (step.actionType ?? step.kind)}
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
    autonomy === 'draft' ? 'Drafts' : autonomy === 'notify' ? 'Draft + notify' : 'Autonomous';
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

/** Icon per template — gives each card a visual identity. */
const TEMPLATE_META: Record<string, { icon: LucideIcon }> = {
  'hot-lead-instant-draft': {
    icon: Zap,
  },
  'gmail-client-reply': {
    icon: Mail,
  },
  'morning-follow-ups': {
    icon: Sun,
  },
  'tour-completed-thanks': {
    icon: Home,
  },
  'new-lead-welcome': {
    icon: UserPlus,
  },
  'deal-stage-changed-notify': {
    icon: TrendingUp,
  },
  'inbound-inquiry-multi-step': {
    icon: MessageCircle,
  },
  'hot-vs-warm-branch': {
    icon: GitBranch,
  },
  'webhook-any-service': {
    icon: Webhook,
  },
  'offer-received': {
    icon: TrendingUp,
  },
  'contract-signed-checklist': {
    icon: CheckSquare,
  },
  'weekly-pipeline-review': {
    icon: Sun,
  },
  'lead-gone-cold': {
    icon: Target,
  },
  'first-contact-drip': {
    icon: ArrowRight,
  },
  'price-drop-alert': {
    icon: TrendingUp,
  },
  'high-intent-call-reminder': {
    icon: Zap,
  },
  'saturday-open-house-prep': {
    icon: Home,
  },
  'monthly-market-update': {
    icon: Mail,
  },
  'buyer-pre-approval-nudge': {
    icon: Target,
  },
  'evening-task-wrap': {
    icon: Clock,
  },
  'stale-leads-weekly-sweep': {
    icon: RotateCcw,
  },
  'inspection-stage-update': {
    icon: CheckSquare,
  },
  'new-lead-survey-drip': {
    icon: MessageCircle,
  },
  'post-showing-feedback': {
    icon: Home,
  },
  'referral-thank-you': {
    icon: UserPlus,
  },
  'slack-new-lead-alert': {
    icon: Plug,
  },
  'inbound-email-auto-ack': {
    icon: Mail,
  },
  'hot-lead-push-alert': {
    icon: BellRing,
  },
  'deal-stage-push-alert': {
    icon: BellRing,
  },
  'post-close-30day-checkin': {
    icon: Home,
  },
  'offer-accepted-celebration': {
    icon: Sparkles,
  },
  'facebook-lead-funnel': {
    icon: Target,
  },
  'end-of-month-pipeline-close': {
    icon: TrendingUp,
  },
  'new-deal-welcome-packet': {
    icon: Building2,
  },
  'new-deal-push-alert': {
    icon: BellRing,
  },
  'contact-updated-score-check': {
    icon: RefreshCw,
  },
  'contact-updated-zapier-webhook': {
    icon: Webhook,
  },
};

const TEMPLATE_META_DEFAULT = {
  icon: WorkflowIcon,
};

/**
 * Zapier-style template preview modal: shows trigger + conditions + actions
 * before the user commits to opening the builder. Clicking "Use template"
 * calls onPick which pre-fills the builder.
 */
function TemplatePreviewModal({
  template,
  onUse,
  onClose,
}: {
  template: import('./templates').WorkflowTemplate;
  onUse: () => void;
  onClose: () => void;
}) {
  const meta = TEMPLATE_META[template.id] ?? TEMPLATE_META_DEFAULT;
  const Icon = meta.icon;
  const triggerInfo = TRIGGER_ICON_MAP[template.state.trigger.type];
  const TriggerIcon = triggerInfo?.icon ?? WorkflowIcon;
  const triggerLabel = TRIGGER_LABEL_MAP[template.state.trigger.type] ?? template.state.trigger.type.replace(/_/g, ' ');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview: ${template.name}`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      {/* Panel */}
      <div className="relative z-10 flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header — plain, no accent fill or icon */}
        <div className="flex items-start gap-4 border-b border-border px-5 py-5">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold leading-snug text-foreground">{template.name}</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground leading-snug">{template.description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
            aria-label="Close preview"
          >
            <X size={14} aria-hidden />
          </button>
        </div>

        {/* Step-by-step flow */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            How it works
          </p>

          {/* Trigger row */}
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <span className={cn('flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg', triggerInfo?.cls ?? 'bg-muted text-muted-foreground')}>
                <TriggerIcon size={14} aria-hidden />
              </span>
              {(template.state.conditions.length > 0 || template.state.actions.length > 0) && (
                <span className="mt-1 w-px flex-1 bg-border/50 min-h-[16px]" aria-hidden />
              )}
            </div>
            <div className="pb-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">Trigger</p>
              <p className="text-[13px] font-medium text-foreground">{triggerLabel}</p>
            </div>
          </div>

          {/* Conditions (if any) — flat ConditionRowState[] from the form state */}
          {template.state.conditions.length > 0 && (
            <div className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Filter size={13} aria-hidden />
                </span>
                {template.state.actions.length > 0 && (
                  <span className="mt-1 w-px flex-1 bg-border/50 min-h-[16px]" aria-hidden />
                )}
              </div>
              <div className="pb-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">
                  Only if ({(template.state.conditionOp ?? 'and').toUpperCase()})
                </p>
                <ul className="mt-0.5 space-y-0.5">
                  {template.state.conditions.filter((c): c is ConditionRowState => !('type' in c && c.type === 'group')).slice(0, 3).map((cond, i) => (
                    <li key={i} className="text-[12.5px] text-muted-foreground">
                      {`${cond.field.replace(/_/g, ' ')} ${cond.operator} ${String(cond.value).slice(0, 30)}`}
                    </li>
                  ))}
                  {template.state.conditions.length > 3 && (
                    <li className="text-[12px] text-muted-foreground/60">
                      +{template.state.conditions.length - 3} more
                    </li>
                  )}
                </ul>
              </div>
            </div>
          )}

          {/* Actions — flat ActionRowState[] from the form state */}
          {template.state.actions.map((action, i) => {
            const ai = ACTION_ICON_MAP[action.type];
            const ActionIcon = ai?.icon ?? WorkflowIcon;
            const isLast = i === template.state.actions.length - 1;
            const label = ACTION_LABEL_MAP[action.type] ?? action.type.replace(/_/g, ' ');
            const detail = (() => {
              if (action.type === 'draft_message' || action.type === 'schedule_message') {
                return `Via ${(action.channel ?? 'email').toUpperCase()}`;
              }
              if (action.type === 'create_task' && action.title) {
                return `"${action.title.slice(0, 40)}"`;
              }
              if (action.type === 'delay' && action.delayMinutes) {
                const n = Number(action.delayMinutes);
                const unit = action.delayUnit ?? 'minutes';
                if (unit === 'days') return `Wait ${n} day${n !== 1 ? 's' : ''}`;
                if (unit === 'hours') return `Wait ${n} hour${n !== 1 ? 's' : ''}`;
                if (n >= 1440) return `Wait ${Math.round(n / 1440)} day(s)`;
                if (n >= 60) return `Wait ${Math.round(n / 60)} hour(s)`;
                return `Wait ${n} minute${n !== 1 ? 's' : ''}`;
              }
              if (action.type === 'webhook_post' && action.webhookUrl) {
                try { return new URL(action.webhookUrl).hostname; } catch { return action.webhookUrl.slice(0, 40); }
              }
              if (action.type === 'update_lead' && action.updateField) {
                return `Set ${action.updateField.replace(/_/g, ' ')}`;
              }
              if (action.type === 'notify_agent' && action.notifyTitle) {
                return `"${action.notifyTitle.slice(0, 40)}"`;
              }
              return null;
            })();
            return (
              <div key={i} className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <span className={cn('flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg', ai?.cls ?? 'bg-muted text-muted-foreground')}>
                    <ActionIcon size={13} aria-hidden />
                  </span>
                  {!isLast && <span className="mt-1 w-px flex-1 bg-border/50 min-h-[16px]" aria-hidden />}
                </div>
                <div className={cn('pb-3', isLast && 'pb-0')}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">
                    Step {i + 1}
                  </p>
                  <p className="text-[13px] font-medium text-foreground">{label}</p>
                  {detail && <p className="text-[12px] text-muted-foreground">{detail}</p>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-border/60 px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onUse}
            className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-[13px] font-semibold text-background transition-opacity hover:opacity-80"
          >
            <Zap size={13} aria-hidden />
            Use this template
          </button>
        </div>
      </div>
    </div>
  );
}

function StarterList({
  onPick,
  onScratch,
}: {
  onPick: (state: WorkflowFormState) => void;
  onScratch: () => void;
}) {
  const starters = WORKFLOW_TEMPLATES.filter((t) => t.popular).slice(0, 5);
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <p className="text-[15px] font-medium text-foreground">Start with one you already do by hand.</p>
        <p className={CAPTION}>Pick a starter, read the steps, then turn it on. Or start blank.</p>
      </div>
      <ul className="divide-y divide-border/60">
        {starters.map((template) => (
          <li key={template.id}>
            <button
              type="button"
              onClick={() => onPick(cloneTemplateState(template))}
              className="flex w-full items-start justify-between gap-4 py-3 text-left hover:bg-muted/30 -mx-2 px-2 rounded-md"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{template.name}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{template.description}</span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">Use</span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onScratch}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        Start blank
      </button>
    </div>
  );
}

/**
 * Zero-state front door — large visual template cards that look like Zapier's
 * template gallery. Each card shows what gets automated in plain language so
 * the realtor picks based on outcome, not on technical detail.
 */
const CATEGORY_PILLS: Array<{ value: 'all' | TemplateCategory; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'New leads', label: 'New leads' },
  { value: 'Follow-up', label: 'Follow-up' },
  { value: 'Scheduling', label: 'Scheduling' },
  { value: 'Integrations', label: 'Integrations' },
];

// Monochrome per docs/ui/STYLESHEET.md — the category name is the label; no
// per-category color.
const CATEGORY_BADGE_CLS: Record<TemplateCategory, string> = {
  'New leads': 'bg-muted text-muted-foreground',
  'Follow-up': 'bg-muted text-muted-foreground',
  'Scheduling': 'bg-muted text-muted-foreground',
  'Integrations': 'bg-muted text-muted-foreground',
};

function TemplateGallery({
  onPick,
  onScratch,
}: {
  onPick: (state: WorkflowFormState) => void;
  onScratch: () => void;
}) {
  const reduce = useReducedMotion();
  const [q, setQ] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | TemplateCategory>('all');
  const [previewTemplate, setPreviewTemplate] = useState<import('./templates').WorkflowTemplate | null>(null);

  const visibleTemplates = useMemo(() => {
    const query = q.trim().toLowerCase();
    const filtered = WORKFLOW_TEMPLATES.filter((t) => {
      const matchesSearch =
        !query ||
        t.name.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query);
      const matchesCategory = categoryFilter === 'all' || t.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
    // Popular templates float to the top (stable sort — preserves relative order within each group)
    return [...filtered].sort((a, b) => (b.popular ? 1 : 0) - (a.popular ? 1 : 0));
  }, [q, categoryFilter]);

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <p className="text-[15px] font-medium text-foreground">
          What should Chippi handle for you?
        </p>
        <p className={cn(CAPTION, 'flex items-center gap-1.5')}>
          <span>{WORKFLOW_TEMPLATES.length} ready-made automations — pick one, see exactly what it does, then turn it on.</span>
        </p>
      </div>

      {/* Search + category filter row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1 max-w-sm">
          <Search
            size={14}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Search templates…"
            className="pl-9 h-9 w-full bg-background border-border/70"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_PILLS.map((pill) => {
            const count =
              pill.value === 'all'
                ? WORKFLOW_TEMPLATES.length
                : WORKFLOW_TEMPLATES.filter((t) => t.category === pill.value).length;
            return (
              <button
                key={pill.value}
                type="button"
                onClick={() => setCategoryFilter(pill.value)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  categoryFilter === pill.value
                    ? 'bg-foreground text-background'
                    : 'bg-muted text-muted-foreground hover:bg-foreground/10 hover:text-foreground',
                )}
              >
                {pill.label}
                <span className="ml-1 opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {visibleTemplates.length === 0 ? (
        <p className={cn(CAPTION, 'py-4 text-center')}>
          No templates match{q ? <> <span className="font-medium text-foreground">{q}</span></> : null}{categoryFilter !== 'all' ? <> in <span className="font-medium text-foreground">{categoryFilter}</span></> : null} — try adjusting your filters.
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
              const triggerInfo = TRIGGER_ICON_MAP[template.state.trigger.type];
              const triggerLabel = TRIGGER_LABEL_MAP[template.state.trigger.type] ?? template.state.trigger.type.replace(/_/g, ' ');
              return (
                <motion.li key={template.id} variants={reduce ? undefined : STAGGER_ITEM} className="flex">
                  <button
                    type="button"
                    onClick={() => setPreviewTemplate(template)}
                    className="group/card flex h-full w-full flex-col gap-1.5 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-foreground/25"
                  >
                    <div className="flex items-start gap-2">
                      <span className="block flex-1 text-sm font-semibold leading-snug text-foreground">
                        {template.name}
                      </span>
                      {template.popular && (
                        <span className="flex-shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Popular
                        </span>
                      )}
                    </div>
                    <span className="block flex-1 text-[13px] leading-relaxed text-muted-foreground">
                      {template.description}
                    </span>
                    <div className="mt-2 flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-muted-foreground/60">
                      <span className="truncate">
                        {triggerLabel} · {template.state.actions.length} step{template.state.actions.length !== 1 ? 's' : ''} · {template.category}
                      </span>
                      <span className="flex-shrink-0 transition-colors group-hover/card:text-foreground/80">
                        Preview
                      </span>
                    </div>
                  </button>
                </motion.li>
              );
            })}
          </motion.ul>

          <div className="flex items-center justify-center gap-3 pt-2 border-t border-border/40">
            <span className={CAPTION}>Don&apos;t see what you need?</span>
            <button
              type="button"
              onClick={onScratch}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1 text-xs font-medium text-foreground transition-colors hover:border-foreground/30 hover:bg-foreground/[0.03]"
            >
              <Plus size={12} aria-hidden />
              Build from scratch
            </button>
          </div>
        </>
      )}

      {/* Template preview modal */}
      {previewTemplate && (
        <TemplatePreviewModal
          template={previewTemplate}
          onUse={() => {
            onPick(cloneTemplateState(previewTemplate));
            setPreviewTemplate(null);
          }}
          onClose={() => setPreviewTemplate(null)}
        />
      )}
    </div>
  );
}

// ── AI workflow generator ────────────────────────────────────────────────────

let aiGenSeq = 0;
function aiGenRowId(): string {
  aiGenSeq += 1;
  return `aigen-${aiGenSeq}`;
}

/**
 * Zapier-style AI workflow generator: type what you want to automate in plain
 * English, get a pre-filled builder. Calls POST /api/workflows/generate and maps
 * the LLM response into a WorkflowFormState the builder can open with.
 */
function AIWorkflowGenerator({
  onGenerate,
}: {
  onGenerate: (state: WorkflowFormState) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function generate() {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/workflows/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Generation failed — try again.');
        return;
      }
      const raw = data.workflow as Record<string, unknown>;
      if (!raw || typeof raw !== 'object') {
        setError('Unexpected response — try again.');
        return;
      }

      // Map the LLM response to a WorkflowFormState
      const t = (raw.trigger ?? {}) as Record<string, unknown>;
      const rawActions = Array.isArray(raw.actions) ? (raw.actions as Record<string, unknown>[]) : [];
      const rawConditions = Array.isArray(raw.conditions) ? (raw.conditions as Record<string, unknown>[]) : [];

      const formState: WorkflowFormState = {
        name: typeof raw.name === 'string' ? raw.name : trimmed.slice(0, 60),
        description: typeof raw.description === 'string' ? raw.description : undefined,
        trigger: {
          type: (typeof t.type === 'string' ? t.type : 'lead_created') as WorkflowFormState['trigger']['type'],
          min: typeof t.min === 'string' ? t.min : typeof t.min === 'number' ? String(t.min) : '',
          channel: (typeof t.channel === 'string' ? t.channel : 'any') as 'sms' | 'email' | 'any',
          toolkit: typeof t.toolkit === 'string' ? t.toolkit : '',
          event: typeof t.event === 'string' ? t.event : '',
          toStage: typeof t.toStage === 'string' ? t.toStage : '',
          cadence: (typeof t.cadence === 'string' ? t.cadence : 'daily') as 'hourly' | 'daily' | 'weekdays',
          hour: typeof t.hour === 'string' ? t.hour : typeof t.hour === 'number' ? String(t.hour) : '',
          timezone: typeof t.timezone === 'string' ? t.timezone : '',
        },
        conditionOp: raw.conditionOp === 'or' ? 'or' : 'and',
        conditions: rawConditions.map((c) => ({
          id: aiGenRowId(),
          field: typeof c.field === 'string' ? c.field : '',
          operator: (typeof c.operator === 'string' ? c.operator : 'eq') as ConditionRowState['operator'],
          value: typeof c.value === 'string' ? c.value : typeof c.value === 'number' ? String(c.value) : '',
        })),
        actions: rawActions.map((a) => ({
          id: aiGenRowId(),
          type: (typeof a.type === 'string' ? a.type : 'draft_message') as WorkflowFormState['actions'][number]['type'],
          label: typeof a.label === 'string' ? a.label : undefined,
          retryCount: '3',
          stepEnabled: true,
          channel: (typeof a.channel === 'string' ? a.channel : 'email') as 'sms' | 'email',
          instruction: typeof a.instruction === 'string' ? a.instruction : '',
          delayMinutes: typeof a.delayMinutes === 'string' ? a.delayMinutes : typeof a.delayMinutes === 'number' ? String(a.delayMinutes) : '',
          delayUnit: 'minutes' as const,
          delayMode: (typeof a.delayMode === 'string' ? a.delayMode : 'relative') as 'relative' | 'until_weekday' | 'until_date',
          untilWeekday: typeof a.untilWeekday === 'number' ? String(a.untilWeekday) : '1',
          untilHour: typeof a.untilHour === 'number' ? String(a.untilHour) : '9',
          untilDate: typeof a.untilDate === 'string' ? a.untilDate : '',
          title: typeof a.title === 'string' ? a.title : '',
          dueInDays: typeof a.dueInDays === 'string' ? a.dueInDays : typeof a.dueInDays === 'number' ? String(a.dueInDays) : '',
          toolkit: typeof a.toolkit === 'string' ? a.toolkit : '',
          action: typeof a.action === 'string' ? a.action : '',
          paramsJson: '',
          filterField: typeof a.filterField === 'string' ? a.filterField : '',
          filterOperator: (typeof a.filterOperator === 'string' ? a.filterOperator : 'eq') as WorkflowFormState['actions'][number]['filterOperator'],
          filterValue: typeof a.filterValue === 'string' ? a.filterValue : '',
          formatterInput: typeof a.input === 'string' ? a.input : '',
          formatterOperation: (typeof a.operation === 'string' ? a.operation : 'uppercase') as WorkflowFormState['actions'][number]['formatterOperation'],
          formatterFind: typeof a.find === 'string' ? a.find : '',
          formatterReplace: typeof a.replacement === 'string' ? a.replacement : '',
          formatterFormat: typeof a.format === 'string' ? a.format : 'MM/DD/YYYY',
          formatterToFixed: typeof a.toFixed === 'string' ? a.toFixed : typeof a.toFixed === 'number' ? String(a.toFixed) : '',
          formatterFallback: typeof a.fallback === 'string' ? a.fallback : '',
          formatterTruncateLength: typeof a.truncateLength === 'number' ? String(a.truncateLength) : '',
          formatterTruncateSuffix: typeof a.truncateSuffix === 'string' ? a.truncateSuffix : '',
          formatterSplitSeparator: typeof a.splitSeparator === 'string' ? a.splitSeparator : '',
          formatterSplitIndex: typeof a.splitIndex === 'number' ? String(a.splitIndex) : '',
          formatterRegexPattern: typeof a.regexPattern === 'string' ? a.regexPattern : '',
          formatterRegexFlags: typeof a.regexFlags === 'string' ? a.regexFlags : '',
          subWorkflowId: typeof a.workflowId === 'string' ? a.workflowId : '',
          lookupInput: typeof a.lookupInput === 'string' ? a.lookupInput : '',
          lookupEntriesJson: Array.isArray(a.entries) ? JSON.stringify(a.entries) : '',
          lookupFallback: typeof a.lookupFallback === 'string' ? a.lookupFallback : '',
          varName: typeof a.varName === 'string' ? a.varName : '',
          varValue: typeof a.varValue === 'string' ? a.varValue : '',
          varDefault: typeof a.varDefault === 'string' ? a.varDefault : '',
          webhookUrl: typeof a.webhookUrl === 'string' ? a.webhookUrl : '',
          webhookBody: typeof a.webhookBody === 'string' ? a.webhookBody : '',
          webhookHeaders: typeof a.webhookHeaders === 'string' ? a.webhookHeaders : '',
          updateField: (typeof a.updateField === 'string' ? a.updateField : 'score_label') as WorkflowFormState['actions'][number]['updateField'],
          updateValue: typeof a.updateValue === 'string' ? a.updateValue : '',
          notifyTitle: typeof a.notifyTitle === 'string' ? a.notifyTitle : '',
          notifyBody: typeof a.notifyBody === 'string' ? a.notifyBody : '',
        })),
        autonomy: (['draft', 'notify', 'auto'] as const).includes(raw.autonomy as WorkflowAutonomy)
          ? (raw.autonomy as WorkflowAutonomy)
          : 'draft',
        graph: null,
      };

      onGenerate(formState);
    } catch {
      setError('Network error — try again.');
    } finally {
      setBusy(false);
    }
  }

  const EXAMPLE_PROMPTS = [
    'Send a welcome email when a new lead is created',
    'Remind me to call when a lead score exceeds 80',
    'Follow up 2 days after a tour is completed',
    'Create a task when a deal moves to offer stage',
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <p className="text-sm font-semibold text-foreground">Build with AI</p>
        <span className="rounded-full border border-border px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
          Beta
        </span>
      </div>
      <p className={cn(CAPTION, 'mb-3')}>
        Describe what you want to automate in plain English. Chippi will build the workflow for you to review and edit.
      </p>

      <div className="flex gap-2">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !busy) void generate(); }}
          placeholder="e.g. Send a follow-up text 3 days after a tour…"
          maxLength={400}
          disabled={busy}
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-orange-400/40 disabled:opacity-60 dark:bg-input/30"
        />
        <button
          type="button"
          onClick={() => void generate()}
          disabled={busy || !prompt.trim()}
          className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {busy ? 'Generating…' : 'Generate'}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {EXAMPLE_PROMPTS.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => { setPrompt(ex); }}
            disabled={busy}
            className="rounded-full border border-orange-200/80 bg-white/80 px-2.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-orange-400/60 hover:text-foreground disabled:opacity-50 dark:border-orange-800/30 dark:bg-orange-950/20"
          >
            {ex}
          </button>
        ))}
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
  const [q, setQ] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | TemplateCategory>('all');
  const [previewTemplate, setPreviewTemplate] = useState<import('./templates').WorkflowTemplate | null>(null);

  const visibleTemplates = useMemo(() => {
    const query = q.trim().toLowerCase();
    const filtered = WORKFLOW_TEMPLATES.filter((t) => {
      const matchesSearch =
        !query ||
        t.name.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query);
      const matchesCategory = categoryFilter === 'all' || t.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
    return [...filtered].sort((a, b) => (b.popular ? 1 : 0) - (a.popular ? 1 : 0));
  }, [q, categoryFilter]);

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

      {/* AI generator — prominent hero above the template grid */}
      <AIWorkflowGenerator onGenerate={onPick} />

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border/40" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-card px-3 text-[11px] text-muted-foreground/50">or start from a template</span>
        </div>
      </div>

      {/* Search + category pills */}
      <div className="space-y-2">
        <div className="relative max-w-sm">
          <Search
            size={14}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Search templates…"
            className="pl-9 h-9 w-full bg-background border-border/70"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_PILLS.map((pill) => {
            const count =
              pill.value === 'all'
                ? WORKFLOW_TEMPLATES.length
                : WORKFLOW_TEMPLATES.filter((t) => t.category === pill.value).length;
            return (
              <button
                key={pill.value}
                type="button"
                onClick={() => setCategoryFilter(pill.value)}
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
                  categoryFilter === pill.value
                    ? 'bg-foreground text-background'
                    : 'bg-muted text-muted-foreground hover:bg-foreground/10 hover:text-foreground',
                )}
              >
                {pill.label}
                <span className="ml-1 opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {visibleTemplates.length === 0 ? (
        <p className={cn(CAPTION, 'py-4 text-center')}>
          No templates match{q ? <> <span className="font-medium text-foreground">{q}</span></> : null}{categoryFilter !== 'all' ? <> in <span className="font-medium text-foreground">{categoryFilter}</span></> : null} — try adjusting your filters.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {visibleTemplates.map((template) => {
            return (
              <li key={template.id} className="flex">
                <button
                  type="button"
                  onClick={() => setPreviewTemplate(template)}
                  className="group/tpl flex h-full w-full flex-col gap-1 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-foreground/25"
                >
                  <div className="flex items-start gap-2">
                    <span className="block flex-1 text-sm font-semibold leading-snug text-foreground">
                      {template.name}
                    </span>
                    {'category' in template && (
                      <span className="flex-shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {template.category}
                      </span>
                    )}
                  </div>
                  <span className="block flex-1 text-[12px] leading-relaxed text-muted-foreground">
                    {template.description}
                  </span>
                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground/60">
                    <span>{template.popular ? 'Popular' : 'Template'}</span>
                    <span className="transition-colors group-hover/tpl:text-foreground/80">Preview</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Template preview modal */}
      {previewTemplate && (
        <TemplatePreviewModal
          template={previewTemplate}
          onUse={() => {
            onPick(cloneTemplateState(previewTemplate));
            setPreviewTemplate(null);
          }}
          onClose={() => setPreviewTemplate(null)}
        />
      )}
    </div>
  );
}
