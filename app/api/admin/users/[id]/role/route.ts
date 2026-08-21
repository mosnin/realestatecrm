import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { requireAdminCapability, getCurrentDbUser } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import { logAdminAction } from '@/lib/admin';
import type { PlatformRole } from '@/lib/types';
import { unscoped } from '@/lib/supabase-guard';

type Params = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PLATFORM_ROLES: readonly PlatformRole[] = ['user', 'admin'];
// Membership roles an admin may SET. broker_owner is intentionally excluded —
// ownership is transferred via the brokerage lifecycle, not flipped here.
const SETTABLE_MEMBERSHIP_ROLES = ['broker_admin', 'realtor_member'] as const;

/**
 * POST /api/admin/users/[id]/role
 *
 * Mutate account type / role for a user. Two independent, optional operations in
 * one call (send either or both):
 *   - platformRole: 'user' | 'admin'   — the platform access level.
 *   - membershipId + membershipRole    — change ONE of the user's brokerage
 *                                        memberships to broker_admin/realtor_member.
 *
 * Nothing else in the app mutates platformRole beyond suspend's banned/user flip,
 * so this is the canonical place to promote/demote a platform admin.
 *
 * Guards (clear errors):
 *   - Cannot demote YOURSELF from admin (you'd lock yourself out mid-action).
 *   - Cannot demote the LAST remaining admin (the platform would have none).
 *   - membershipId must belong to the target user; broker_owner rows are refused.
 */
export async function POST(req: Request, { params }: Params) {
  let admin: Awaited<ReturnType<typeof requireAdminCapability>>;
  try {
    admin = await requireAdminCapability('users:role');
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const session = await auth();
  const { allowed } = await checkRateLimit(`admin:${session.userId}`, 30, 60);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }

  let body: {
    platformRole?: unknown;
    membershipId?: unknown;
    membershipRole?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const wantsPlatformRole = body.platformRole !== undefined;
  const wantsMembershipRole = body.membershipId !== undefined || body.membershipRole !== undefined;
  if (!wantsPlatformRole && !wantsMembershipRole) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  // Resolve the target user.
  const { data: userRow, error: userErr } = await supabase
    .from('User')
    .select('id, clerkId, email, platformRole')
    .eq('id', id)
    .maybeSingle();
  if (userErr) {
    console.error('[admin/users/role] lookup failed', userErr);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
  if (!userRow) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const target = userRow as { id: string; clerkId: string; email: string; platformRole: string | null };

  const changes: Record<string, unknown> = {};

  // ── platformRole ───────────────────────────────────────────────────────────
  if (wantsPlatformRole) {
    const next = body.platformRole;
    if (typeof next !== 'string' || !PLATFORM_ROLES.includes(next as PlatformRole)) {
      return NextResponse.json({ error: 'platformRole must be user or admin' }, { status: 400 });
    }
    const current = (target.platformRole ?? 'user') as string;

    // Demotion guards only apply when actually moving admin → user.
    const demotingAdmin = current === 'admin' && next === 'user';
    if (demotingAdmin) {
      // Cannot demote yourself — you'd strip your own access mid-request.
      const self = await getCurrentDbUser();
      if (self && self.id === target.id) {
        return NextResponse.json(
          { error: 'You cannot remove your own admin access.' },
          { status: 400 },
        );
      }

      // Cannot demote the last remaining admin.
      const { count, error: countErr } = await supabase
        .from('User')
        .select('id', { count: 'exact', head: true })
        .eq('platformRole', 'admin');
      if (countErr) {
        console.error('[admin/users/role] admin count failed', countErr);
        return NextResponse.json({ error: 'Could not verify admin count' }, { status: 500 });
      }
      if ((count ?? 0) <= 1) {
        return NextResponse.json(
          { error: 'Cannot remove the last platform admin.' },
          { status: 400 },
        );
      }
    }

    if (current !== next) {
      const { error: roleErr } = await supabase
        .from('User')
        .update({ platformRole: next })
        .eq('id', target.id);
      if (roleErr) {
        console.error('[admin/users/role] platformRole update failed', roleErr);
        return NextResponse.json({ error: 'Failed to update platform role' }, { status: 500 });
      }
      changes.platformRole = { from: current, to: next };
    }
  }

  // ── BrokerageMembership.role ────────────────────────────────────────────────
  if (wantsMembershipRole) {
    const membershipId = body.membershipId;
    const membershipRole = body.membershipRole;
    if (typeof membershipId !== 'string' || !UUID_RE.test(membershipId)) {
      return NextResponse.json({ error: 'Invalid membershipId' }, { status: 400 });
    }
    if (
      typeof membershipRole !== 'string' ||
      !(SETTABLE_MEMBERSHIP_ROLES as readonly string[]).includes(membershipRole)
    ) {
      return NextResponse.json(
        { error: 'membershipRole must be broker_admin or realtor_member' },
        { status: 400 },
      );
    }

    // The membership must belong to THIS user (no cross-user edits).
    const { data: membership } = await unscoped(
      supabase.from('BrokerageMembership'),
      'admin: platform-admin membership lookup by id',
    )
      .select('id, role, userId, brokerageId')
      .eq('id', membershipId)
      .maybeSingle();
    if (!membership || membership.userId !== target.id) {
      return NextResponse.json({ error: 'Membership not found for this user' }, { status: 404 });
    }
    if (membership.role === 'broker_owner') {
      return NextResponse.json(
        { error: "Cannot change the owner's membership role. Transfer the brokerage instead." },
        { status: 400 },
      );
    }

    if (membership.role !== membershipRole) {
      const { error: memErr } = await unscoped(
        supabase.from('BrokerageMembership'),
        'admin: platform-admin membership update by id',
      )
        .update({ role: membershipRole })
        .eq('id', membershipId);
      if (memErr) {
        console.error('[admin/users/role] membership role update failed', memErr);
        return NextResponse.json({ error: 'Failed to update membership role' }, { status: 500 });
      }
      changes.membershipRole = {
        membershipId,
        brokerageId: membership.brokerageId,
        from: membership.role,
        to: membershipRole,
      };
    }
  }

  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ success: true, message: 'No changes — values already current.' });
  }

  await logAdminAction({
    actor: admin.clerkUserId,
    action: 'change_user_role',
    target: target.id,
    details: { email: target.email, ...changes },
  });

  return NextResponse.json({ success: true, changes });
}
