import { supabase } from '@/lib/supabase';
import { Mail } from 'lucide-react';
import { isPlatformAdmin } from '@/lib/permissions';
import { redirect } from 'next/navigation';
import { RevokeInvitation } from './revoke-invitation';
import { AdminPageHeader } from '@/app/admin/components/admin-page-header';
import { EmptyState } from '@/components/ui/empty-state';

const statusStyle = (status: string) => {
  switch (status) {
    case 'pending':  return 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15';
    case 'accepted': return 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15';
    default:         return 'text-muted-foreground bg-muted';
  }
};

export default async function AdminInvitationsPage() {
  const isAdmin = await isPlatformAdmin();
  if (!isAdmin) redirect('/');
  const { data: invitations, error } = await supabase
    .from('Invitation')
    .select('id, email, roleToAssign, status, expiresAt, createdAt, brokerageId, Brokerage(name)')
    .order('createdAt', { ascending: false })
    .limit(200);

  if (error) {
    return (
      <div className="space-y-8 pb-12 max-w-5xl mx-auto">
        <AdminPageHeader eyebrow="Management." title="Invitations" />
        <EmptyState
          icon={Mail}
          title="Couldn’t load invitations."
          description="This is usually temporary. Reload to try again."
          action={{ label: 'Reload', href: '/admin/invitations' }}
        />
      </div>
    );
  }

  const invs = (invitations ?? []) as unknown as Array<{
    id: string;
    email: string;
    roleToAssign: string;
    status: string;
    expiresAt: string;
    createdAt: string;
    brokerageId: string | null;
    Brokerage: { name: string } | null;
  }>;

  const roleLabel = (r: string) => r === 'broker_admin' ? 'Admin' : 'Realtor';

  return (
    <div className="space-y-8 pb-12 max-w-5xl mx-auto">
      <AdminPageHeader
        eyebrow="Management."
        title="Invitations"
        subtitle={`${invs.length} invitation${invs.length !== 1 ? 's' : ''} across all brokerages.`}
      />

      {invs.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="No invitations yet."
          description="Invitations sent from any brokerage will show up here."
        />
      ) : (
        <div className="space-y-2">
          {invs.map((inv) => {
            const sentAt = new Date(inv.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const expiresAt = new Date(inv.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            return (
              <div key={inv.id} className="rounded-xl border border-border bg-card px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{inv.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {inv.Brokerage?.name ?? '—'} · {roleLabel(inv.roleToAssign)} · Sent {sentAt}
                      {inv.status === 'pending' && ` · Expires ${expiresAt}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`inline-flex text-[10px] font-semibold rounded-full px-2 py-0.5 capitalize ${statusStyle(inv.status)}`}>
                      {inv.status}
                    </span>
                    {inv.status === 'pending' && (
                      <RevokeInvitation invitationId={inv.id} email={inv.email} />
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
