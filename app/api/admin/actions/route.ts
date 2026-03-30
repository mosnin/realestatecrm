import { NextRequest, NextResponse } from 'next/server';
import { createClerkClient, auth } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';
import { requireAdmin, logAdminAction } from '@/lib/admin';
import { shouldBackfillOnboardFromSpace } from '@/lib/onboarding';
import { checkRateLimit } from '@/lib/rate-limit';
import type { User, Space } from '@/lib/types';

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY!,
});

export async function POST(req: NextRequest) {
  let admin: { userId: string };
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const session = await auth();
  const { allowed } = await checkRateLimit(`admin:${session.userId}`, 30, 60);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { action } = body;

  const ALLOWED_ACTIONS = ['send_password_reset', 'repair_onboarding', 'update_subscription', 'suspend_user', 'unsuspend_user'];
  if (!ALLOWED_ACTIONS.includes(action as string)) {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  try {
    // ── Send password reset ─────────────────────────────────────────────
    if (action === 'send_password_reset') {
      const { clerkId } = body as { clerkId: string };
      if (!clerkId || typeof clerkId !== 'string') {
        return NextResponse.json({ error: 'clerkId is required' }, { status: 400 });
      }

      // Look up the Clerk user to get their primary email
      const clerkUser = await clerkClient.users.getUser(clerkId);
      const primaryEmail = clerkUser.emailAddresses.find(
        (e) => e.id === clerkUser.primaryEmailAddressId
      );

      if (!primaryEmail) {
        return NextResponse.json(
          { error: 'User has no primary email address' },
          { status: 400 }
        );
      }

      // Create a password reset through Clerk's magic link flow
      // Clerk doesn't have a direct "send password reset" API endpoint,
      // but we can use the email address to create a sign-in token.
      // The safest approach: just document the Clerk dashboard path.
      // However, we CAN programmatically update the user's password
      // or create a sign-in link. For safety, we'll log the action
      // and direct the admin to use Clerk Dashboard for password resets.

      logAdminAction({
        actor: admin.userId,
        action: 'send_password_reset',
        target: clerkId,
        details: { email: primaryEmail.emailAddress },
      });

      // Note: Clerk v7 doesn't expose a direct "send password reset email" API.
      // The recommended approach is to use the Clerk Dashboard or
      // set a temporary password. We'll log the request and inform the admin.
      return NextResponse.json({
        success: true,
        message: `Password reset requested for ${primaryEmail.emailAddress}. Use the Clerk Dashboard to complete this action, or the user can use the "Forgot password" flow at sign-in.`,
      });
    }

    // ── Repair onboarding state ─────────────────────────────────────────
    if (action === 'repair_onboarding') {
      const { userId } = body as { userId: string };
      if (!userId || typeof userId !== 'string') {
        return NextResponse.json({ error: 'userId is required' }, { status: 400 });
      }

      const { data: userRow, error: userError } = await supabase
        .from('User')
        .select('*, Space(id, slug)')
        .eq('id', userId)
        .maybeSingle();

      if (userError) throw userError;

      if (!userRow) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const row = userRow as User & { Space: { id: string; slug: string } | null };
      const user = {
        ...row,
        spaceId: row.Space?.id ?? null,
        slug: row.Space?.slug ?? null,
        space: row.Space ? { id: row.Space.id, slug: row.Space.slug } : null,
      };

      let repairAction = 'none';
      let message = 'No repair needed. User state is healthy.';

      if (shouldBackfillOnboardFromSpace(user)) {
        // Has space but onboard=false → backfill
        const { error } = await supabase
          .from('User')
          .update({
            onboard: true,
            onboardingCompletedAt: new Date().toISOString(),
            onboardingCurrentStep: 7,
          })
          .eq('id', user.id);
        if (error) throw error;
        repairAction = 'backfill_onboard';
        message = 'Backfilled onboard=true because workspace exists.';
      } else if (user.onboard && !user.space) {
        // Onboarded but no space → reset to re-onboard
        const { error } = await supabase
          .from('User')
          .update({
            onboard: false,
            onboardingCurrentStep: 1,
          })
          .eq('id', user.id);
        if (error) throw error;
        repairAction = 'reset_onboarding';
        message = 'Reset onboard=false and step=1 because workspace is missing.';
      }

      logAdminAction({
        actor: admin.userId,
        action: 'repair_onboarding',
        target: userId,
        details: { repairAction, userOnboard: user.onboard, hasSpace: !!user.space },
      });

      return NextResponse.json({ success: true, repairAction, message });
    }

    // ── Update subscription status ───────────────────────────────────────
    if (action === 'update_subscription') {
      const { userId, status, periodEnd } = body as {
        userId: string;
        status: string;
        periodEnd?: string;
      };

      if (!userId || typeof userId !== 'string') {
        return NextResponse.json({ error: 'userId is required' }, { status: 400 });
      }

      const VALID_STATUSES = ['active', 'trialing', 'past_due', 'canceled', 'unpaid', 'inactive'];
      if (!status || !VALID_STATUSES.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
          { status: 400 }
        );
      }

      const { data: spaceData, error: spaceLookupError } = await supabase
        .from('Space')
        .select('id')
        .eq('ownerId', userId)
        .maybeSingle();

      if (spaceLookupError) throw spaceLookupError;

      if (!spaceData) {
        return NextResponse.json({ error: 'No space found for this user' }, { status: 404 });
      }

      const updatePayload: Record<string, unknown> = { stripeSubscriptionStatus: status };
      if (periodEnd) {
        updatePayload.stripePeriodEnd = periodEnd;
      }

      const { error: updateError } = await supabase
        .from('Space')
        .update(updatePayload)
        .eq('id', spaceData.id);

      if (updateError) throw updateError;

      logAdminAction({
        actor: admin.userId,
        action: 'update_subscription',
        target: userId,
        details: { status, periodEnd: periodEnd ?? null, spaceId: spaceData.id },
      });

      return NextResponse.json({ success: true, message: `Subscription status updated to '${status}'.` });
    }

    // ── Suspend user ─────────────────────────────────────────────────────
    if (action === 'suspend_user') {
      const { userId } = body as { userId: string };
      if (!userId || typeof userId !== 'string') {
        return NextResponse.json({ error: 'userId is required' }, { status: 400 });
      }

      // Look up the user to get their Clerk ID
      const { data: userRow, error: userError } = await supabase
        .from('User')
        .select('id, clerkId, email')
        .eq('id', userId)
        .maybeSingle();

      if (userError) throw userError;
      if (!userRow) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const target = userRow as { id: string; clerkId: string; email: string };

      // Ban the user in Clerk — prevents them from signing in
      await clerkClient.users.banUser(target.clerkId);

      logAdminAction({
        actor: admin.userId,
        action: 'suspend_user',
        target: userId,
        details: { clerkId: target.clerkId, email: target.email },
      });

      return NextResponse.json({
        success: true,
        message: `User ${target.email} has been suspended. They will be unable to sign in.`,
      });
    }

    // ── Unsuspend user ──────────────────────────────────────────────────
    if (action === 'unsuspend_user') {
      const { userId } = body as { userId: string };
      if (!userId || typeof userId !== 'string') {
        return NextResponse.json({ error: 'userId is required' }, { status: 400 });
      }

      // Look up the user to get their Clerk ID
      const { data: userRow, error: userError } = await supabase
        .from('User')
        .select('id, clerkId, email')
        .eq('id', userId)
        .maybeSingle();

      if (userError) throw userError;
      if (!userRow) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const target = userRow as { id: string; clerkId: string; email: string };

      // Unban the user in Clerk — restores their ability to sign in
      await clerkClient.users.unbanUser(target.clerkId);

      logAdminAction({
        actor: admin.userId,
        action: 'unsuspend_user',
        target: userId,
        details: { clerkId: target.clerkId, email: target.email },
      });

      return NextResponse.json({
        success: true,
        message: `User ${target.email} has been unsuspended. They can now sign in again.`,
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[admin-action] failed', { action, error: err });
    return NextResponse.json(
      { error: 'Server error. Please try again.' },
      { status: 500 }
    );
  }
}
