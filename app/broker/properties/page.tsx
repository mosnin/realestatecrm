import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { resolveBrokerContext } from '@/lib/agent/broker-context';
import { BrokerPropertiesClient } from './properties-client';
import { BROKER_PAGE_READING } from '@/components/broker/premium';

export const metadata: Metadata = { title: 'Properties — Brokerage' };

export default async function BrokerPropertiesPage() {
  const ctx = await resolveBrokerContext();
  if (!ctx) redirect('/');

  return (
    <div className={BROKER_PAGE_READING} data-broker-premium-page="properties">
      <BrokerPropertiesClient />
    </div>
  );
}
