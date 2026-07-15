import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { requireAdminCapability, getCurrentDbUser } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import { logAdminAction } from '@/lib/admin';
import { requireStepUp } from '@/lib/admin-stepup';
import { hardDeleteEnabled, performAccountDeletion } from '@/lib/account-deletion';

type Params = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/admin/users/[id]/delete
 *
 * Platform-admin OFFBOARD/DELETE of a realtor account. This is the real,
 * destructive thing (suspend ≠ delete): it removes the Clerk identity and —
 * when ACCOUNT_DELETION_HARD_DELETE is on — the full workspace footprint via the
 * SAME engine the self-service /api/account/delete route uses
 * (lib/account-deletion.ts → performAccountDeletion). We do not re-implement the
 * cascade here, so the two surfaces can never drift.
 *
 * Guards:
 *   - requirePlatformAdmin() — platform admin only.
 *   - Refuses to delete a platform admin (matches suspend_user) and refuses to
 *     delete yourself — an admin offboarding their own account through the admin
 *     panel is almost always a mistake and would also strip admin access.
 *   - Structural blockers (owning a brokerage) surface as 409 via the engine.
 */
export async function POST(req: Request, { params }: Params) {
  let admin: Awaited<ReturnType<typeof requireAdminCapability>>;
  try {
    admin = await requireAdminCapability('users:delete');
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const session = await auth();
  // Destructive — hard per-admin cap on top of the shared admin limit.
  const { allowed } = await checkRateLimit(`admin:userdelete:${session.userId}`, 10, 3600);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }

  // Body carries the step-up fields (reason + typed confirmation). Tolerate an
  // empty/absent body so a malformed request still yields a clear 400 below.
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // Resolve the target user.
  const { data: userRow, error: userErr } = await supabase
    .from('User')
    .select('id, clerkId, email, platformRole')
    .eq('id', id)
    .maybeSingle();
  if (userErr) {
    console.error('[admin/users/delete] lookup failed', userErr);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
  if (!userRow) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const target = userRow as { id: string; clerkId: string; email: string; platformRole?: string };

  // Never delete a platform admin through this route (matches suspend_user).
  if (target.platformRole === 'admin') {
    return NextResponse.json({ error: 'Cannot delete a platform admin.' }, { status: 403 });
  }

  // Refuse self-deletion via the admin panel.
  const self = await getCurrentDbUser();
  if (self && self.id === target.id) {
    return NextResponse.json(
      { error: 'You cannot delete your own account from the admin panel.' },
      { status: 400 },
    );
  }

  // Step-up: require a reason + the target's exact email typed as confirmation.
  const step = requireStepUp(body, { expectedConfirmation: target.email });
  if (step instanceof NextResponse) return step;

  // Resolve the workspace (if any) for the cascade root.
  const { data: spaceRow } = await supabase
    .from('Space')
    .select('id, slug, name')
    .eq('ownerId', target.id)
    .maybeSingle();
  const spaceId = (spaceRow?.id as string | undefined) ?? null;

  // Audit BEFORE anything is touched — keep the spaceId in the log.
  await logAdminAction({
    actor: admin.clerkUserId,
    action: 'delete_user',
    target: target.id,
    reason: step.reason,
    confirmationText: step.confirm,
    details: {
      clerkId: target.clerkId,
      email: target.email,
      spaceId,
      slug: (spaceRow?.slug as string | undefined) ?? null,
      hardDelete: hardDeleteEnabled(),
    },
  });

  const result = await performAccountDeletion({
    userDbId: target.id,
    clerkId: target.clerkId,
    spaceId,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...(result.loginRemoved ? { loginRemoved: true } : {}) },
      { status: result.status },
    );
  }

  return NextResponse.json({
    success: true,
    hardDeleted: result.hardDeleted,
    pendingDataDeletion: result.pendingDataDeletion,
    message: result.hardDeleted
      ? `${target.email} has been permanently deleted.`
      : `${target.email}'s login has been removed. Their workspace data is queued for permanent deletion.`,
  });
}
