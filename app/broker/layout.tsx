import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getBrokerContext } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { BrokerShell } from '@/components/broker/broker-shell';

export const metadata = { title: 'Broker Dashboard — Chippi' };

export default async function BrokerLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getBrokerContext();

  // Not a broker — redirect to their configure page so they can create a brokerage
  if (!ctx) {
    const { userId: clerkId } = await auth();
    if (clerkId) {
      const { data: user } = await supabase
        .from('User')
        .select('id')
        .eq('clerkId', clerkId)
        .maybeSingle();
      if (user) {
        const { data: space } = await supabase
          .from('Space')
          .select('slug')
          .eq('ownerId', user.id)
          .maybeSingle();
        if (space?.slug) redirect(`/s/${space.slug}/configure`);
      }
    }
    redirect('/');
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
