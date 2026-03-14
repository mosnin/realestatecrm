import { getBrokerContext } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Users, PhoneIncoming, FileText, Mail, CheckCircle2, AlertCircle } from 'lucide-react';

export default async function BrokerOverviewPage() {
  const ctx = await getBrokerContext();
  if (!ctx) redirect('/');

  const { brokerage } = ctx;

  // Fetch members with their user + space info
  const { data: memberships } = await supabase
    .from('BrokerageMembership')
    .select('id, role, createdAt, userId, User(id, name, email, onboard), Space!Space_ownerId_fkey(slug)')
    .eq('brokerageId', brokerage.id)
    .order('createdAt', { ascending: true });

  const members = (memberships ?? []) as Array<{
    id: string;
    role: string;
    createdAt: string;
    userId: string;
    User: { id: string; name: string | null; email: string; onboard: boolean } | null;
    Space: { slug: string } | null;
  }>;

  const memberUserIds = members.map((m) => m.userId);

  // Aggregate stats across member spaces
  let totalLeads = 0, totalApplications = 0, pendingInvites = 0;
  try {
    const { data: spaces } = memberUserIds.length > 0
      ? await supabase.from('Space').select('id').in('ownerId', memberUserIds)
      : { data: [] };
    const spaceIds = (spaces ?? []).map((s) => s.id);

    const [leadsRes, appsRes, invRes] = await Promise.all([
      spaceIds.length > 0
        ? supabase.from('Contact').select('*', { count: 'exact', head: true }).in('spaceId', spaceIds).contains('tags', ['new-lead'])
        : { count: 0 },
      spaceIds.length > 0
        ? supabase.from('Contact').select('*', { count: 'exact', head: true }).in('spaceId', spaceIds).contains('tags', ['application-link'])
        : { count: 0 },
      supabase.from('Invitation').select('*', { count: 'exact', head: true }).eq('brokerageId', brokerage.id).eq('status', 'pending'),
    ]);

    totalLeads = leadsRes.count ?? 0;
    totalApplications = appsRes.count ?? 0;
    pendingInvites = invRes.count ?? 0;
  } catch {
    // non-blocking
  }

  const stats = [
    { label: 'Members', value: members.length, icon: Users },
    { label: 'Pending invites', value: pendingInvites, icon: Mail },
    { label: 'Leads needing follow-up', value: totalLeads, icon: PhoneIncoming },
    { label: 'Applications received', value: totalApplications, icon: FileText },
  ];

  const roleLabel = (role: string) =>
    role === 'broker_owner' ? 'Owner' : role === 'broker_manager' ? 'Manager' : 'Realtor';

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{brokerage.name}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Brokerage overview</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="px-4 py-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{label}</p>
                  <p className="text-2xl font-bold mt-0.5">{value}</p>
                </div>
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                  <Icon size={15} className="text-muted-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent members */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold">Members</p>
          <a href="/broker/members" className="text-xs text-primary font-medium hover:underline underline-offset-2">
            View all →
          </a>
        </div>
        {members.length === 0 ? (
          <Card>
            <CardContent className="px-5 py-8 text-center">
              <p className="text-sm text-muted-foreground">No members yet.</p>
              <a href="/broker/invitations" className="text-xs text-primary font-medium hover:underline underline-offset-2 mt-2 inline-block">
                Invite realtors →
              </a>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {members.slice(0, 5).map((m) => {
              const user = m.User;
              const initials = ((user?.name ?? user?.email ?? '?').split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2));
              return (
                <div key={m.id} className="rounded-xl border border-border bg-card px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary flex-shrink-0">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{user?.name ?? 'No name'}</p>
                        <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="hidden sm:inline-flex text-[10px] font-medium text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                        {roleLabel(m.role)}
                      </span>
                      {user?.onboard ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15">
                          <CheckCircle2 size={10} /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15">
                          <AlertCircle size={10} /> Pending
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
