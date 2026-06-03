import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { resolveBrokerContext } from '@/lib/agent/broker-context';
import { H1, TITLE_FONT, BODY_MUTED } from '@/lib/typography';
import { cn } from '@/lib/utils';
import { BrokerPropertiesClient } from './properties-client';

export const metadata: Metadata = { title: 'Properties — Brokerage' };

export default async function BrokerPropertiesPage() {
  const ctx = await resolveBrokerContext();
  if (!ctx) redirect('/');

  return (
    <div className="space-y-6 max-w-4xl pb-56 md:pb-24">
      <header className="space-y-1.5">
        <p className={cn(BODY_MUTED)}>Properties.</p>
        <h1 className={cn(H1)} style={TITLE_FONT}>
          Your brokerage&rsquo;s pool
        </h1>
        <p className={cn(BODY_MUTED)}>
          Your brokerage&rsquo;s shared listings. Assign them to your realtors.
        </p>
      </header>

      <BrokerPropertiesClient />
    </div>
  );
}
