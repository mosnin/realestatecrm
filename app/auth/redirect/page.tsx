import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * /auth/redirect?intent=realtor|broker
 *
 * Called after Clerk sign-in from either login page.
 *
 * - intent=broker  → if the user is a broker_owner or broker_admin, go to /broker
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
  if (!userId) redirect('/login/realtor');

  const { intent } = await searchParams;

  // Look up the user row. A query ERROR is not "no user" — treating it as
  // missing used to send existing realtors into /setup (which can upsert a
  // second User row) instead of retrying the workspace load. If `accountType`
  // is missing in this environment, retry with just `id`.
  let user: { id: string; accountType?: string | null } | null = null;
  {
    const full = await supabase
      .from('User')
      .select('id, accountType')
      .eq('clerkId', userId)
      .maybeSingle();
    if (full.error) {
      const core = await supabase
        .from('User')
        .select('id')
        .eq('clerkId', userId)
        .maybeSingle();
      if (core.error) {
        console.error('[auth/redirect] User lookup failed', { clerkId: userId, error: full.error });
        return (
          <div className="flex min-h-screen items-center justify-center bg-background">
            <div className="text-center space-y-4 p-8">
              <h1 className="text-xl font-semibold">Something went wrong</h1>
              <p className="text-sm text-muted-foreground">
                We couldn&apos;t load your workspace. This is usually temporary.
              </p>
              <a
                href="/auth/redirect"
                className="inline-block px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Try again
              </a>
            </div>
          </div>
        );
      }
      user = core.data as { id: string } | null;
    } else {
      user = full.data as { id: string; accountType?: string | null } | null;
    }
  }

  if (!user) {
    // New user — check if they have a pending invitation before sending to setup.
    // This handles the case where Clerk's forceRedirectUrl didn't work and the
    // user ended up here after signing up for a brokerage invitation.
    try {
      const clerkUser = await currentUser();
      const email = clerkUser?.emailAddresses?.[0]?.emailAddress?.trim().toLowerCase();
      if (email) {
        const { data: pendingInvite } = await supabase
          .from('Invitation')
          .select('token')
          .eq('email', email)
          .eq('status', 'pending')
          .gt('expiresAt', new Date().toISOString())
          .order('createdAt', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (pendingInvite?.token) {
          redirect(`/invite/${pendingInvite.token}`);
        }
      }
    } catch {
      // Non-blocking — fall through to setup if invite check fails
    }
    // Preserve broker intent across the redirect: a brand-new user who signed in
    // via the broker entry point goes to the broker onboarding flow
    // (/setup?type=broker collects brokerage data) instead of the realtor quick
    // path, so the broker intent survives Clerk's redirect to /auth/redirect.
    redirect(intent === 'broker' ? '/setup?type=broker' : '/setup');
  }

  // If user already has broker-level membership, always route to /broker.
  // This prevents invited broker_admin users from being pushed into setup/paywall
  // when they authenticate through non-broker entry points.
  const { data: brokerMembership } = await supabase
    .from('BrokerageMembership')
    .select('id')
    .eq('userId', user.id)
    .in('role', ['broker_owner', 'broker_admin'])
    .maybeSingle();
  if (brokerMembership) {
    redirect('/broker');
  }

  // Broker-only users always go to /broker
  if (user.accountType === 'broker_only') {
    redirect('/broker');
  }

  if (intent === 'broker') {
    // Check for broker-level membership
    const { data: membership } = await supabase
      .from('BrokerageMembership')
      .select('id, role')
      .eq('userId', user.id)
      .in('role', ['broker_owner', 'broker_admin'])
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
