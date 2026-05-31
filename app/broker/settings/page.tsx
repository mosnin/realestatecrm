import { getBrokerContext } from '@/lib/permissions';
import { redirect } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { BrokerageSettingsForm } from '@/components/broker/settings-form';
import { BrokerageIntakeTrustSignalsForm } from '@/components/broker/intake-trust-signals-form';
import { H1, TITLE_FONT, BODY_MUTED } from '@/lib/typography';
import { cn } from '@/lib/utils';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'General Settings — Teams' };

export default async function BrokerSettingsPage() {
  const ctx = await getBrokerContext();
  if (!ctx) redirect('/');

  const { brokerage, membership } = ctx;
  const canEdit = membership.role === 'broker_owner' || membership.role === 'broker_admin';

  return (
    <div className="space-y-6 max-w-2xl">
      <header className="space-y-1.5">
        <p className={cn(BODY_MUTED)}>Settings.</p>
        <h1 className={cn(H1)} style={TITLE_FONT}>
          General
        </h1>
        <p className={cn(BODY_MUTED)}>
          Workspace and brokerage preferences.
        </p>
      </header>

      <Card>
        <CardContent className="px-5 py-5">
          <BrokerageSettingsForm
            name={brokerage.name}
            websiteUrl={brokerage.websiteUrl}
            logoUrl={brokerage.logoUrl}
            joinCode={brokerage.joinCode}
            privacyPolicyHtml={brokerage.privacyPolicyHtml ?? null}
            isOwner={canEdit}
          />
        </CardContent>
      </Card>

      <div>
        <h2 className="text-base font-semibold tracking-tight">Compliance &amp; trust signals</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          License number, Fair Housing notice, and Equal Housing mark for the
          brokerage intake footer.
        </p>
      </div>

      <Card>
        <CardContent className="px-5 py-5">
          <BrokerageIntakeTrustSignalsForm
            licenseNumber={brokerage.brokerageLicenseNumber ?? ''}
            fairHousingNotice={brokerage.brokerageFairHousingNotice ?? ''}
            showEqualHousingMark={brokerage.brokerageShowEqualHousingMark ?? false}
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
