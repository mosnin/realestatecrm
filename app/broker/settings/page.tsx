import { getBrokerContext } from '@/lib/permissions';
import { redirect } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { BrokerageSettingsForm } from '@/components/broker/settings-form';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'General Settings — Broker Dashboard' };

export default async function BrokerSettingsPage() {
  const ctx = await getBrokerContext();
  if (!ctx) redirect('/');

  const { brokerage, membership } = ctx;
  const canEdit = membership.role === 'broker_owner' || membership.role === 'broker_admin';

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">General</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your brokerage name, logo, website, and join code
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

      {!canEdit && (
        <Card>
          <CardContent className="px-5 py-5">
            <p className="text-sm text-muted-foreground">
              Only the brokerage owner or admins can edit settings.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
