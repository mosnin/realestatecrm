import { getBrokerContext } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export default async function BrokerMembersPage() {
  const ctx = await getBrokerContext();
  if (!ctx) redirect('/dashboard');

  const { data: memberships } = await supabase
    .from('BrokerageMembership')
    .select('id, role, createdAt, userId, User(id, name, email, onboard), Space!Space_ownerId_fkey(slug)')
    .eq('brokerageId', ctx.brokerage.id)
    .order('createdAt', { ascending: true });

  const members = (memberships ?? []) as Array<{
    id: string;
    role: string;
    createdAt: string;
    userId: string;
    User: { id: string; name: string | null; email: string; onboard: boolean } | null;
    Space: { slug: string } | null;
  }>;

  const roleLabel = (role: string) =>
    role === 'broker_owner' ? 'Owner' : role === 'broker_manager' ? 'Manager' : 'Realtor';

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Members</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {members.length} {members.length === 1 ? 'member' : 'members'} in {ctx.brokerage.name}
        </p>
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
          {members.map((m) => {
            const user = m.User;
            const initials = ((user?.name ?? user?.email ?? '?').split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2));
            const joinedAt = new Date(m.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
                      <p className="text-[10px] text-muted-foreground">Joined {joinedAt}</p>
                      {m.Space?.slug && (
                        <p className="text-[10px] text-primary font-medium">/{m.Space.slug}</p>
                      )}
                    </div>
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
  );
}
