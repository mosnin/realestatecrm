import React from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { unscoped } from '@/lib/supabase-guard';
import { BROKER_PANEL } from './premium';

/** Parent page has resolved broker_owner/admin membership for this brokerage. */
export async function AssignmentHandoffs({ brokerageId }: { brokerageId: string }) {
  const { data, error } = await unscoped(supabase.from('ClientCommitment'), 'broker: membership-proved cross-space access')
    .select('id, title, status, dueAt, spaceId, Space:spaceId(name)')
    .eq('brokerageId', brokerageId)
    .in('status', ['open', 'accepted'])
    .order('dueAt', { ascending: true })
    .limit(8);
  return <section className={BROKER_PANEL} aria-label="Lead handoffs">
    <div className="flex items-center justify-between gap-4">
      <div><h2 className="text-base font-semibold">Lead handoffs</h2><p className="mt-1 text-sm text-muted-foreground">Ownership and first-response deadlines across your team.</p></div>
      <Link href="/broker/leads" className="shrink-0 text-sm underline-offset-4 hover:underline">All leads</Link>
    </div>
    {error ? <p role="status" className="mt-4 text-sm text-muted-foreground">Handoff tracking is unavailable. Existing lead assignments remain in Leads.</p>
      : !data?.length ? <p className="mt-4 text-sm text-muted-foreground">No open tracked handoffs. New assignments appear here until the agent records an outcome.</p>
      : <ul className="mt-4 divide-y divide-border">{data.map(item => {
        const overdue = Date.parse(item.dueAt) < Date.now();
        const workspace = item.Space as unknown as { name?: string } | null;
        return <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
          <div><p className="font-medium">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{workspace?.name ?? 'Assigned workspace'} · due {new Date(item.dueAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC</p></div>
          <span className={overdue ? 'text-orange-700 dark:text-orange-300' : 'text-muted-foreground'}>{overdue ? 'Overdue · ' : ''}{item.status === 'accepted' ? 'Accepted' : 'Awaiting acceptance'}</span>
        </li>;
      })}</ul>}
  </section>;
}
