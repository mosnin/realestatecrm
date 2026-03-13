import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import {
  Users,
  CheckCircle2,
  AlertTriangle,
  PhoneIncoming,
  Building2,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';

export default async function AdminOverviewPage() {
  let totalUsers = 0, onboardedUsers = 0, usersWithSpace = 0, totalContacts = 0, totalLeads = 0;
  let recentUsers: { id: string; name: string | null; email: string; onboard: boolean; createdAt: Date; space: { slug: string } | null }[] = [];

  try {
    const [totalRes, onboardedRes, withSpaceRes, contactsRes, leadsRes, recentRes] =
      await Promise.all([
        supabase.from('User').select('*', { count: 'exact', head: true }),
        supabase.from('User').select('*', { count: 'exact', head: true }).eq('onboard', true),
        supabase.from('User').select('*, Space!inner(id)', { count: 'exact', head: true }),
        supabase.from('Contact').select('*', { count: 'exact', head: true }),
        supabase.from('Contact').select('*', { count: 'exact', head: true }).contains('tags', ['application-link']),
        supabase.from('User').select('id, name, email, onboard, createdAt, Space(slug)').order('createdAt', { ascending: false }).limit(5),
      ]);

    if (totalRes.error) throw totalRes.error;
    if (onboardedRes.error) throw onboardedRes.error;
    if (withSpaceRes.error) throw withSpaceRes.error;
    if (contactsRes.error) throw contactsRes.error;
    if (leadsRes.error) throw leadsRes.error;
    if (recentRes.error) throw recentRes.error;

    totalUsers = totalRes.count ?? 0;
    onboardedUsers = onboardedRes.count ?? 0;
    usersWithSpace = withSpaceRes.count ?? 0;
    totalContacts = contactsRes.count ?? 0;
    totalLeads = leadsRes.count ?? 0;
    recentUsers = (recentRes.data ?? []).map((row: any) => ({
      id: row.id as string,
      name: row.name as string | null,
      email: row.email as string,
      onboard: row.onboard as boolean,
      createdAt: row.createdAt as Date,
      space: row.Space?.slug ? { slug: row.Space.slug as string } : null,
    }));
  } catch (err) {
    console.error('[admin] DB queries failed', { error: err });
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">Couldn&apos;t load admin dashboard. This is usually temporary.</p>
          <a href="/admin" className="inline-block px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90">Try again</a>
        </div>
      </div>
    );
  }

  const notOnboarded = totalUsers - onboardedUsers;
  const noSpace = totalUsers - usersWithSpace;

  const stats = [
    {
      label: 'Total users',
      value: totalUsers,
      sub: 'all accounts',
      icon: Users,
      accent: false,
    },
    {
      label: 'Onboarded',
      value: onboardedUsers,
      sub: `${totalUsers > 0 ? Math.round((onboardedUsers / totalUsers) * 100) : 0}% complete`,
      icon: CheckCircle2,
      accent: false,
    },
    {
      label: 'Not onboarded',
      value: notOnboarded,
      sub: 'incomplete setup',
      icon: AlertTriangle,
      accent: notOnboarded > 0,
    },
    {
      label: 'No workspace',
      value: noSpace,
      sub: 'missing space',
      icon: XCircle,
      accent: noSpace > 0,
    },
    {
      label: 'Workspaces',
      value: usersWithSpace,
      sub: 'active spaces',
      icon: Building2,
      accent: false,
    },
    {
      label: 'Total leads',
      value: totalLeads,
      sub: `${totalContacts} contacts total`,
      icon: PhoneIncoming,
      accent: false,
    },
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Platform health and user metrics
        </p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {stats.map(({ label, value, sub, icon: Icon, accent }) => (
          <Card
            key={label}
            className={accent ? 'border-amber-300/50 bg-amber-50/30 dark:border-amber-500/20 dark:bg-amber-500/5' : ''}
          >
            <CardContent className="px-4 py-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">
                    {label}
                  </p>
                  <p
                    className={`text-2xl font-bold mt-0.5 ${accent ? 'text-amber-600 dark:text-amber-400' : ''}`}
                  >
                    {value}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
                </div>
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    accent
                      ? 'bg-amber-100 dark:bg-amber-500/10'
                      : 'bg-muted'
                  }`}
                >
                  <Icon
                    size={15}
                    className={
                      accent
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-muted-foreground'
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent signups */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold">Recent signups</p>
          <Link
            href="/admin/users"
            className="text-xs text-primary font-medium hover:underline underline-offset-2"
          >
            View all users →
          </Link>
        </div>
        {recentUsers.length === 0 ? (
          <Card>
            <CardContent className="px-5 py-8 text-center">
              <p className="text-sm text-muted-foreground">No users yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {recentUsers.map((user) => (
              <Link key={user.id} href={`/admin/users/${user.id}`}>
                <div className="rounded-xl border border-border bg-card px-4 py-3 hover:shadow-sm transition-all duration-150">
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
                        <p className="text-xs text-muted-foreground truncate">
                          {user.email}
                        </p>
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
        )}
      </div>
    </div>
  );
}
