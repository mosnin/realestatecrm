import { getBrokerContext } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import {
  Users,
  PhoneIncoming,
  FileText,
  Mail,
  CheckCircle2,
  AlertCircle,
  Briefcase,
  TrendingUp,
  UserCheck,
  Plus,
  Download,
  ArrowRight,
  Building2,
  Globe,
} from 'lucide-react';
import Link from 'next/link';
import { formatCompact } from '@/lib/formatting';
import { TrendsChart } from '@/components/broker/trends-chart';

export default async function BrokerOverviewPage() {
  const ctx = await getBrokerContext();
  if (!ctx) redirect('/');

  const { brokerage } = ctx;

  // Fetch members with their user + space info
  const { data: memberships } = await supabase
    .from('BrokerageMembership')
    .select('id, role, createdAt, userId, User(id, name, email, onboard), Space!Space_ownerId_fkey(id, slug, name)')
    .eq('brokerageId', brokerage.id)
    .order('createdAt', { ascending: true });

  const members = (memberships ?? []) as unknown as Array<{
    id: string;
    role: string;
    createdAt: string;
    userId: string;
    User: { id: string; name: string | null; email: string; onboard: boolean } | null;
    Space: { id: string; slug: string; name: string } | null;
  }>;

  const spaceIds = members.map((m) => m.Space?.id).filter(Boolean) as string[];

  // Aggregate per-space stats + pending invitations in parallel
  const [applicationRows, leadRows, dealRows, wonDealRows, invitationsRes] = await Promise.all([
    spaceIds.length > 0
      ? supabase.from('Contact').select('spaceId').in('spaceId', spaceIds).contains('tags', ['application-link']).then((r) => r.data ?? [])
      : Promise.resolve([]),
    spaceIds.length > 0
      ? supabase.from('Contact').select('spaceId').in('spaceId', spaceIds).contains('tags', ['new-lead']).then((r) => r.data ?? [])
      : Promise.resolve([]),
    spaceIds.length > 0
      ? supabase.from('Deal').select('spaceId, value').in('spaceId', spaceIds).then((r) => r.data ?? [])
      : Promise.resolve([]),
    spaceIds.length > 0
      ? supabase.from('Deal').select('spaceId, value').in('spaceId', spaceIds).eq('status', 'won').then((r) => r.data ?? [])
      : Promise.resolve([]),
    supabase
      .from('Invitation')
      .select('id, email, roleToAssign, createdAt')
      .eq('brokerageId', brokerage.id)
      .eq('status', 'pending')
      .order('createdAt', { ascending: false })
      .limit(6),
  ]);

  // Build per-space lookup maps
  const appsBySpace = (applicationRows as { spaceId: string }[]).reduce<Record<string, number>>(
    (acc, r) => { acc[r.spaceId] = (acc[r.spaceId] ?? 0) + 1; return acc; }, {}
  );
  const leadsBySpace = (leadRows as { spaceId: string }[]).reduce<Record<string, number>>(
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

  const pendingInvitations = (invitationsRes.data ?? []) as Array<{
    id: string;
    email: string;
    roleToAssign: string;
    createdAt: string;
  }>;

  // Brokerage-wide totals
  const activeMembers = members.filter((m) => m.User?.onboard).length;
  const totalApplications = Object.values(appsBySpace).reduce((a, b) => a + b, 0);
  const totalLeads = Object.values(leadsBySpace).reduce((a, b) => a + b, 0);
  const totalDeals = Object.values(dealsBySpace).reduce((a, b) => a + b.count, 0);
  const totalPipeline = Object.values(dealsBySpace).reduce((a, b) => a + b.value, 0);
  const wonDeals = (wonDealRows as { spaceId: string; value: number | null }[]);
  const totalWonValue = wonDeals.reduce((sum, d) => sum + (d.value ?? 0), 0);

  const roleLabel = (role: string) =>
    role === 'broker_owner' ? 'Owner' : role === 'broker_manager' ? 'Manager' : 'Realtor';

  // Funnel conversion rates
  const leadsToApps = totalLeads > 0 ? Math.round((totalApplications / totalLeads) * 100) : 0;
  const appsToDeals = totalApplications > 0 ? Math.round((totalDeals / totalApplications) * 100) : 0;

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {brokerage.logoUrl ? (
            <img src={brokerage.logoUrl} alt="" className="h-10 max-w-[120px] object-contain rounded-lg" />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0">
              <Building2 size={18} className="text-primary" />
            </div>
          )}
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{brokerage.name}</h1>
            <div className="flex items-center gap-3 mt-0.5">
              <p className="text-sm text-muted-foreground">
                {members.length} {members.length === 1 ? 'member' : 'members'} · {activeMembers} active
              </p>
              {brokerage.websiteUrl && (
                <a
                  href={brokerage.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  <Globe size={10} /> Website
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <a
            href="/api/broker/export"
            className="inline-flex items-center gap-1.5 text-xs font-medium border border-border text-foreground px-3 py-2 rounded-lg hover:bg-muted transition-colors"
          >
            <Download size={13} /> Export
          </a>
          <Link
            href="/broker/invitations"
            className="inline-flex items-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground px-3 py-2 rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus size={13} /> Invite
          </Link>
        </div>
      </div>

      {/* ── Highlight Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Pipeline — Large hero card */}
        <Card className="col-span-2 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/20">
          <CardContent className="px-5 py-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary/70">Total Pipeline</p>
                <p className="text-4xl font-bold mt-2 tabular-nums text-primary">{formatCompact(totalPipeline)}</p>
                <p className="text-sm text-muted-foreground mt-1">{totalDeals} active deals across {activeMembers} realtors</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <TrendingUp size={22} className="text-primary" />
              </div>
            </div>
            {totalWonValue > 0 && (
              <div className="mt-3 pt-3 border-t border-primary/10 flex items-center gap-2">
                <CheckCircle2 size={12} className="text-emerald-500" />
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-emerald-600">{formatCompact(totalWonValue)}</span> closed won ({wonDeals.length} deals)
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Smaller stat cards */}
        {[
          { label: 'Team Size',      value: members.length, sub: `${activeMembers} active`, icon: Users,        gradient: 'from-blue-500/10 to-blue-500/0',   iconColor: 'text-blue-500' },
          { label: 'New Leads',       value: totalLeads,     sub: `${totalApplications} applications`, icon: PhoneIncoming, gradient: 'from-violet-500/10 to-violet-500/0', iconColor: 'text-violet-500' },
        ].map(({ label, value, sub, icon: Icon, gradient, iconColor }) => (
          <Card key={label} className={`bg-gradient-to-br ${gradient} to-transparent`}>
            <CardContent className="px-4 py-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{label}</p>
                  <p className="text-2xl font-bold mt-1 tabular-nums">{value}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
                </div>
                <div className="w-9 h-9 rounded-xl bg-background/50 flex items-center justify-center flex-shrink-0">
                  <Icon size={16} className={iconColor} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Conversion Funnel ── */}
      {(totalLeads > 0 || totalApplications > 0 || totalDeals > 0) && (
        <Card>
          <CardContent className="px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Conversion Funnel</p>
            <div className="flex items-center gap-2">
              {/* Leads */}
              <div className="flex-1 text-center">
                <div className="h-10 rounded-lg bg-violet-500/15 flex items-center justify-center">
                  <span className="text-sm font-bold text-violet-600 dark:text-violet-400 tabular-nums">{totalLeads}</span>
                </div>
                <p className="text-[10px] font-medium text-muted-foreground mt-1.5">Leads</p>
              </div>

              {/* Arrow + rate */}
              <div className="flex flex-col items-center gap-0.5 px-1">
                <ArrowRight size={12} className="text-muted-foreground/40" />
                <span className="text-[9px] font-semibold text-muted-foreground tabular-nums">{leadsToApps}%</span>
              </div>

              {/* Applications */}
              <div className="flex-1 text-center">
                <div className="h-10 rounded-lg bg-amber-500/15 flex items-center justify-center">
                  <span className="text-sm font-bold text-amber-600 dark:text-amber-400 tabular-nums">{totalApplications}</span>
                </div>
                <p className="text-[10px] font-medium text-muted-foreground mt-1.5">Applications</p>
              </div>

              {/* Arrow + rate */}
              <div className="flex flex-col items-center gap-0.5 px-1">
                <ArrowRight size={12} className="text-muted-foreground/40" />
                <span className="text-[9px] font-semibold text-muted-foreground tabular-nums">{appsToDeals}%</span>
              </div>

              {/* Deals */}
              <div className="flex-1 text-center">
                <div className="h-10 rounded-lg bg-cyan-500/15 flex items-center justify-center">
                  <span className="text-sm font-bold text-cyan-600 dark:text-cyan-400 tabular-nums">{totalDeals}</span>
                </div>
                <p className="text-[10px] font-medium text-muted-foreground mt-1.5">Deals</p>
              </div>

              {/* Arrow + rate */}
              <div className="flex flex-col items-center gap-0.5 px-1">
                <ArrowRight size={12} className="text-muted-foreground/40" />
              </div>

              {/* Won value */}
              <div className="flex-1 text-center">
                <div className="h-10 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCompact(totalWonValue)}</span>
                </div>
                <p className="text-[10px] font-medium text-muted-foreground mt-1.5">Closed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Weekly Trends ── */}
      <TrendsChart />

      {/* ── Team Performance + Invitations ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Team performance table */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Team Performance</p>
            <Link href="/broker/realtors" className="text-xs text-primary font-medium hover:underline underline-offset-2">
              Full breakdown →
            </Link>
          </div>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Realtor</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground hidden sm:table-cell">Role</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Leads</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground hidden md:table-cell">Apps</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Deals</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground hidden sm:table-cell">Pipeline</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {members.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                        No members yet.{' '}
                        <Link href="/broker/invitations" className="text-primary hover:underline">
                          Invite realtors →
                        </Link>
                      </td>
                    </tr>
                  ) : (
                    members.map((m) => {
                      const user = m.User;
                      const space = m.Space;
                      const initials = (user?.name ?? user?.email ?? '?')
                        .split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
                      const leads = space ? (leadsBySpace[space.id] ?? 0) : 0;
                      const apps  = space ? (appsBySpace[space.id] ?? 0) : 0;
                      const deals = space ? (dealsBySpace[space.id]?.count ?? 0) : 0;
                      const pipeline = space ? (dealsBySpace[space.id]?.value ?? 0) : 0;

                      return (
                        <tr key={m.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors group">
                          <td className="px-4 py-3">
                            <Link href={`/broker/realtors/${m.userId}`} className="flex items-center gap-2.5 min-w-0">
                              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[11px] font-semibold text-primary flex-shrink-0">
                                {initials}
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-xs truncate group-hover:text-primary transition-colors">{user?.name ?? 'No name'}</p>
                                <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
                              </div>
                            </Link>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell">
                            <span className="text-[10px] font-medium text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                              {roleLabel(m.role)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-xs font-semibold">{leads}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-xs hidden md:table-cell">{apps}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-xs font-semibold">{deals}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-xs hidden sm:table-cell">
                            {formatCompact(pipeline)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {user?.onboard ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15">
                                <CheckCircle2 size={9} /> Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15">
                                <AlertCircle size={9} /> Pending
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Pending invitations panel */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Pending Invitations</p>
            <Link href="/broker/invitations" className="text-xs text-primary font-medium hover:underline underline-offset-2">
              View all →
            </Link>
          </div>

          {pendingInvitations.length === 0 ? (
            <Card>
              <CardContent className="px-4 py-8 flex flex-col items-center gap-2 text-center">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                  <Mail size={18} className="text-muted-foreground/60" />
                </div>
                <p className="text-xs text-muted-foreground">No pending invitations.</p>
                <Link
                  href="/broker/invitations"
                  className="text-xs text-primary font-medium hover:underline underline-offset-2"
                >
                  Invite a realtor →
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {pendingInvitations.map((inv) => (
                <div key={inv.id} className="rounded-xl border border-border bg-card px-4 py-3 hover:border-primary/30 transition-colors">
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                      <Mail size={10} className="text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{inv.email}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {inv.roleToAssign === 'broker_manager' ? 'Manager' : 'Realtor'} ·{' '}
                        {new Date(inv.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              <Link
                href="/broker/invitations"
                className="block text-center text-xs text-primary font-medium hover:underline underline-offset-2 pt-1"
              >
                Manage invitations →
              </Link>
            </div>
          )}

          {/* Quick stats sidebar cards */}
          <div className="space-y-2 pt-2">
            <Card className="bg-gradient-to-br from-emerald-500/5 to-transparent">
              <CardContent className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Won Deals</p>
                  <p className="text-lg font-bold tabular-nums">{wonDeals.length}</p>
                </div>
                <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCompact(totalWonValue)}</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-amber-500/5 to-transparent">
              <CardContent className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Applications</p>
                  <p className="text-lg font-bold tabular-nums">{totalApplications}</p>
                </div>
                <FileText size={16} className="text-amber-500/50" />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
