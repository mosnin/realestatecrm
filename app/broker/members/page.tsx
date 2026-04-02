import { getBrokerContext } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { RemoveMemberButton } from '@/components/broker/remove-member-button';
import { ChangeRoleButton } from '@/components/broker/change-role-button';
import { MembersRoleFilter } from '@/components/broker/members-role-filter';

export default async function BrokerMembersPage() {
  const ctx = await getBrokerContext();
  if (!ctx) redirect('/');

  try {

  const { data: memberships } = await supabase
    .from('BrokerageMembership')
    .select('id, role, createdAt, userId')
    .eq('brokerageId', ctx.brokerage.id)
    .order('createdAt', { ascending: true });

  const rawMembers = (memberships ?? []) as Array<{ id: string; role: string; createdAt: string; userId: string }>;
  const userIds = rawMembers.map((m) => m.userId).filter(Boolean);

  // Batch-fetch users and spaces separately to avoid ambiguous FK joins
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
    User: userMap.get(m.userId) ?? null,
    Space: spaceMap.get(m.userId) ?? null,
  })) as Array<{
    id: string;
    role: string;
    createdAt: string;
    userId: string;
    User: { id: string; name: string | null; email: string; onboard: boolean } | null;
    Space: { slug: string } | null;
  }>;

  const roleLabel = (role: string) =>
    role === 'broker_owner' ? 'Owner' : role === 'broker_admin' ? 'Admin' : 'Realtor';

  const roleBadgeClass = (role: string) => {
    switch (role) {
      case 'broker_owner':
        return 'text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-500/15';
      case 'broker_admin':
        return 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15';
      default:
        return 'text-muted-foreground bg-muted';
    }
  };

  const adminCount = members.filter((m) => m.role === 'broker_admin' || m.role === 'broker_owner').length;
  const memberCount = members.filter((m) => m.role === 'realtor_member').length;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Members</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {members.length} {members.length === 1 ? 'member' : 'members'} in {ctx.brokerage.name}
            <span className="mx-1.5">·</span>
            <span className="text-amber-600 dark:text-amber-400">{adminCount} {adminCount === 1 ? 'admin' : 'admins'}</span>
            <span className="mx-1.5">·</span>
            <span>{memberCount} {memberCount === 1 ? 'member' : 'members'}</span>
          </p>
        </div>
      </div>

      {members.length === 0 ? (
        <Card>
          <CardContent className="px-5 py-8 text-center space-y-2">
            <p className="text-sm text-muted-foreground">No members yet.</p>
            <div className="flex items-center justify-center gap-3">
              <a href="/broker/invitations" className="text-xs text-primary font-medium hover:underline underline-offset-2">
                Send an email invite →
              </a>
              <span className="text-xs text-muted-foreground">or</span>
              <a href="/broker/invitations" className="text-xs text-primary font-medium hover:underline underline-offset-2">
                Share an invite code →
              </a>
            </div>
          </CardContent>
        </Card>
      ) : (
        <MembersRoleFilter
          members={members.map((m) => ({ id: m.id, name: m.User?.name ?? null, email: m.User?.email ?? null, role: m.role }))}
        >
          {(visibleIds) => (
            <div className="space-y-2">
              {members.filter((m) => visibleIds.has(m.id)).map((m) => {
                const user = m.User;
                const initials = ((user?.name ?? user?.email ?? '?').split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2));
                const joinedAt = new Date(m.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                // Owner can manage admins and members; admin can only manage members
                const canManage =
                  m.role !== 'broker_owner' &&
                  (ctx.membership.role === 'broker_owner' ||
                    (ctx.membership.role === 'broker_admin' && m.role === 'realtor_member'));
                return (
                  <div key={m.id} className="rounded-xl border border-border bg-card px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary flex-shrink-0">
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{user?.name ?? 'No name'}</p>
                          <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 text-right">
                        <div className="hidden sm:block text-right">
                          <p className="text-xs text-muted-foreground">Joined {joinedAt}</p>
                          {m.Space?.slug && (
                            <p className="text-xs text-primary font-medium">/{m.Space?.slug}</p>
                          )}
                        </div>
                        <span className={`hidden sm:inline-flex text-xs font-medium rounded-full px-2.5 py-0.5 ${roleBadgeClass(m.role)}`}>
                          {roleLabel(m.role)}
                        </span>
                        {user?.onboard ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2.5 py-0.5 text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15">
                            <CheckCircle2 size={11} /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2.5 py-0.5 text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15">
                            <AlertCircle size={11} /> Pending
                          </span>
                        )}
                        {canManage && (
                          <>
                            <ChangeRoleButton
                              membershipId={m.id}
                              currentRole={m.role}
                              memberName={user?.name ?? user?.email ?? 'this member'}
                            />
                            <RemoveMemberButton
                              membershipId={m.id}
                              memberName={user?.name ?? user?.email ?? 'this member'}
                            />
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {visibleIds.size === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">No members match your search.</p>
              )}
            </div>
          )}
        </MembersRoleFilter>
      )}
    </div>
  );
  } catch (err) {
    console.error('[broker/members] Page render error:', err);
    return (
      <div className="p-8 text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-sm text-muted-foreground mt-2">Unable to load members. Please try refreshing the page.</p>
      </div>
    );
  }
}
