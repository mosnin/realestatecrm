'use client';

/**
 * WorkSessionDialog — launch a background work session, with the per-run
 * controls ChatGPT-Work made table stakes: how autonomous the run is
 * (plan-first vs just-go) and whether it may pause to ask ONE clarifying
 * question. Opened from the composer's /work command.
 */

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function WorkSessionDialog({
  slug, conversationId, open, onOpenChange, onStarted, workspaceRunsEnabled = false,
}: {
  slug: string;
  conversationId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStarted?: (session?: { kind?: string; workspaceRunId?: string | null }) => void;
  workspaceRunsEnabled?: boolean;
}) {
  const [goal, setGoal] = useState('');
  const [autonomy, setAutonomy] = useState<'plan_first' | 'just_go'>('plan_first');
  const [allowQuestions, setAllowQuestions] = useState(true);
  const [kind, setKind] = useState<'research' | 'workspace'>('research');
  const workspaceEnabled = workspaceRunsEnabled;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function start() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/work-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, goal, autonomy, allowQuestions, conversationId, kind }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; session?: { kind?: string; workspaceRunId?: string | null } };
      if (!res.ok) {
        setError(data.error || "Couldn't start the session.");
        return;
      }
      setGoal('');
      onOpenChange(false);
      onStarted?.(data.session);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Start a work session</DialogTitle>
          <DialogDescription>
            Chippi plans the steps, works through them in the background, and comes back with a
            finished report — you can leave and it keeps going.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="What should Chippi work on? e.g. “Prep me for the Henderson listing appointment — comps, pricing story, and talking points.”"
            rows={3}
            autoFocus
          />

          {/* Per-run autonomy — the check-in contract for THIS run. */}
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { v: 'plan_first', label: 'Plan first', desc: 'Show me the plan; I approve before it runs' },
                { v: 'just_go', label: 'Just go', desc: 'Plan and run without stopping' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.v}
                type="button"
                onClick={() => setAutonomy(opt.v)}
                className={cn(
                  'rounded-lg border p-2.5 text-left transition-colors',
                  autonomy === opt.v ? 'border-foreground bg-accent/40' : 'border-border hover:bg-accent/20',
                )}
              >
                <p className="text-[13px] font-medium text-foreground">{opt.label}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{opt.desc}</p>
              </button>
            ))}
          </div>
          {workspaceEnabled && <div className="space-y-1.5"><p className="text-[11px] font-medium text-muted-foreground">Run type</p><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setKind('research')} className={cn('rounded-lg border p-2.5 text-left transition-colors', kind === 'research' ? 'border-foreground bg-accent/40' : 'border-border hover:bg-accent/20')}><p className="text-[13px] font-medium text-foreground">Research session</p><p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">Read, analyze, and return a report.</p></button><button type="button" onClick={() => setKind('workspace')} className={cn('rounded-lg border p-2.5 text-left transition-colors', kind === 'workspace' ? 'border-foreground bg-accent/40' : 'border-border hover:bg-accent/20')}><p className="text-[13px] font-medium text-foreground">Workspace Run</p><p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">Build a multi-file packet in an isolated workspace.</p></button></div></div>}

          <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <input
              type="checkbox"
              checked={allowQuestions}
              onChange={(e) => setAllowQuestions(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border"
            />
            Chippi may pause once to ask a clarifying question
          </label>

          <p className="text-[11px] leading-snug text-muted-foreground/80">
            {kind === 'workspace' ? 'Workspace Runs create private packet files in an isolated VM. They never send messages or change records.' : 'Sessions research and analyze — they never send messages or change records. Actions come'}
            {kind === 'workspace' ? '' : ' back as recommendations in the report.'}
          </p>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={start} disabled={busy || goal.trim().length < 10}>
            {busy ? <Loader2 className="animate-spin" /> : 'Start session'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
