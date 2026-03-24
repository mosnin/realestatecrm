import { getBrokerContext } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { InviteForm } from '@/components/broker/invite-form';
import { InviteCodeCard } from '@/components/broker/invite-code-card';
import { RevokeInviteButton } from '@/components/broker/revoke-invite-button';
import { BulkInviteForm } from '@/components/broker/bulk-invite-form';

const statusBadge = (status: string) => {
  switch (status) {
    case 'pending':
      return 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15';
    case 'accepted':
      return 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15';
    default:
      return 'text-muted-foreground bg-muted';
  }
};

export default async function BrokerInvitationsPage() {
  const ctx = await getBrokerContext();
  if (!ctx) redirect('/');

  const { data: invitations } = await supabase
    .from('Invitation')
    .select('*')
    .eq('brokerageId', ctx.brokerage.id)
    .order('createdAt', { ascending: false });

  const invs = (invitations ?? []) as Array<{
    id: string;
    email: string;
    roleToAssign: string;
    status: string;
    expiresAt: string;
    createdAt: string;
  }>;

  const roleLabel = (role: string) => (role === 'broker_admin' ? 'Admin' : 'Realtor');

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Invitations</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Invite realtors to join {ctx.brokerage.name}
        </p>
      </div>

      <InviteCodeCard isOwner={ctx.membership.role === 'broker_owner'} />

      <Card>
        <CardContent className="px-5 py-4 space-y-3">
          <p className="text-sm font-medium">Send an email invitation</p>
          <InviteForm />
        </CardContent>
      </Card>

      <BulkInviteForm />

      <div>
        <p className="text-sm font-semibold mb-3">Sent invitations</p>
        {invs.length === 0 ? (
          <Card>
            <CardContent className="px-5 py-8 text-center">
              <p className="text-sm text-muted-foreground">No invitations sent yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {invs.map((inv) => {
              const sentAt = new Date(inv.createdAt).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
              });
              const expiresAt = new Date(inv.expiresAt).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric',
              });
              return (
                <div key={inv.id} className="rounded-xl border border-border bg-card px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{inv.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {roleLabel(inv.roleToAssign)} · Sent {sentAt}
                        {inv.status === 'pending' && ` · Expires ${expiresAt}`}
                      </p>
                    </div>
                    <span
                      className={`inline-flex text-[10px] font-semibold rounded-full px-2 py-0.5 capitalize flex-shrink-0 ${statusBadge(inv.status)}`}
                    >
                      {inv.status}
                    </span>
                    {inv.status === 'pending' && (
                      <RevokeInviteButton invitationId={inv.id} />
                    )}
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
