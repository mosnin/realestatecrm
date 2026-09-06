import React from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { getBrokerageMembers } from '@/lib/brokerage-members';
import { composeBriefDashboard } from '@/lib/briefing/dashboard';
import { BriefDashboard } from '@/components/chippi/brief-dashboard';
import type { Brokerage, BrokerageMembership } from '@/lib/types';

type MemberDashboardProps = {
  ctx: {
    brokerage: Brokerage;
    membership: BrokerageMembership;
    dbUserId: string;
  };
};

/** Members get the same daily work desk, scoped to their personal workspace.
 * Brokerage announcements remain available without loading other agents' CRM. */
export async function MemberDashboard({ ctx }: MemberDashboardProps) {
  const { brokerage, dbUserId } = ctx;
  const { data: space, error } = await supabase
    .from('Space')
    .select('id, slug, name')
    .eq('ownerId', dbUserId)
    .maybeSingle();
  if (error) throw new Error('Your workspace could not be loaded');
  if (!space)
    return (
      <div
        className="mx-auto max-w-2xl space-y-5 py-8"
        data-broker-premium-page="member-today-empty"
      >
        <p className="text-sm text-muted-foreground">{brokerage.name}</p>
        <h1 className="text-3xl font-semibold">Set up your daily desk</h1>
        <p className="text-sm text-muted-foreground">
          Create your workspace to see assigned leads, follow-ups and
          appointments.
        </p>
        <Link
          href="/setup"
          className="inline-flex min-h-10 items-center rounded-lg bg-brand px-4 text-sm font-medium text-white"
        >
          Complete setup
        </Link>
      </div>
    );

  const data = await composeBriefDashboard(space.id, dbUserId);
  const members = await getBrokerageMembers(brokerage.id, { strict: true }).catch(() => null);
  const adminSpaceIds = [
    ...new Set(
      (members ?? [])
        .filter(
          (member) =>
            member.role === 'broker_owner' || member.role === 'broker_admin',
        )
        .map((member) => member.Space?.id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const announcements = !members ? { data: [], error: new Error('Team unavailable') } : adminSpaceIds.length
    ? await supabase
        .from('Note')
        .select('id, title, content')
        .in('spaceId', adminSpaceIds)
        .ilike('title', '[ANN]%')
        .order('createdAt', { ascending: false })
        .limit(3)
    : { data: [], error: null };

  return (
    <div className="space-y-6" data-broker-premium-page="member-today">
      <p className="text-xs text-muted-foreground">
        {brokerage.name} · Your workspace
      </p>
      <BriefDashboard slug={space.slug} data={data} />
      <details className="mx-auto max-w-6xl rounded-lg border border-border p-5">
        <summary className="cursor-pointer text-sm font-medium">
          Team announcements
        </summary>
        {announcements.error ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Team announcements could not be loaded.
          </p>
        ) : announcements.data?.length ? (
          <ul className="mt-4 divide-y divide-border">
            {announcements.data.map((note) => (
              <li key={note.id} className="py-3">
                <p className="text-sm font-medium">
                  {note.title.replace(/^\[ANN\]\s*/, '')}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {note.content?.slice(0, 200)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            No team announcements.
          </p>
        )}
      </details>
    </div>
  );
}
