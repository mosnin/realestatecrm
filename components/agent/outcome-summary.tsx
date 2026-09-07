'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
interface Outcomes { sentMessages: number; completedHandoffs: number; failedRuns: number; overdueCommitments: number }
export function OutcomeSummary({ slug }: { slug: string }) {
  const [outcomes, setOutcomes] = useState<Outcomes | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/agent/health', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error();
      setOutcomes(await response.json());
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, []);
  return <section className="border-t border-border pt-6" aria-label="Work outcomes">
    <h3 className="text-sm font-semibold">Last 7 days</h3>
    <p className="mt-1 text-xs text-muted-foreground">Scheduled messages count after a sending receipt. Handoffs count after an agent records the outcome.</p>
    {error ? <p role="status" className="mt-3 text-sm text-muted-foreground">Outcome counts are unavailable. <Link className="underline" href={`/s/${slug}/chippi/activity`}>Open Activity</Link></p>
      : !outcomes ? <p role="status" className="mt-3 text-sm text-muted-foreground">Loading outcomes…</p>
      : <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4">
        {[['Messages sent', outcomes.sentMessages], ['Handoffs completed', outcomes.completedHandoffs], ['Runs needing attention', outcomes.failedRuns], ['Commitments overdue now', outcomes.overdueCommitments]].map(([label, count]) => <div key={label} className="border-b border-border pb-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-xl font-medium tabular-nums">{count}</dd></div>)}
      </dl>}
  </section>;
}
