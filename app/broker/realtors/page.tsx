import { getBrokerContext } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import {
  CheckCircle2,
  AlertCircle,
  PhoneIncoming,
  Users,
  Briefcase,
  TrendingUp,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { formatCompact as formatCurrency } from '@/lib/formatting';

export const metadata: Metadata = { title: 'Realtors — Broker Dashboard' };

export default async function BrokerRealtorsPage() {
  const ctx = await getBrokerContext();
  if (!ctx) redirect('/');

  const { brokerage } = ctx;

  // Fetch all members with their user info
  const { data: memberships } = await supabase
    .from('BrokerageMembership')
    .select('id, role, createdAt, userId, User(id, name, email, onboard), Space!Space_ownerId_fkey(id, slug, name)')
    .eq('brokerageId', brokerage.id)
    .order('createdAt', { ascending: true });

  const members = (memberships ?? []) as Array<{
    id: string;
    role: string;
    createdAt: string;
    userId: string;
    User: { id: string; name: string | null; email: string; onboard: boolean } | null;
    Space: { id: string; slug: string; name: string } | null;
  }>;

  const spaceIds = members.map((m) => m.Space?.id).filter(Boolean) as string[];

  // Aggregate per-space stats in parallel
  const [leadRows, contactRows, dealRows] = await Promise.all([
    spaceIds.length > 0
      ? supabase
          .from('Contact')
          .select('spaceId')
          .in('spaceId', spaceIds)
          .contains('tags', ['application-link'])
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
    spaceIds.length > 0
      ? supabase
          .from('Contact')
          .select('spaceId')
          .in('spaceId', spaceIds)
          .not('tags', 'cs', '["application-link"]')
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
    spaceIds.length > 0
      ? supabase
          .from('Deal')
          .select('spaceId, value')
          .in('spaceId', spaceIds)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
  ]);

  // Build lookup maps by spaceId
  const leadsBySpace = (leadRows as { spaceId: string }[]).reduce<Record<string, number>>(
    (acc, r) => { acc[r.spaceId] = (acc[r.spaceId] ?? 0) + 1; return acc; }, {}
  );
  const contactsBySpace = (contactRows as { spaceId: string }[]).reduce<Record<string, number>>(
    (acc, r) => { acc[r.spaceId] = (acc[r.spaceId] ?? 0) + 1; return acc; }, {}
  );
  const dealsBySpace = (dealRows as { spaceId: string; value: number | null }[]).reduce<
    Record<string, { count: number; value: number }>
  >(
    (acc, r) => {
      if (!acc[r.spaceId]) acc[r.spaceId] = { count: 0, value: 0 };
      acc[r.spaceId].count += 1;
      acc[r.spaceId].value += r.value ?? 0;
      return acc;
    },
    {}
  );

  const roleLabel = (role: string) =>
    role === 'broker_owner' ? 'Owner' : role === 'broker_manager' ? 'Manager' : 'Realtor';

  // Totals for the summary bar
  const totalLeads = Object.values(leadsBySpace).reduce((a, b) => a + b, 0);
  const totalContacts = Object.values(contactsBySpace).reduce((a, b) => a + b, 0);
  const totalDeals = Object.values(dealsBySpace).reduce((a, b) => a + b.count, 0);
  const totalPipeline = Object.values(dealsBySpace).reduce((a, b) => a + b.value, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Realtors</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {members.length} {members.length === 1 ? 'member' : 'members'} · {brokerage.name}
        </p>
      </div>

      {/* Brokerage-wide summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total leads', value: totalLeads, icon: PhoneIncoming },
          { label: 'Total contacts', value: totalContacts, icon: Users },
          { label: 'Active deals', value: totalDeals, icon: Briefcase },
          { label: 'Pipeline value', value: formatCurrency(totalPipeline), icon: TrendingUp },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="px-4 py-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{label}</p>
                  <p className="text-2xl font-bold mt-0.5 tabular-nums">{value}</p>
                </div>
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                  <Icon size={15} className="text-muted-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Per-realtor cards */}
      {members.length === 0 ? (
        <Card>
          <CardContent className="px-5 py-10 text-center space-y-2">
            <p className="text-sm text-muted-foreground">No realtors yet.</p>
            <Link
              href="/broker/invitations"
              className="text-xs text-primary font-medium hover:underline underline-offset-2 inline-block"
            >
              Invite realtors →
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {members.map((m) => {
            const user = m.User;
            const space = m.Space;
            const initials = (user?.name ?? user?.email ?? '?')
              .split(' ')
              .map((n) => n[0])
              .join('')
              .toUpperCase()
              .slice(0, 2);
            const joinedAt = new Date(m.createdAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });
            const leads = space ? (leadsBySpace[space.id] ?? 0) : 0;
            const contacts = space ? (contactsBySpace[space.id] ?? 0) : 0;
            const deals = space ? (dealsBySpace[space.id]?.count ?? 0) : 0;
            const pipeline = space ? (dealsBySpace[space.id]?.value ?? 0) : 0;

            return (
              <Card key={m.id} className="flex flex-col">
                <CardContent className="px-5 py-5 flex flex-col gap-4 flex-1">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary flex-shrink-0">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{user?.name ?? 'No name'}</p>
                        <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      {user?.onboard ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15">
                          <CheckCircle2 size={10} /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15">
                          <AlertCircle size={10} /> Pending
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                        {roleLabel(m.role)}
                      </span>
                    </div>
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-muted/50 px-3 py-2.5">
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Leads</p>
                      <p className="text-lg font-bold mt-0.5 tabular-nums">{leads}</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 px-3 py-2.5">
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Contacts</p>
                      <p className="text-lg font-bold mt-0.5 tabular-nums">{contacts}</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 px-3 py-2.5">
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Deals</p>
                      <p className="text-lg font-bold mt-0.5 tabular-nums">{deals}</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 px-3 py-2.5">
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Pipeline</p>
                      <p className="text-lg font-bold mt-0.5 tabular-nums">{formatCurrency(pipeline)}</p>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between mt-auto pt-1 border-t border-border">
                    <p className="text-[11px] text-muted-foreground">Joined {joinedAt}</p>
                    {space?.slug ? (
                      <Link
                        href={`/s/${space.slug}`}
                        className="inline-flex items-center gap-1 text-[11px] text-primary font-medium hover:underline underline-offset-2"
                      >
                        View workspace <ExternalLink size={10} />
                      </Link>
                    ) : (
                      <span className="text-[11px] text-muted-foreground italic">No workspace yet</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
