import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { supabase } from '@/lib/supabase';

/**
 * /auth/redirect?intent=realtor|broker
 *
 * Called after Clerk sign-in from either login page.
 *
 * - intent=broker  → if the user is a broker_owner or broker_manager, go to /broker
 *                    otherwise fall back to the realtor flow
 * - intent=realtor → go to the user's workspace, or /setup if none yet
 * - no intent      → same as realtor
 */
export default async function AuthRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const { intent } = await searchParams;

  // Look up the user row
  const { data: user } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', userId)
    .maybeSingle();

  if (!user) {
    // New user — send to setup regardless of intent
    redirect('/setup');
  }

  if (intent === 'broker') {
    // Check for broker-level membership
    const { data: membership } = await supabase
      .from('BrokerageMembership')
      .select('id, role')
      .eq('userId', user.id)
      .in('role', ['broker_owner', 'broker_manager'])
      .maybeSingle();

    if (membership) {
      redirect('/broker');
    }

    // They logged in via the broker page but don't have broker access yet.
    // Send them to the brokerage setup page so they can create or join one.
    redirect('/brokerage');
  }

  // intent=realtor (or no intent) — go to workspace or setup
  const { data: space } = await supabase
    .from('Space')
    .select('slug')
    .eq('ownerId', user.id)
    .maybeSingle();

  if (space?.slug) {
    redirect(`/s/${space.slug}`);
  }

  redirect('/setup');
}
