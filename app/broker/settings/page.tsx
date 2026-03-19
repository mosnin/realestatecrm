import { getBrokerContext } from '@/lib/permissions';
import { redirect } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { BrokerageSettingsForm } from '@/components/broker/settings-form';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Settings — Broker Dashboard' };

export default async function BrokerSettingsPage() {
  const ctx = await getBrokerContext();
  if (!ctx) redirect('/');

  const { brokerage, membership } = ctx;
  const isOwner = membership.role === 'broker_owner';

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
            isOwner={isOwner}
          />
        </CardContent>
      </Card>
    </div>
  );
}
