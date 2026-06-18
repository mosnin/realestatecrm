import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { requirePlatformAdmin } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import { logAdminAction } from '@/lib/admin';
import { sendBrokerageInvitation } from '@/lib/email';
import { checkSeatCapacity } from '@/lib/brokerage-seats';
import { syncBrokerageSeatBilling } from '@/lib/billing/brokerage-seat-billing';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SETTABLE_ROLES = ['broker_admin', 'realtor_member'] as const;

/**
 * POST /api/admin/memberships
 *
 * Platform-admin invite/add of a member to a brokerage. Mirrors the broker-side
 * /api/broker/invite flow (idempotent, seat-capacity gated, email sent) but the
 * brokerage is supplied by the admin instead of derived from a broker context.
 *
 * If the email already belongs to an existing user who is NOT yet a member, we
 * add them directly (creating an accepted membership + linking their space).
 * Otherwise we create a pending Invitation and send the invite email — same as
 * the broker flow, so the recipient goes through the normal accept path.
 *
 * Body: { brokerageId, email, role: 'broker_admin' | 'realtor_member' }
 */
export async function POST(req: Request) {
  let admin: Awaited<ReturnType<typeof requirePlatformAdmin>>;
  try {
    admin = await requirePlatformAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const session = await auth();
  const { allowed } = await checkRateLimit(`admin:${session.userId}`, 30, 60);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  let body: { brokerageId?: unknown; email?: unknown; role?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const brokerageId = body.brokerageId;
  if (typeof brokerageId !== 'string' || !UUID_RE.test(brokerageId)) {
    return NextResponse.json({ error: 'Invalid brokerageId' }, { status: 400 });
  }
  const email =
    typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 320) : '';
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
  }
  const role = body.role;
  if (typeof role !== 'string' || !(SETTABLE_ROLES as readonly string[]).includes(role)) {
    return NextResponse.json(
      { error: 'role must be broker_admin or realtor_member' },
      { status: 400 },
    );
  }

  // Brokerage must exist.
  const { data: brokerage } = await supabase
    .from('Brokerage')
    .select('id, name')
    .eq('id', brokerageId)
    .maybeSingle();
  if (!brokerage) return NextResponse.json({ error: 'Brokerage not found' }, { status: 404 });

  // If the email already maps to a user, they may already be a member.
  const { data: existingUser } = await supabase
    .from('User')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (existingUser) {
    const { data: existingMember } = await supabase
      .from('BrokerageMembership')
      .select('id')
      .eq('brokerageId', brokerageId)
      .eq('userId', existingUser.id)
      .maybeSingle();
    if (existingMember) {
      return NextResponse.json(
        { error: 'This person is already a member of this brokerage.' },
        { status: 409 },
      );
    }
  }

  // Seat-limit enforcement (matches the broker invite flow). Fail closed.
  const seatCheck = await checkSeatCapacity(brokerageId, 1);
  if (!seatCheck.ok) {
    const { plan, seatLimit, used } = seatCheck.usage;
    return NextResponse.json(
      {
        error: `Seat limit reached — the ${plan} plan allows ${seatLimit} seats and ${used} are in use. Change plan or remove a member first.`,
        code: 'seat_limit',
      },
      { status: 402 },
    );
  }

  // ── Existing user → add directly as an accepted member + link their space ─────
  if (existingUser) {
    const { data: membership, error: memErr } = await supabase
      .from('BrokerageMembership')
      .insert({
        brokerageId,
        userId: existingUser.id,
        role,
      })
      .select()
      .single();
    if (memErr || !membership) {
      console.error('[admin/memberships] add-member insert failed', memErr);
      return NextResponse.json({ error: 'Failed to add member' }, { status: 500 });
    }

    // Link the user's space to the brokerage (best-effort) so it shows up under
    // the brokerage, matching how invite-accept wires a new member's space.
    const { data: space } = await supabase
      .from('Space')
      .select('id')
      .eq('ownerId', existingUser.id)
      .maybeSingle();
    if (space) {
      await supabase.from('Space').update({ brokerageId }).eq('id', space.id);
    }

    // A new active member raises the seat count — bump the per-unit add-on.
    void syncBrokerageSeatBilling(brokerageId);

    await logAdminAction({
      actor: admin.clerkUserId,
      action: 'add_membership',
      target: membership.id,
      details: { brokerageId, email, role, userId: existingUser.id },
    });

    return NextResponse.json({ membership, added: true }, { status: 201 });
  }

  // ── No user yet → create (or reuse) a pending invitation + send email ────────
  const { data: existingInvite } = await supabase
    .from('Invitation')
    .select('*')
    .eq('brokerageId', brokerageId)
    .eq('email', email)
    .eq('status', 'pending')
    .maybeSingle();

  let invitation = existingInvite;
  let duplicate = false;
  if (invitation) {
    duplicate = true;
  } else {
    const { data: created, error: invErr } = await supabase
      .from('Invitation')
      .insert({ brokerageId, email, roleToAssign: role })
      .select()
      .single();
    if (invErr || !created) {
      console.error('[admin/memberships] invitation insert failed', invErr);
      return NextResponse.json({ error: 'Failed to create invitation' }, { status: 500 });
    }
    invitation = created;
  }

  // Send (or resend) the invite email — best-effort, never block the response.
  try {
    await sendBrokerageInvitation({
      toEmail: email,
      brokerageName: brokerage.name,
      inviterName: 'Chippi',
      roleToAssign: role as 'broker_admin' | 'realtor_member',
      token: invitation.token,
    });
  } catch (err) {
    console.error('[admin/memberships] invite email failed', err);
  }

  await logAdminAction({
    actor: admin.clerkUserId,
    action: 'invite_member',
    target: invitation.id,
    details: { brokerageId, email, role, duplicate },
  });

  return NextResponse.json({ invitation, duplicate }, { status: duplicate ? 200 : 201 });
}
