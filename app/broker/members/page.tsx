import { getBrokerContext } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { MembersClient } from './members-client';
import Link from 'next/link';
import { formatCompact } from '@/lib/formatting';
import { TITLE_FONT, PRIMARY_PILL } from '@/lib/typography';
import {
  BROKER_DIRECTORY_SHELL,
  BROKER_ORIENTATION,
  BROKER_PAGE_WIDE,
} from '@/components/broker/premium';

export default async function BrokerMembersPage() {
  const ctx = await getBrokerContext();
  if (!ctx) redirect('/');

  const { data: memberships } = await supabase
    .from('BrokerageMembership')
    .select('id, role, createdAt, userId')
    .eq('brokerageId', ctx.brokerage.id)
    .order('createdAt', { ascending: true });

  const rawMembers = (memberships ?? []) as Array<{ id: string; role: string; createdAt: string; userId: string }>;
  const userIds = rawMembers.map((m) => m.userId).filter(Boolean);

  let users: any[] = [];
  let spaces: any[] = [];
  if (userIds.length > 0) {
    const [userRes, spaceRes] = await Promise.all([
      supabase.from('User').select('id, name, email, onboard').in('id', userIds),
      supabase.from('Space').select('ownerId, slug').in('ownerId', userIds),
    ]);
    users = userRes.data ?? [];
    spaces = spaceRes.data ?? [];
  }

  const userMap = new Map(users.map((u: any) => [u.id, u]));
  const spaceMap = new Map(spaces.map((s: any) => [s.ownerId, s]));

  const members = rawMembers.map((m) => ({
    id: m.id,
    role: m.role,
    createdAt: m.createdAt,
    userId: m.userId,
    userName: userMap.get(m.userId)?.name ?? null,
    userEmail: userMap.get(m.userId)?.email ?? null,
    userOnboard: userMap.get(m.userId)?.onboard ?? false,
    spaceSlug: spaceMap.get(m.userId)?.slug ?? null,
  }));
  const activeCount = members.filter((member) => member.userOnboard).length;
  const pendingCount = members.length - activeCount;
  const adminCount = members.filter((member) => member.role !== 'realtor_member').length;

  return (
    <div className={BROKER_PAGE_WIDE} data-broker-premium-page="members" data-broker-family="workspace-roster">
      <header className="grid gap-7 border-b chippi-dashboard-divider pb-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end" data-route-orientation="workspace-access">
        <div className="max-w-3xl space-y-3">
          <p className={BROKER_ORIENTATION}>Workspace access</p>
          <h1 className="text-4xl tracking-[-0.04em] text-foreground sm:text-5xl" style={TITLE_FONT}>Members</h1>
          <p className="text-base text-muted-foreground">Control who can enter {ctx.brokerage.name}, what they can manage, and whose work stays assigned.</p>
        </div>
        <Link href="/broker/invitations" className={PRIMARY_PILL}>Add a team member</Link>
      </header>
      <section className={BROKER_DIRECTORY_SHELL} data-primary-work-geometry="access-directory">
        <aside className="border-b chippi-dashboard-divider p-6 lg:border-b-0 lg:border-r">
          <p className={BROKER_ORIENTATION}>Access summary</p>
          <dl className="mt-8 space-y-7">
            <div><dt className="text-xs text-muted-foreground">Active</dt><dd className="mt-1 text-3xl tabular-nums" style={TITLE_FONT}>{formatCompact(activeCount)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Pending</dt><dd className="mt-1 text-3xl tabular-nums" style={TITLE_FONT}>{formatCompact(pendingCount)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Owners &amp; admins</dt><dd className="mt-1 text-3xl tabular-nums" style={TITLE_FONT}>{formatCompact(adminCount)}</dd></div>
          </dl>
        </aside>
        <div className="min-w-0 p-5 sm:p-7">
          <MembersClient
            members={members}
            brokerageName={ctx.brokerage.name}
            currentUserRole={ctx.membership.role}
          />
        </div>
      </section>
    </div>
  );
}
