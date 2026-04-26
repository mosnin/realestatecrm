import { getBrokerMemberContext } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { safeHref } from '@/lib/utils';
import { getBrokerageMembers } from '@/lib/brokerage-members';
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
  CalendarDays,
  Link2,
} from 'lucide-react';
import Link from 'next/link';
import { formatCompact } from '@/lib/formatting';
import { TrendsChart } from '@/components/broker/trends-chart';
import { BrokerOnboardingChecklist } from '@/components/broker/onboarding-checklist';
import { TeamActivityFeed } from '@/components/broker/team-activity-feed';
import { MemberDashboard } from './member-dashboard';
import { IntakeLinkCopyButton } from '@/components/broker/intake-link-copy-button';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default async function BrokerOverviewPage() {
  const ctx = await getBrokerMemberContext();
  if (!ctx) redirect('/');

  // If the user is a realtor_member, show the member dashboard instead
  if (ctx.membership.role === 'realtor_member') {
    return <MemberDashboard ctx={ctx} />;
  }

  const { brokerage } = ctx;

  // Fetch members with their user + space info
  const members = await getBrokerageMembers(ctx.brokerage.id, { includeOnboard: true, includeSpaceName: true });

  const spaceIds = members.map((m) => m.Space?.id).filter(Boolean) as string[];

  // Ensure broker owner's space is included (brokerage leads are created there)
  const { data: ownerSpaceRow } = await supabase
    .from('Space')
    .select('id')
    .eq('ownerId', ctx.brokerage.ownerId)
    .maybeSingle();
  if (ownerSpaceRow?.id && !spaceIds.includes(ownerSpaceRow.id)) {
    spaceIds.push(ownerSpaceRow.id);
  }

  // Aggregate per-space stats + pending invitations in parallel
  const [applicationCountRes, leadCountRes, dealRows, wonDealRows, invitationsRes] = await Promise.all([
    spaceIds.length > 0
      ? supabase.from('Contact').select('*', { count: 'exact', head: true }).in('spaceId', spaceIds).contains('tags', ['application-link'])
      : Promise.resolve({ count: 0 }),
    spaceIds.length > 0
      ? supabase.from('Contact').select('*', { count: 'exact', head: true }).in('spaceId', spaceIds).contains('tags', ['new-lead'])
      : Promise.resolve({ count: 0 }),
    spaceIds.length > 0
      ? supabase.from('Deal').select('spaceId, value').in('spaceId', spaceIds).eq('status', 'active').then((r) => r.data ?? [])
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

  // Per-space lookup for deals (need actual rows for per-member breakdown in the table)
  // For contacts we also need per-space counts for the table, so fetch those separately
  const [applicationRows, leadRows] = await Promise.all([
    spaceIds.length > 0
      ? supabase.from('Contact').select('spaceId').in('spaceId', spaceIds).contains('tags', ['application-link']).then((r) => r.data ?? [])
      : Promise.resolve([]),
    spaceIds.length > 0
      ? supabase.from('Contact').select('spaceId').in('spaceId', spaceIds).contains('tags', ['new-lead']).then((r) => r.data ?? [])
      : Promise.resolve([]),
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
  const totalApplications = applicationCountRes.count ?? 0;
  const totalLeads = leadCountRes.count ?? 0;
  const totalDeals = Object.values(dealsBySpace).reduce((a, b) => a + b.count, 0);
  const totalPipeline = Object.values(dealsBySpace).reduce((a, b) => a + b.value, 0);
  const wonDeals = (wonDealRows as { spaceId: string; value: number | null }[]);
  const totalWonValue = wonDeals.reduce((sum, d) => sum + (d.value ?? 0), 0);

  const roleLabel = (role: string) =>
    role === 'broker_owner' ? 'Owner' : role === 'broker_admin' ? 'Admin' : 'Realtor';

  // Funnel conversion rates
  const leadsToApps = totalLeads > 0 ? Math.round((totalApplications / totalLeads) * 100) : 0;
  const appsToDeals = totalApplications > 0 ? Math.round((totalDeals / totalApplications) * 100) : 0;

  const nonOwnerMembers = members.filter((m) => m.role !== 'broker_owner');
  const hasSettings = !!(brokerage.name && (brokerage.logoUrl || brokerage.websiteUrl));

  return (
    <div className="space-y-8 w-full">
      {/* ── Page header (matching realtor dashboard) ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          {brokerage.logoUrl ? (
            <img src={brokerage.logoUrl} alt="" className="h-10 max-w-[120px] object-contain rounded-lg" />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0">
              <Building2 size={18} className="text-primary" />
            </div>
          )}
          <div>
            <p className="text-sm text-muted-foreground">{getGreeting()}</p>
            <h1 className="text-2xl font-bold tracking-tight text-foreground mt-0.5">
              {brokerage.name}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {brokerage.websiteUrl && (
            <a
              href={safeHref(brokerage.websiteUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium border border-border text-foreground px-3 py-2 rounded-lg hover:bg-muted transition-colors"
            >
              <Globe size={12} /> Website
            </a>
          )}
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

      {/* ── Brokerage Intake Link ── */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Link2 size={16} className="text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Brokerage Intake Form</p>
            <p className="text-xs text-muted-foreground">Share this link to receive leads directly into your brokerage pipeline</p>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <code className="flex-1 sm:flex-none text-xs font-mono bg-card border rounded-lg px-3 py-2 truncate max-w-[280px]">
            {`${process.env.NEXT_PUBLIC_ROOT_DOMAIN ? `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN}` : 'https://my.usechippi.com'}/apply/b/${brokerage.id}`}
          </code>
          <IntakeLinkCopyButton
            url={`${process.env.NEXT_PUBLIC_ROOT_DOMAIN ? `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN}` : 'https://my.usechippi.com'}/apply/b/${brokerage.id}`}
          />
          <Link
            href={`/apply/b/${brokerage.id}`}
            target="_blank"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline flex-shrink-0"
          >
            Preview <ArrowRight size={12} />
          </Link>
        </div>
      </div>

      {/* ── Onboarding checklist ── */}
      <BrokerOnboardingChecklist
        hasMembers={nonOwnerMembers.length > 0}
        hasInvitations={pendingInvitations.length > 0}
        hasSettings={hasSettings}
      />

      {/* ── Summary stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Team size', value: members.length, sub: `${activeMembers} active`, icon: Users, color: '', bg: 'bg-muted', href: '/broker/members' },
          { label: 'New leads', value: totalLeads, sub: 'across team', icon: PhoneIncoming, color: totalLeads > 0 ? 'text-violet-600 dark:text-violet-400' : '', bg: 'bg-violet-500/10', href: '/broker/realtors' },
          { label: 'Applications', value: totalApplications, sub: 'submitted', icon: FileText, color: totalApplications > 0 ? 'text-amber-600 dark:text-amber-400' : '', bg: 'bg-amber-500/10', href: '/broker/realtors' },
          { label: 'Active deals', value: totalDeals, sub: formatCompact(totalPipeline), icon: Briefcase, color: totalDeals > 0 ? 'text-cyan-600 dark:text-cyan-400' : '', bg: 'bg-cyan-500/10', href: '/broker/realtors' },
          { label: 'Won deals', value: wonDeals.length, sub: formatCompact(totalWonValue), icon: CheckCircle2, color: wonDeals.length > 0 ? 'text-emerald-600 dark:text-emerald-400' : '', bg: 'bg-emerald-500/10', href: '/broker/realtors' },
          { label: 'Invitations', value: pendingInvitations.length, sub: pendingInvitations.length > 0 ? 'pending' : 'none', icon: Mail, color: pendingInvitations.length > 0 ? 'text-primary' : '', bg: 'bg-primary/10', href: '/broker/invitations' },
        ].map(({ label, value, sub, icon: Icon, color, bg, href }) => (
          <Link key={label} href={href}>
            <Card className="transition-all hover:shadow-md hover:border-primary/20 group">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color ? bg : 'bg-muted'}`}>
                    <Icon size={16} className={color || 'text-muted-foreground'} />
                  </div>
                  <ArrowRight size={12} className="text-muted-foreground/0 group-hover:text-muted-foreground/60 transition-colors" />
                </div>
                <p className={`text-2xl font-bold tabular-nums leading-tight ${color || 'text-foreground'}`}>
                  {value}
                </p>
                <p className="text-xs text-muted-foreground mt-1 leading-tight">{label}</p>
                <p className="text-xs text-muted-foreground/60">{sub}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* ── Conversion Funnel ── */}
      {(totalLeads > 0 || totalApplications > 0 || totalDeals > 0) && (
        <Card>
          <CardContent className="px-4 sm:px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Conversion Funnel</p>
            <div className="flex items-center gap-1 sm:gap-2">
              {/* Leads */}
              <div className="flex-1 text-center">
                <div className="h-11 rounded-lg bg-violet-500/15 flex items-center justify-center">
                  <span className="text-sm font-bold text-violet-600 dark:text-violet-400 tabular-nums">{totalLeads}</span>
                </div>
                <p className="text-xs font-medium text-muted-foreground mt-1.5">Leads</p>
              </div>

              {/* Arrow + rate */}
              <div className="flex flex-col items-center gap-0.5 px-0.5 sm:px-1">
                <ArrowRight size={12} className="text-muted-foreground/40" />
                <span className="text-[10px] font-semibold text-muted-foreground tabular-nums">{leadsToApps}%</span>
              </div>

              {/* Applications */}
              <div className="flex-1 text-center">
                <div className="h-11 rounded-lg bg-amber-500/15 flex items-center justify-center">
                  <span className="text-sm font-bold text-amber-600 dark:text-amber-400 tabular-nums">{totalApplications}</span>
                </div>
                <p className="text-xs font-medium text-muted-foreground mt-1.5 hidden sm:block">Applications</p>
                <p className="text-xs font-medium text-muted-foreground mt-1.5 sm:hidden">Apps</p>
              </div>

              {/* Arrow + rate */}
              <div className="flex flex-col items-center gap-0.5 px-0.5 sm:px-1">
                <ArrowRight size={12} className="text-muted-foreground/40" />
                <span className="text-[10px] font-semibold text-muted-foreground tabular-nums">{appsToDeals}%</span>
              </div>

              {/* Deals */}
              <div className="flex-1 text-center">
                <div className="h-11 rounded-lg bg-cyan-500/15 flex items-center justify-center">
                  <span className="text-sm font-bold text-cyan-600 dark:text-cyan-400 tabular-nums">{totalDeals}</span>
                </div>
                <p className="text-xs font-medium text-muted-foreground mt-1.5">Deals</p>
              </div>

              {/* Arrow */}
              <div className="flex flex-col items-center gap-0.5 px-0.5 sm:px-1">
                <ArrowRight size={12} className="text-muted-foreground/40" />
              </div>

              {/* Won value */}
              <div className="flex-1 text-center">
                <div className="h-11 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCompact(totalWonValue)}</span>
                </div>
                <p className="text-xs font-medium text-muted-foreground mt-1.5">Closed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Weekly Trends ── */}
      <TrendsChart />

      {/* ── Team Performance + Sidebar ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Team performance table — 2/3 width */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Team Performance</h2>
            <Link href="/broker/realtors" className="text-xs text-primary font-medium hover:underline underline-offset-2 flex items-center gap-1">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Realtor</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Role</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Leads</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Apps</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Deals</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Pipeline</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {members.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center">
                        <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
                          <Users size={20} className="text-muted-foreground" />
                        </div>
                        <p className="text-sm font-medium text-foreground">No team members yet</p>
                        <p className="text-xs text-muted-foreground mt-1 max-w-[220px] mx-auto">
                          Invite your first realtor to start tracking team performance.
                        </p>
                        <Link href="/broker/invitations" className="text-xs text-primary font-medium hover:underline mt-2 inline-flex items-center gap-1">
                          Invite realtors <ArrowRight size={11} />
                        </Link>
                      </td>
                    </tr>
                  ) : (
                    members.map((m) => {
                      const user = m.User;
                      const space = m.Space;
                      const initials = (user?.name ?? user?.email ?? '?')
                        .split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
                      const sid = space?.id ?? '';
                      const leads = sid ? (leadsBySpace[sid] ?? 0) : 0;
                      const apps  = sid ? (appsBySpace[sid] ?? 0) : 0;
                      const deals = sid ? (dealsBySpace[sid]?.count ?? 0) : 0;
                      const pipeline = sid ? (dealsBySpace[sid]?.value ?? 0) : 0;

                      return (
                        <tr key={m.id} className="hover:bg-muted/30 transition-colors group">
                          <td className="px-3 sm:px-4 py-3">
                            <Link href={`/broker/realtors/${m.userId}`} className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary flex-shrink-0">
                                {initials}
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">{user?.name ?? 'No name'}</p>
                                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                              </div>
                            </Link>
                          </td>
                          <td className="px-3 sm:px-4 py-3 hidden sm:table-cell">
                            <span className="text-xs font-medium text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                              {roleLabel(m.role)}
                            </span>
                          </td>
                          <td className="px-3 sm:px-4 py-3 text-right tabular-nums text-xs font-semibold">{leads}</td>
                          <td className="px-3 sm:px-4 py-3 text-right tabular-nums text-xs hidden md:table-cell">{apps}</td>
                          <td className="px-3 sm:px-4 py-3 text-right tabular-nums text-xs font-semibold">{deals}</td>
                          <td className="px-3 sm:px-4 py-3 text-right tabular-nums text-xs hidden sm:table-cell">
                            {formatCompact(pipeline)}
                          </td>
                          <td className="px-3 sm:px-4 py-3 text-right">
                            {user?.onboard ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2.5 py-0.5 text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15">
                                <CheckCircle2 size={11} /> Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2.5 py-0.5 text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15">
                                <AlertCircle size={11} /> Pending
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

        {/* Right sidebar — Invitations + Activity */}
        <div className="space-y-6">
          {/* Pending invitations */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground">Pending Invitations</h2>
              <Link href="/broker/invitations" className="text-xs text-primary font-medium hover:underline flex items-center gap-1">
                View all <ArrowRight size={12} />
              </Link>
            </div>

            {pendingInvitations.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center mx-auto mb-2">
                    <Mail size={18} className="text-muted-foreground" />
                  </div>
                  <p className="text-xs font-medium text-foreground">No pending invitations</p>
                  <p className="text-xs text-muted-foreground mt-0.5 max-w-[180px] mx-auto">
                    Grow your team by inviting realtors to join your brokerage.
                  </p>
                  <Link
                    href="/broker/invitations"
                    className="text-xs text-primary font-medium hover:underline mt-2 inline-flex items-center gap-1"
                  >
                    Invite realtors <ArrowRight size={11} />
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <div className="divide-y divide-border">
                  {pendingInvitations.map((inv) => (
                    <Link key={inv.id} href="/broker/invitations" className="block">
                      <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                        <div className="w-8 h-8 rounded-full bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                          <Mail size={12} className="text-amber-600 dark:text-amber-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{inv.email}</p>
                          <p className="text-xs text-muted-foreground">
                            {inv.roleToAssign === 'broker_admin' ? 'Admin' : 'Realtor'} ·{' '}
                            {new Date(inv.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* Recent team activity */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground">Recent Activity</h2>
            </div>
            <TeamActivityFeed />
          </div>
        </div>
      </div>
    </div>
  );
}
