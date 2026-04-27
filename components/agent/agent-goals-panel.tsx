'use client';

import { useEffect, useState } from 'react';
import { Target, Plus, CheckCircle2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface AgentGoal {
  id: string;
  goalType: string;
  description: string;
  instructions: string | null;
  status: 'active' | 'completed' | 'cancelled' | 'paused';
  priority: number;
  contactId: string | null;
  dealId: string | null;
  Contact: { id: string; name: string } | null;
  createdAt: string;
  completedAt: string | null;
}

const GOAL_TYPE_CONFIG: Record<string, { label: string; pill: string }> = {
  follow_up_sequence: {
    label: 'Follow-up',
    pill: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  },
  tour_booking: {
    label: 'Tour booking',
    pill: 'bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400',
  },
  offer_progress: {
    label: 'Offer progress',
    pill: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  },
  reengagement: {
    label: 'Re-engagement',
    pill: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  },
  custom: {
    label: 'Custom',
    pill: 'bg-muted text-muted-foreground',
  },
};

const GOAL_TYPE_OPTIONS = [
  { value: 'follow_up_sequence', label: 'Follow-up sequence' },
  { value: 'tour_booking', label: 'Tour booking' },
  { value: 'offer_progress', label: 'Offer progress' },
  { value: 'reengagement', label: 'Re-engagement' },
  { value: 'custom', label: 'Custom' },
] as const;

// ─── GoalRow ───────────────────────────────────────────────────────────────────

function GoalRow({ goal, onAction }: { goal: AgentGoal; onAction: (id: string, status: 'completed' | 'cancelled') => Promise<void> }) {
  const [actioning, setActioning] = useState<'completed' | 'cancelled' | null>(null);
  const cfg = GOAL_TYPE_CONFIG[goal.goalType] ?? GOAL_TYPE_CONFIG.custom;

  async function handleAction(status: 'completed' | 'cancelled') {
    setActioning(status);
    try { await onAction(goal.id, status); }
    finally { setActioning(null); }
  }

  return (
    <div className="flex items-start gap-4 px-5 py-4">
      {/* Left: type + priority */}
      <div className="flex flex-col gap-1.5 flex-shrink-0 pt-0.5">
        <span className={cn('inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap', cfg.pill)}>
          {cfg.label}
        </span>
        {goal.priority > 0 && (
          <span className={cn(
            'text-[10px] font-medium px-1.5 py-0.5 rounded-full text-center',
            goal.priority >= 8
              ? 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400'
              : goal.priority >= 5
              ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400'
              : 'bg-muted text-muted-foreground',
          )}>
            P{goal.priority}
          </span>
        )}
      </div>

      {/* Middle: description + contact */}
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm text-foreground leading-snug">{goal.description}</p>
        {goal.instructions && (
          <p className="text-[12px] text-muted-foreground/80 italic line-clamp-2">{goal.instructions}</p>
        )}
        {goal.Contact && (
          <p className="text-xs text-muted-foreground">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground/40 mr-1.5" aria-hidden="true" />
            {goal.Contact.name}
          </p>
        )}
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={() => void handleAction('completed')}
          disabled={actioning !== null}
          title="Mark as completed"
          className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-emerald-600 hover:border-emerald-300 hover:bg-emerald-50 dark:hover:text-emerald-400 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10 transition-colors disabled:opacity-40"
        >
          <CheckCircle2 size={13} />
        </button>
        <button
          onClick={() => void handleAction('cancelled')}
          disabled={actioning !== null}
          title="Cancel goal"
          className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-red-600 hover:border-red-300 hover:bg-red-50 dark:hover:text-red-400 dark:hover:border-red-500/30 dark:hover:bg-red-500/10 transition-colors disabled:opacity-40"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── NewGoalForm ───────────────────────────────────────────────────────────────

function NewGoalForm({ onSubmit, onCancel }: { onSubmit: (goalType: string, description: string) => Promise<void>; onCancel: () => void }) {
  const [goalType, setGoalType] = useState<string>('follow_up_sequence');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const descriptionTooShort = description.trim().length > 0 && description.trim().length < 10;
  const canSubmit = goalType && description.trim().length >= 10 && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try { await onSubmit(goalType, description.trim()); }
    catch { setError('Failed to create goal. Please try again.'); setSubmitting(false); }
  }

  return (
    <div className="border-t border-border/60 px-5 py-4 bg-muted/20">
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
        <p className="text-xs font-semibold text-foreground uppercase tracking-wide">New goal</p>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
          <div className="space-y-2">
            <select
              value={goalType}
              onChange={(e) => setGoalType(e.target.value)}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {GOAL_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Describe what the agent should accomplish…"
              required
              className={cn(
                'w-full resize-none rounded-lg border bg-background px-3 py-2.5 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring',
                descriptionTooShort && 'border-destructive',
              )}
            />
            {descriptionTooShort && <p className="text-xs text-destructive">At least 10 characters required.</p>}
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={!canSubmit}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-opacity',
              !canSubmit && 'opacity-50 cursor-not-allowed',
            )}
          >
            <Plus size={12} />
            {submitting ? 'Creating…' : 'Create goal'}
          </button>
          <button type="button" onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-2">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── AgentGoalsPanel ───────────────────────────────────────────────────────────

export function AgentGoalsPanel() {
  const [goals, setGoals] = useState<AgentGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/agent/goals?status=active&limit=50');
        if (res.ok) setGoals(await res.json());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleAction(id: string, status: 'completed' | 'cancelled') {
    try {
      const res = await fetch(`/api/agent/goals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setGoals((prev) => prev.filter((g) => g.id !== id));
        if (status === 'completed') toast.success('Goal completed!');
      } else {
        toast.error('Could not update goal — please try again');
        throw new Error('update failed');
      }
    } catch (err) {
      if (!(err instanceof Error && err.message === 'update failed')) {
        toast.error('Could not reach server');
      }
      throw err;
    }
  }

  async function handleCreate(goalType: string, description: string) {
    const res = await fetch('/api/agent/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goalType, description }),
    });
    if (!res.ok) throw new Error('Failed to create goal');
    const created: AgentGoal = await res.json();
    setGoals((prev) => [created, ...prev]);
    setShowForm(false);
  }

  return (
    <section className="rounded-2xl border bg-card overflow-hidden">
      {/* Section header */}
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-border/60">
        <Target size={14} className="text-muted-foreground flex-shrink-0" />
        <h2 className="text-sm font-semibold">Active Goals</h2>
        {!loading && goals.length > 0 && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground min-w-[20px] text-center">
            {goals.length}
          </span>
        )}
        <button
          onClick={() => setShowForm((v) => !v)}
          className={cn(
            'ml-auto inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
            showForm
              ? 'border-primary bg-primary/5 text-primary'
              : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/40',
          )}
        >
          <Plus size={12} />
          New Goal
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="px-5 py-5 space-y-3">
          {[1, 2].map((n) => <div key={n} className="h-16 rounded-xl bg-muted/40 animate-pulse" />)}
        </div>
      )}

      {/* Goal rows */}
      {!loading && goals.length > 0 && (
        <div className="divide-y divide-border/40">
          {goals.map((goal) => (
            <GoalRow key={goal.id} goal={goal} onAction={handleAction} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && goals.length === 0 && !showForm && (
        <div className="flex items-center gap-3.5 px-5 py-8">
          <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
            <Target size={16} className="text-muted-foreground/60" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">No active goals</p>
            <p className="text-xs text-muted-foreground mt-0.5">Goals let you track multi-step objectives the agent should work toward for specific contacts.</p>
          </div>
        </div>
      )}

      {/* New goal form */}
      {showForm && <NewGoalForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />}
    </section>
  );
}
