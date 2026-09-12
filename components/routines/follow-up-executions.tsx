'use client';
import { useEffect, useState } from 'react';
import type { FollowUpState } from '@/lib/convex/follow-up-pilot';
type Execution = { jobId: string; routineId: string; scheduledFor: string; state: FollowUpState };
const labels: Record<FollowUpState, string> = { queued: 'Queued', running: 'Running', completed: 'Run completed', failed: 'Run failed', skipped: 'Skipped', uncertain: 'Needs attention' };
export function FollowUpExecutions() {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const response = await fetch('/api/routines/executions', { signal: controller.signal });
        if (!response.ok) throw new Error('Unavailable');
        const data = await response.json();
        if (active) { setExecutions(data.executions ?? []); setError(false); }
      } catch { if (active) setError(true); }
    };
    void refresh();
    const interval = setInterval(() => { if (!document.hidden) void refresh(); }, 15_000);
    return () => { active = false; controller.abort(); clearInterval(interval); };
  }, []);
  if (error) return <p role="status" className="text-sm text-muted-foreground">Follow-up execution status is unavailable.</p>;
  if (!executions.length) return null;
  return <section aria-label="Follow-up execution" className="rounded-xl border p-4 space-y-3">
    <h3 className="text-sm font-medium">Follow-up execution</h3>
    {executions.slice(0, 5).map(run => <div key={run.jobId} className="text-sm flex flex-wrap justify-between gap-2">
      <span className="text-muted-foreground">{new Date(run.scheduledFor).toLocaleString()}</span>
      <span>{labels[run.state]}</span>
      {run.state === 'uncertain' && <p className="w-full text-muted-foreground">The result could not be confirmed. This routine is held to prevent duplicate follow-ups; check its activity and delivery records before resuming.</p>}
    </div>)}
    <p className="text-xs text-muted-foreground">Run completion does not confirm message delivery.</p>
  </section>;
}
