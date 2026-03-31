import { getBrokerContext } from '@/lib/permissions';
import { redirect } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { BrokerageSettingsForm } from '@/components/broker/settings-form';
import { InviteCodeCard } from '@/components/broker/invite-code-card';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Settings — Broker Dashboard' };

export default async function BrokerSettingsPage() {
  const ctx = await getBrokerContext();
  if (!ctx) redirect('/');

  const { brokerage, membership } = ctx;
  const canEdit = membership.role === 'broker_owner' || membership.role === 'broker_admin';

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Brokerage Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your brokerage profile and branding
        </p>
      </div>

      <Card>
        <CardContent className="px-5 py-5">
          <BrokerageSettingsForm
            name={brokerage.name}
            websiteUrl={brokerage.websiteUrl}
            logoUrl={brokerage.logoUrl}
            joinCode={brokerage.joinCode}
            isOwner={canEdit}
          />
        </CardContent>
      </Card>

      {canEdit && (
        <>
          <div>
            <h2 className="text-base font-semibold tracking-tight">Invite Code</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Share this code to let realtors join your brokerage
            </p>
          </div>
          <InviteCodeCard isOwner={canEdit} />
        </>
      )}

      {!canEdit && (
        <Card>
          <CardContent className="px-5 py-5">
            <p className="text-sm text-muted-foreground">
              Only the brokerage owner or admins can edit settings and manage invite codes.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
