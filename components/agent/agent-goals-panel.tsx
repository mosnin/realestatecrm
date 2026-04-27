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

// ─── Goal type configuration ──────────────────────────────────────────────────

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

// ─── GoalCard ──────────────────────────────────────────────────────────────────

function GoalCard({
  goal,
  onAction,
}: {
  goal: AgentGoal;
  onAction: (id: string, status: 'completed' | 'cancelled') => Promise<void>;
}) {
  const [actioning, setActioning] = useState<'completed' | 'cancelled' | null>(null);

  const cfg = GOAL_TYPE_CONFIG[goal.goalType] ?? GOAL_TYPE_CONFIG.custom;

  async function handleAction(status: 'completed' | 'cancelled') {
    setActioning(status);
    try {
      await onAction(goal.id, status);
    } finally {
      setActioning(null); // Always clear so buttons re-enable
    }
  }

  return (
    <div className="rounded-xl border bg-card p-4 space-y-2.5">
      {/* Header: type badge + priority badge */}
      <div className="flex items-center gap-2">
        <span className={cn('inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full', cfg.pill)}>
          {cfg.label}
        </span>
        {goal.priority > 0 && (
          <span
            className={cn(
              'text-[10px] font-medium px-1.5 py-0.5 rounded-full',
              goal.priority >= 8
                ? 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400'
                : goal.priority >= 5
                ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400'
                : 'bg-muted text-muted-foreground',
            )}
          >
            P{goal.priority}
          </span>
        )}
      </div>

      {/* Description */}
      <p className="text-sm text-foreground leading-snug">{goal.description}</p>
      {goal.instructions && (
        <p className="text-[12px] text-muted-foreground/80 italic mt-1 line-clamp-2">
          {goal.instructions}
        </p>
      )}

      {/* Contact */}
      {goal.Contact && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-muted flex-shrink-0" aria-hidden="true" />
          {goal.Contact.name}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-0.5">
        <button
          title="Mark as completed"
          onClick={() => void handleAction('completed')}
          disabled={actioning !== null}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
            'text-muted-foreground border-border hover:text-emerald-600 hover:border-emerald-300 hover:bg-emerald-50',
            'dark:hover:text-emerald-400 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10',
            actioning === 'completed' && 'opacity-50 cursor-not-allowed',
          )}
        >
          <CheckCircle2 size={13} />
          Complete
        </button>
        <button
          title="Cancel this goal"
          onClick={() => void handleAction('cancelled')}
          disabled={actioning !== null}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
            'text-muted-foreground border-border hover:text-red-600 hover:border-red-300 hover:bg-red-50',
            'dark:hover:text-red-400 dark:hover:border-red-500/30 dark:hover:bg-red-500/10',
            actioning === 'cancelled' && 'opacity-50 cursor-not-allowed',
          )}
        >
          <X size={13} />
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── NewGoalForm ───────────────────────────────────────────────────────────────

function NewGoalForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (goalType: string, description: string) => Promise<void>;
  onCancel: () => void;
}) {
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
    try {
      await onSubmit(goalType, description.trim());
    } catch {
      setError('Failed to create goal. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="rounded-xl border bg-card p-4 space-y-3"
    >
      <p className="text-sm font-semibold">New goal</p>

      <div className="space-y-1">
        <label htmlFor="goal-type" className="text-xs font-medium text-muted-foreground">
          Goal type
        </label>
        <select
          id="goal-type"
          value={goalType}
          onChange={(e) => setGoalType(e.target.value)}
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {GOAL_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label htmlFor="goal-description" className="text-xs font-medium text-muted-foreground">
          Description <span className="text-muted-foreground/60">(min 10 chars)</span>
        </label>
        <textarea
          id="goal-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Describe what the agent should accomplish…"
          required
          className={cn(
            'w-full resize-none rounded-lg border bg-background px-3 py-2.5 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring',
            descriptionTooShort && 'border-destructive focus:ring-destructive/30',
          )}
        />
        {descriptionTooShort && (
          <p className="text-xs text-destructive">Description must be at least 10 characters.</p>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex items-center gap-2 pt-0.5">
        <button
          type="submit"
          disabled={!canSubmit}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-opacity',
            !canSubmit && 'opacity-50 cursor-not-allowed',
          )}
        >
          <Plus size={13} />
          {submitting ? 'Creating…' : 'Create goal'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-2"
        >
          Cancel
        </button>
      </div>
    </form>
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
        if (status === 'completed') {
          toast.success('Goal completed! 🎉');
        }
      } else {
        toast.error('Could not update goal — please try again');
        throw new Error('update failed'); // Re-throw so GoalCard re-enables buttons
      }
    } catch (err) {
      // Only show network error toast if we didn't already show a server-error toast
      if (!(err instanceof Error && err.message === 'update failed')) {
        toast.error('Could not reach server');
      }
      throw err; // Re-throw so GoalCard's finally block still runs
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target size={16} className="text-muted-foreground" />
          <span className="text-sm font-semibold">Goals</span>
          {!loading && goals.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              {goals.length} active
            </span>
          )}
        </div>
        <button
          title="Create a new goal"
          onClick={() => setShowForm((v) => !v)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
            showForm
              ? 'border-primary bg-primary/5 text-primary'
              : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/40',
          )}
        >
          <Plus size={13} />
          New Goal
        </button>
      </div>

      {/* Inline create form */}
      {showForm && (
        <NewGoalForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-28 rounded-xl bg-muted/40 animate-pulse" />
          ))}
        </div>
      )}

      {/* Goal cards */}
      {!loading && goals.length > 0 && (
        <div className="space-y-3">
          {goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} onAction={handleAction} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && goals.length === 0 && !showForm && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
            <Target size={28} className="text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold text-sm text-foreground">No active goals</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              Goals help the agent track multi-step objectives for your contacts.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
