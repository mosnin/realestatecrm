import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Users,
  CheckCircle2,
  AlertTriangle,
  PhoneIncoming,
  Building2,
  TrendingUp,
  Briefcase,
  UserPlus,
  DollarSign,
  CreditCard,
  Flame,
  Thermometer,
  Snowflake,
  Calendar,
  Bell,
  BarChart3,
  FileText,
  LayoutGrid,
} from 'lucide-react';
import Link from 'next/link';
import { formatCompact } from '@/lib/formatting';
import { SignupChart } from './components/signup-chart';
import { isPlatformAdmin } from '@/lib/permissions';
import { redirect } from 'next/navigation';

export default async function AdminOverviewPage() {
  const isAdmin = await isPlatformAdmin();
  if (!isAdmin) redirect('/');
  // ── Parallel data fetches ────────────────────────────────────────────────
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();

  let totalUsers = 0,
    onboardedUsers = 0,
    usersWithSpace = 0,
    totalContacts = 0,
    totalLeads = 0,
    totalBrokerages = 0,
    activeBrokerages = 0,
    totalDeals = 0,
    totalPipelineValue = 0,
    signupsLast7 = 0,
    signupsLast30 = 0,
    leadsLast7 = 0;
  // Revenue metrics
  let activeSubscriptions = 0,
    trialUsers = 0,
    pastDueUsers = 0,
    canceledUsers = 0,
    churnRate = 0,
    mrr = 0;

  // Feature usage metrics
  let spacesWithLeads = 0,
    spacesWithDeals = 0,
    spacesWithTours = 0,
    totalTours = 0,
    totalFollowUps = 0,
    totalSpaces = 0;

  // Lead quality metrics
  let hotLeads = 0,
    warmLeads = 0,
    coldLeads = 0,
    unqualifiedLeads = 0;

  let recentUsers: {
    id: string;
    name: string | null;
    email: string;
    onboard: boolean;
    createdAt: string;
    space: { slug: string } | null;
  }[] = [];
  let signupsByDay: { date: string; count: number }[] = [];
  let recentActivity: {
    type: 'signup' | 'lead' | 'deal' | 'brokerage';
    label: string;
    detail: string;
    time: string;
  }[] = [];

  try {
    const [
      totalRes,
      onboardedRes,
      withSpaceRes,
      contactsRes,
      leadsRes,
      brokerageRes,
      activeBrokerageRes,
      dealsRes,
      signups7Res,
      signups30Res,
      leads7Res,
      recentRes,
      signupsRaw,
      recentLeads,
      recentDeals,
      recentBrokerages,
    ] = await Promise.all([
      supabase.from('User').select('*', { count: 'exact', head: true }),
      supabase.from('User').select('*', { count: 'exact', head: true }).eq('onboard', true),
      supabase.from('User').select('*, Space!inner(id)', { count: 'exact', head: true }),
      supabase.from('Contact').select('*', { count: 'exact', head: true }),
      supabase
        .from('Contact')
        .select('*', { count: 'exact', head: true })
        .contains('tags', ['application-link']),
      supabase.from('Brokerage').select('*', { count: 'exact', head: true }),
      supabase
        .from('Brokerage')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active'),
      supabase.from('Deal').select('value'),
      supabase
        .from('User')
        .select('*', { count: 'exact', head: true })
        .gte('createdAt', sevenDaysAgo),
      supabase
        .from('User')
        .select('*', { count: 'exact', head: true })
        .gte('createdAt', thirtyDaysAgo),
      supabase
        .from('Contact')
        .select('*', { count: 'exact', head: true })
        .contains('tags', ['application-link'])
        .gte('createdAt', sevenDaysAgo),
      supabase
        .from('User')
        .select('id, name, email, onboard, createdAt, Space(slug)')
        .order('createdAt', { ascending: false })
        .limit(5),
      // Last 30 days signups for chart
      supabase
        .from('User')
        .select('createdAt')
        .gte('createdAt', thirtyDaysAgo)
        .order('createdAt', { ascending: true }),
      // Recent leads for activity feed
      supabase
        .from('Contact')
        .select('name, createdAt, Space(name)')
        .contains('tags', ['application-link'])
        .order('createdAt', { ascending: false })
        .limit(3),
      // Recent deals for activity feed
      supabase
        .from('Deal')
        .select('title, value, createdAt, Space(name)')
        .order('createdAt', { ascending: false })
        .limit(3),
      // Recent brokerages for activity feed
      supabase
        .from('Brokerage')
        .select('name, createdAt')
        .order('createdAt', { ascending: false })
        .limit(2),
    ]);

    totalUsers = totalRes.count ?? 0;
    onboardedUsers = onboardedRes.count ?? 0;
    usersWithSpace = withSpaceRes.count ?? 0;
    totalContacts = contactsRes.count ?? 0;
    totalLeads = leadsRes.count ?? 0;
    totalBrokerages = brokerageRes.count ?? 0;
    activeBrokerages = activeBrokerageRes.count ?? 0;
    signupsLast7 = signups7Res.count ?? 0;
    signupsLast30 = signups30Res.count ?? 0;
    leadsLast7 = leads7Res.count ?? 0;

    const dealRows = (dealsRes.data ?? []) as { value: number | null }[];
    totalDeals = dealRows.length;
    totalPipelineValue = dealRows.reduce((a, r) => a + (r.value ?? 0), 0);

    recentUsers = (recentRes.data ?? []).map((row: any) => ({
      id: row.id as string,
      name: row.name as string | null,
      email: row.email as string,
      onboard: row.onboard as boolean,
      createdAt: row.createdAt as string,
      space: row.Space?.slug ? { slug: row.Space.slug as string } : null,
    }));

    // Build signup chart data (last 30 days, grouped by day)
    const dayMap: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86_400_000);
      dayMap[d.toISOString().slice(0, 10)] = 0;
    }
    for (const row of signupsRaw.data ?? []) {
      const day = new Date((row as { createdAt: string }).createdAt).toISOString().slice(0, 10);
      if (day in dayMap) dayMap[day]++;
    }
    signupsByDay = Object.entries(dayMap).map(([date, count]) => ({ date, count }));

    // Build activity feed
    const activities: typeof recentActivity = [];
    for (const u of recentUsers.slice(0, 3)) {
      activities.push({
        type: 'signup',
        label: u.name || u.email,
        detail: u.onboard ? 'Signed up & onboarded' : 'Signed up (pending onboarding)',
        time: u.createdAt,
      });
    }
    for (const l of (recentLeads.data ?? []) as any[]) {
      activities.push({
        type: 'lead',
        label: l.name || 'New lead',
        detail: l.Space?.name ? `via ${l.Space.name}` : 'New lead submitted',
        time: l.createdAt,
      });
    }
    for (const d of (recentDeals.data ?? []) as any[]) {
      activities.push({
        type: 'deal',
        label: d.title || 'New deal',
        detail: d.value ? formatCompact(d.value) : 'Deal created',
        time: d.createdAt,
      });
    }
    for (const b of (recentBrokerages.data ?? []) as any[]) {
      activities.push({
        type: 'brokerage',
        label: b.name,
        detail: 'Brokerage created',
        time: b.createdAt,
      });
    }
    recentActivity = activities
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 8);

    // ── Revenue metrics ───────────────────────────────────────────────
    try {
      const subRes = await supabase.from('Space').select('stripeSubscriptionStatus');
      const statuses = (subRes.data ?? []) as { stripeSubscriptionStatus: string | null }[];
      totalSpaces = statuses.length;
      for (const row of statuses) {
        const s = row.stripeSubscriptionStatus;
        if (s === 'active') activeSubscriptions++;
        else if (s === 'trialing') trialUsers++;
        else if (s === 'past_due') pastDueUsers++;
        else if (s === 'canceled') canceledUsers++;
      }
      mrr = activeSubscriptions * 97;
      churnRate =
        activeSubscriptions + canceledUsers > 0
          ? Math.round((canceledUsers / (activeSubscriptions + canceledUsers)) * 100)
          : 0;
    } catch (e) {
      console.error('[admin] Revenue queries failed', e);
    }

    // ── Feature usage metrics ─────────────────────────────────────────
    try {
      const [contactSpaces, dealSpaces, tourSpaces, toursCount, followUpsCount] =
        await Promise.all([
          supabase.from('Contact').select('spaceId').limit(1000),
          supabase.from('Deal').select('spaceId').limit(1000),
          supabase.from('Tour').select('spaceId').limit(1000),
          supabase.from('Tour').select('*', { count: 'exact', head: true }),
          supabase
            .from('Contact')
            .select('*', { count: 'exact', head: true })
            .not('followUpAt', 'is', null),
        ]);
      spacesWithLeads = new Set(
        (contactSpaces.data ?? []).map((r: any) => r.spaceId).filter(Boolean)
      ).size;
      spacesWithDeals = new Set(
        (dealSpaces.data ?? []).map((r: any) => r.spaceId).filter(Boolean)
      ).size;
      spacesWithTours = new Set(
        (tourSpaces.data ?? []).map((r: any) => r.spaceId).filter(Boolean)
      ).size;
      totalTours = toursCount.count ?? 0;
      totalFollowUps = followUpsCount.count ?? 0;
    } catch (e) {
      console.error('[admin] Feature usage queries failed', e);
    }

    // ── Lead quality distribution ─────────────────────────────────────
    try {
      const scoreRes = await supabase
        .from('Contact')
        .select('scoreLabel')
        .not('scoreLabel', 'is', null)
        .limit(5000);
      for (const row of (scoreRes.data ?? []) as { scoreLabel: string }[]) {
        const label = row.scoreLabel?.toLowerCase();
        if (label === 'hot') hotLeads++;
        else if (label === 'warm') warmLeads++;
        else if (label === 'cold') coldLeads++;
        else if (label === 'unqualified') unqualifiedLeads++;
      }
    } catch (e) {
      console.error('[admin] Lead quality queries failed', e);
    }
  } catch (err) {
    console.error('[admin] DB queries failed', { error: err });
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            Couldn&apos;t load admin dashboard. This is usually temporary.
          </p>
          <a
            href="/admin"
            className="inline-block px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </a>
        </div>
      </div>
    );
  }

  const notOnboarded = totalUsers - onboardedUsers;
  const noSpace = totalUsers - usersWithSpace;
  const onboardRate = totalUsers > 0 ? Math.round((onboardedUsers / totalUsers) * 100) : 0;

  const activityIcon = {
    signup: UserPlus,
    lead: PhoneIncoming,
    deal: Briefcase,
    brokerage: Building2,
  };
  const activityColor = {
    signup: 'text-blue-500',
    lead: 'text-emerald-500',
    deal: 'text-cyan-500',
    brokerage: 'text-violet-500',
  };

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Chippi platform overview
          </p>
        </div>
      </div>

      {/* ── Quick Actions ────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <Link href="/admin/users">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Users size={14} />
            View all users
          </Button>
        </Link>
        <Link href="/admin/billing">
          <Button variant="outline" size="sm" className="gap-1.5">
            <CreditCard size={14} />
            View billing
          </Button>
        </Link>
        <Link href="/admin/audit-log">
          <Button variant="outline" size="sm" className="gap-1.5">
            <FileText size={14} />
            View audit log
          </Button>
        </Link>
        <Link href="/admin/spaces">
          <Button variant="outline" size="sm" className="gap-1.5">
            <LayoutGrid size={14} />
            View spaces
          </Button>
        </Link>
      </div>

      {/* ── Platform Overview ────────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Platform Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: 'Total users',
              value: totalUsers,
              sub: `+${signupsLast7} this week`,
              icon: Users,
              color: 'text-blue-500',
              accent: false,
            },
            {
              label: 'Onboarded',
              value: onboardedUsers,
              sub: `${onboardRate}% conversion`,
              icon: CheckCircle2,
              color: 'text-emerald-500',
              accent: false,
            },
            {
              label: 'Not onboarded',
              value: notOnboarded,
              sub: 'incomplete setup',
              icon: AlertTriangle,
              color: 'text-amber-500',
              accent: notOnboarded > 0,
            },
            {
              label: 'Brokerages',
              value: totalBrokerages,
              sub: `${activeBrokerages} active`,
              icon: Building2,
              color: 'text-violet-500',
              accent: false,
            },
          ].map(({ label, value, sub, icon: Icon, color, accent }) => (
            <Card
              key={label}
              className={`rounded-xl border bg-card ${
                accent
                  ? 'border-amber-300/50 bg-amber-50/30 dark:border-amber-500/20 dark:bg-amber-500/5'
                  : ''
              }`}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground font-medium">{label}</p>
                    <p
                      className={`text-2xl font-bold mt-0.5 tabular-nums ${
                        accent ? 'text-amber-600 dark:text-amber-400' : ''
                      }`}
                    >
                      {value}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
                  </div>
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      accent ? 'bg-amber-100 dark:bg-amber-500/10' : 'bg-muted'
                    }`}
                  >
                    <Icon
                      size={15}
                      className={accent ? 'text-amber-600 dark:text-amber-400' : color}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* ── Revenue ──────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Revenue</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            {
              label: 'MRR',
              value: `$${formatCompact(mrr)}`,
              sub: `${activeSubscriptions} active subs`,
              icon: DollarSign,
              color: 'text-emerald-500',
            },
            {
              label: 'Active subscribers',
              value: activeSubscriptions,
              sub: 'paying customers',
              icon: CheckCircle2,
              color: 'text-emerald-500',
            },
            {
              label: 'Trial users',
              value: trialUsers,
              sub: 'currently trialing',
              icon: CreditCard,
              color: 'text-blue-500',
            },
            {
              label: 'Past due',
              value: pastDueUsers,
              sub: 'payment failed',
              icon: CreditCard,
              color: 'text-amber-500',
            },
            {
              label: 'Churn rate',
              value: `${churnRate}%`,
              sub: `${canceledUsers} canceled`,
              icon: DollarSign,
              color: 'text-rose-500',
            },
          ].map(({ label, value, sub, icon: Icon, color }) => (
            <Card key={label} className="rounded-xl border bg-card">
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground font-medium">{label}</p>
                    <p className="text-2xl font-bold mt-0.5 tabular-nums">{value}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
                  </div>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-muted">
                    <Icon size={15} className={color} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* ── Activity ─────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Activity</h2>
        <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
          {[
            {
              label: 'Total leads',
              value: totalLeads,
              sub: `+${leadsLast7} this week`,
              icon: PhoneIncoming,
              color: 'text-cyan-500',
            },
            {
              label: 'Pipeline value',
              value: formatCompact(totalPipelineValue),
              sub: `${totalDeals} deals`,
              icon: TrendingUp,
              color: 'text-rose-500',
            },
          ].map(({ label, value, sub, icon: Icon, color }) => (
            <Card key={label} className="rounded-xl border bg-card">
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground font-medium">{label}</p>
                    <p className="text-2xl font-bold mt-0.5 tabular-nums">{value}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
                  </div>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-muted">
                    <Icon size={15} className={color} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* ── Feature Usage + Lead Quality (side by side) ───────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Feature Usage */}
        <Card className="rounded-xl border bg-card">
          <CardContent className="p-6">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Feature Adoption</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {[
                {
                  label: 'Spaces with leads',
                  value: spacesWithLeads,
                  total: totalSpaces,
                  icon: PhoneIncoming,
                  color: 'text-emerald-500',
                },
                {
                  label: 'Spaces with deals',
                  value: spacesWithDeals,
                  total: totalSpaces,
                  icon: Briefcase,
                  color: 'text-cyan-500',
                },
                {
                  label: 'Spaces with tours',
                  value: spacesWithTours,
                  total: totalSpaces,
                  icon: Calendar,
                  color: 'text-violet-500',
                },
                {
                  label: 'Total tours booked',
                  value: totalTours,
                  total: null,
                  icon: Calendar,
                  color: 'text-blue-500',
                },
                {
                  label: 'Follow-ups set',
                  value: totalFollowUps,
                  total: null,
                  icon: Bell,
                  color: 'text-amber-500',
                },
              ].map(({ label, value, total, icon: Icon, color }) => {
                const pct = total && total > 0 ? Math.round((value / total) * 100) : null;
                return (
                  <div key={label} className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-muted-foreground font-medium">{label}</p>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-muted">
                        <Icon size={13} className={color} />
                      </div>
                    </div>
                    <p className="text-xl font-bold tabular-nums">
                      {value}
                      {total !== null && (
                        <span className="text-sm font-normal text-muted-foreground">
                          {' '}
                          / {total}
                        </span>
                      )}
                    </p>
                    {pct !== null && (
                      <div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all duration-500"
                            style={{ width: `${Math.max(pct, 2)}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">{pct}% of spaces</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Lead Quality Distribution */}
        <Card className="rounded-xl border bg-card">
          <CardContent className="p-6">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Lead Quality</h2>
            <div className="grid grid-cols-2 gap-4">
              {[
                {
                  label: 'Hot leads',
                  value: hotLeads,
                  icon: Flame,
                  badgeColor: 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-500/15',
                  iconColor: 'text-red-500',
                },
                {
                  label: 'Warm leads',
                  value: warmLeads,
                  icon: Thermometer,
                  badgeColor: 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15',
                  iconColor: 'text-amber-500',
                },
                {
                  label: 'Cold leads',
                  value: coldLeads,
                  icon: Snowflake,
                  badgeColor: 'text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-500/15',
                  iconColor: 'text-blue-500',
                },
                {
                  label: 'Unqualified',
                  value: unqualifiedLeads,
                  icon: BarChart3,
                  badgeColor:
                    'text-gray-700 bg-gray-50 dark:text-gray-400 dark:bg-gray-500/15',
                  iconColor: 'text-gray-500',
                },
              ].map(({ label, value, icon: Icon, badgeColor, iconColor }) => (
                <div key={label} className="space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground font-medium">{label}</p>
                      <p className="text-2xl font-bold mt-0.5 tabular-nums">{value}</p>
                      <span
                        className={`inline-flex text-[10px] font-semibold rounded-full px-2 py-0.5 mt-1 ${badgeColor}`}
                      >
                        {label}
                      </span>
                    </div>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-muted">
                      <Icon size={15} className={iconColor} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Growth + Funnel row ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Signup chart */}
        <div className="lg:col-span-2">
          <Card className="rounded-xl border bg-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-semibold">User growth</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Signups over the last 30 days · {signupsLast30} total
                  </p>
                </div>
              </div>
              <SignupChart data={signupsByDay} />
            </CardContent>
          </Card>
        </div>

        {/* Conversion funnel */}
        <div>
          <Card className="rounded-xl border bg-card h-full">
            <CardContent className="p-6">
              <p className="text-sm font-semibold mb-1">Conversion funnel</p>
              <p className="text-xs text-muted-foreground mb-5">User journey breakdown</p>
              <div className="space-y-5">
                {[
                  { label: 'Signed up', value: totalUsers, pct: 100 },
                  {
                    label: 'Onboarded',
                    value: onboardedUsers,
                    pct: onboardRate,
                  },
                  {
                    label: 'Created workspace',
                    value: usersWithSpace,
                    pct: totalUsers > 0 ? Math.round((usersWithSpace / totalUsers) * 100) : 0,
                  },
                  {
                    label: 'Has leads',
                    value: totalLeads > 0 ? '—' : '0',
                    pct: totalUsers > 0 && totalLeads > 0 ? Math.min(Math.round((totalLeads / totalUsers) * 100), 100) : 0,
                  },
                ].map(({ label, value, pct }) => (
                  <div key={label}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-semibold tabular-nums">
                        {typeof value === 'number' ? value : value}{' '}
                        <span className="text-muted-foreground font-normal">({pct}%)</span>
                      </span>
                    </div>
                    <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Recent signups + Activity feed ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent signups */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Recent Signups</h2>
            <Link
              href="/admin/users"
              className="text-xs text-primary font-medium hover:underline underline-offset-2"
            >
              View all →
            </Link>
          </div>
          {recentUsers.length === 0 ? (
            <Card className="rounded-xl border bg-card">
              <CardContent className="p-6 text-center">
                <p className="text-sm text-muted-foreground">No users yet.</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="rounded-xl border bg-card">
              <div className="divide-y divide-border">
                {recentUsers.map((user) => (
                  <Link key={user.id} href={`/admin/users/${user.id}`}>
                    <div className="px-4 py-3 hover:bg-muted/50 transition-colors duration-150">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary flex-shrink-0">
                            {(user.name || user.email || '?')
                              .split(' ')
                              .map((n: string) => n[0])
                              .join('')
                              .toUpperCase()
                              .slice(0, 2)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">
                              {user.name || 'No name'}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {user.space?.slug && (
                            <span className="hidden sm:inline-flex text-[10px] font-medium text-primary bg-primary/10 rounded-full px-2 py-0.5">
                              {user.space.slug}
                            </span>
                          )}
                          <span
                            className={`inline-flex text-[10px] font-semibold rounded-full px-2 py-0.5 ${
                              user.onboard
                                ? 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15'
                                : 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15'
                            }`}
                          >
                            {user.onboard ? 'Onboarded' : 'Pending'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Activity feed */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Recent Activity</h2>
          {recentActivity.length === 0 ? (
            <Card className="rounded-xl border bg-card">
              <CardContent className="p-6 text-center">
                <p className="text-sm text-muted-foreground">No activity yet.</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="rounded-xl border bg-card">
              <div className="divide-y divide-border">
                {recentActivity.map((item, i) => {
                  const Icon = activityIcon[item.type];
                  const color = activityColor[item.type];
                  const ago = timeAgo(item.time);
                  return (
                    <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                        <Icon size={14} className={color} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{item.label}</p>
                        <p className="text-xs text-muted-foreground truncate">{item.detail}</p>
                      </div>
                      <span className="text-xs text-muted-foreground flex-shrink-0">{ago}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
