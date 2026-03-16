import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getBrokerContext } from '@/lib/permissions';
import { BrokerageSetupClient } from './brokerage-setup-client';

export const metadata = { title: 'Brokerage Setup — Chippi' };

export default async function BrokeragePage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  // Get user + space
  const { data: user } = await supabase
    .from('User')
    .select('id, onboard')
    .eq('clerkId', userId)
    .maybeSingle();

  if (!user) redirect('/setup');
  if (!user.onboard) redirect('/setup');

  const { data: space } = await supabase
    .from('Space')
    .select('slug')
    .eq('ownerId', user.id)
    .maybeSingle();

  if (!space) redirect('/setup');

  // Check existing broker membership
  let existingBrokerageName: string | null = null;
  let existingBrokerageId: string | null = null;
  try {
    const ctx = await getBrokerContext();
    if (ctx) {
      existingBrokerageName = ctx.brokerage.name;
      existingBrokerageId = ctx.brokerage.id;
    }
  } catch {
    // non-blocking
  }

  return (
    <BrokerageSetupClient
      spaceSlug={space.slug}
      existingBrokerageName={existingBrokerageName}
      existingBrokerageId={existingBrokerageId}
    />
  );
}
