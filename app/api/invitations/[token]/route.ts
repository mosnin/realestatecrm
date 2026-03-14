import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/invitations/[token]
 * Public read: returns invitation details for the accept page.
 * Does NOT expose sensitive fields like invitedById or full user data.
 *
 * POST /api/invitations/[token]
 * Accept an invitation. Requires the current user to be authenticated.
 */

type Params = { params: Promise<{ token: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { token } = await params;
  if (!token || token.length > 200) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  const { data: inv } = await supabase
    .from('Invitation')
    .select('id, status, email, roleToAssign, expiresAt, brokerageId, Brokerage(name)')
    .eq('token', token)
    .maybeSingle();

  if (!inv) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });

  return NextResponse.json({
    id: inv.id,
    status: inv.status,
    email: inv.email,
    roleToAssign: inv.roleToAssign,
    expiresAt: inv.expiresAt,
    brokerageName: (inv.Brokerage as { name: string } | null)?.name ?? '',
  });
}

export async function POST(_req: Request, { params }: Params) {
  const { token } = await params;

  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!token || token.length > 200) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  // Fetch the invitation with its brokerage
  const { data: inv } = await supabase
    .from('Invitation')
    .select('*')
    .eq('token', token)
    .maybeSingle();

  if (!inv) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
  if (inv.status !== 'pending') {
    return NextResponse.json({ error: `Invitation is ${inv.status}` }, { status: 409 });
  }
  if (new Date(inv.expiresAt) < new Date()) {
    // Mark expired
    await supabase.from('Invitation').update({ status: 'expired' }).eq('id', inv.id);
    return NextResponse.json({ error: 'Invitation has expired' }, { status: 410 });
  }

  // Resolve current user
  const { data: user } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', clerkId)
    .maybeSingle();
  if (!user) return NextResponse.json({ error: 'User not found — complete sign-up first' }, { status: 404 });

  // Idempotent: already a member?
  const { data: existingMembership } = await supabase
    .from('BrokerageMembership')
    .select('id')
    .eq('brokerageId', inv.brokerageId)
    .eq('userId', user.id)
    .maybeSingle();
  if (existingMembership) {
    // Mark accepted and return OK
    await supabase.from('Invitation').update({ status: 'accepted' }).eq('id', inv.id);
    return NextResponse.json({ message: 'Already a member' }, { status: 200 });
  }

  // Create membership
  const { error: memberErr } = await supabase
    .from('BrokerageMembership')
    .insert({
      brokerageId: inv.brokerageId,
      userId: user.id,
      role: inv.roleToAssign,
      invitedById: inv.invitedById,
    });
  if (memberErr) {
    console.error('[invitations/accept] membership insert failed', memberErr);
    return NextResponse.json({ error: 'Failed to join brokerage' }, { status: 500 });
  }

  // Link the user's Space to this brokerage (best-effort)
  const { data: space } = await supabase
    .from('Space')
    .select('id')
    .eq('ownerId', user.id)
    .maybeSingle();
  if (space) {
    await supabase
      .from('Space')
      .update({ brokerageId: inv.brokerageId })
      .eq('id', space.id);
  }

  // Mark invitation accepted
  await supabase.from('Invitation').update({ status: 'accepted' }).eq('id', inv.id);

  return NextResponse.json({ message: 'Joined brokerage successfully' }, { status: 200 });
}
