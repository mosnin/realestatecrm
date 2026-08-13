import { redirect } from 'next/navigation';
import { resolveBrokerContext } from '@/lib/agent/broker-context';
import { BrokerPeopleTable } from './broker-people-table';
import type { Metadata } from 'next';
import { BROKER_PAGE_WIDE } from '@/components/broker/premium';

export const metadata: Metadata = { title: 'People' };

export default async function BrokerPeoplePage() {
  const ctx = await resolveBrokerContext();
  if (!ctx) redirect('/');

  return (
    <div className={BROKER_PAGE_WIDE} data-broker-premium-page="people">
      <BrokerPeopleTable />
    </div>
  );
}
