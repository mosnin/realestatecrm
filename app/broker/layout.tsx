import { redirect } from 'next/navigation';
import { getBrokerContext } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { BrokerShell } from '@/components/broker/broker-shell';

export const metadata = { title: 'Broker Dashboard — Chippi' };

export default async function BrokerLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getBrokerContext();

  // Not a broker — redirect to the dedicated brokerage setup page
  if (!ctx) {
    redirect('/brokerage');
  }

  // Look up their realtor workspace slug for the "back" link
  const { data: space } = await supabase
    .from('Space')
    .select('slug')
    .eq('ownerId', ctx.dbUserId)
    .maybeSingle();

  const realtorSlug = space?.slug ?? '';

  return (
    <BrokerShell brokerageName={ctx.brokerage.name} realtorSlug={realtorSlug}>
      {children}
    </BrokerShell>
  );
}
