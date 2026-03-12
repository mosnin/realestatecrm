import { NextRequest, NextResponse } from 'next/server';
import { createClerkClient } from '@clerk/nextjs/server';
import { sql } from '@/lib/db';
import { requireAdmin, logAdminAction } from '@/lib/admin';
import { shouldBackfillOnboardFromSpace } from '@/lib/onboarding';
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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { action } = body;

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

      const users = await sql`
        SELECT u.*, s."id" AS "spaceId", s."slug"
        FROM "User" u
        LEFT JOIN "Space" s ON s."ownerId" = u."id"
        WHERE u."id" = ${userId}
      ` as (User & { spaceId: string | null; slug: string | null })[];

      if (!users.length) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const row = users[0];
      const user = {
        ...row,
        space: row.spaceId ? { id: row.spaceId, slug: row.slug! } : null,
      };

      let repairAction = 'none';
      let message = 'No repair needed. User state is healthy.';

      if (shouldBackfillOnboardFromSpace(user)) {
        // Has space but onboard=false → backfill
        await sql`
          UPDATE "User"
          SET "onboard" = true,
              "onboardingCompletedAt" = NOW(),
              "onboardingCurrentStep" = 7
          WHERE "id" = ${user.id}
        `;
        repairAction = 'backfill_onboard';
        message = 'Backfilled onboard=true because workspace exists.';
      } else if (user.onboard && !user.space) {
        // Onboarded but no space → reset to re-onboard
        await sql`
          UPDATE "User"
          SET "onboard" = false,
              "onboardingCurrentStep" = 1
          WHERE "id" = ${user.id}
        `;
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

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[admin-action] failed', { action, error: err });
    return NextResponse.json(
      { error: 'Server error. Please try again.' },
      { status: 500 }
    );
  }
}
