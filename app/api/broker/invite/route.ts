import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { requireBroker } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { sendBrokerageInvitation } from '@/lib/email';
import { checkRateLimit } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';

/**
 * POST /api/broker/invite
 * Send a brokerage invitation to an email address.
 * Idempotent: if a pending invite for the same email already exists, returns it without
 * creating a duplicate or sending another email.
 */
export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let email: string, roleToAssign: string;
  try {
    ({ email, roleToAssign } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Validate inputs
  const trimmedEmail = (email ?? '').trim().toLowerCase().slice(0, 320);
  if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }
  if (!['broker_manager', 'realtor_member'].includes(roleToAssign)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  // 20 invitations per broker per hour
  const { allowed } = await checkRateLimit(`broker:invite:${ctx.dbUserId}`, 20, 3600);
  if (!allowed) return NextResponse.json({ error: 'Too many invitations sent. Try again in an hour.' }, { status: 429 });

  const { brokerage, dbUserId } = ctx;

  // Cap: max 100 pending invitations per brokerage
  const { count: pendingCount } = await supabase
    .from('Invitation')
    .select('*', { count: 'exact', head: true })
    .eq('brokerageId', brokerage.id)
    .eq('status', 'pending');
  if ((pendingCount ?? 0) >= 100) {
    return NextResponse.json(
      { error: 'Too many pending invitations. Cancel some before sending more.' },
      { status: 429 }
    );
  }

  // Idempotency: return existing pending invite for this email
  const { data: existing } = await supabase
    .from('Invitation')
    .select('*')
    .eq('brokerageId', brokerage.id)
    .eq('email', trimmedEmail)
    .eq('status', 'pending')
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ invitation: existing, duplicate: true }, { status: 200 });
  }

  // Resolve inviter name for email
  const { data: inviterUser } = await supabase
    .from('User')
    .select('name, email')
    .eq('id', dbUserId)
    .maybeSingle();
  const inviterName = inviterUser?.name ?? inviterUser?.email ?? 'Someone';

  // Create invitation
  const { data: invitation, error: invErr } = await supabase
    .from('Invitation')
    .insert({
      brokerageId: brokerage.id,
      email: trimmedEmail,
      roleToAssign,
      invitedById: dbUserId,
    })
    .select()
    .single();
  if (invErr || !invitation) {
    console.error('[broker/invite] insert failed', invErr);
    return NextResponse.json({ error: 'Failed to create invitation' }, { status: 500 });
  }

  // Send email (non-blocking — don't fail the request if email fails)
  sendBrokerageInvitation({
    toEmail: trimmedEmail,
    brokerageName: brokerage.name,
    inviterName,
    roleToAssign: roleToAssign as 'broker_manager' | 'realtor_member',
    token: invitation.token,
  }).catch((err) => console.error('[broker/invite] email send failed', err));

  void audit({ actorClerkId: clerkId ?? null, action: 'CREATE', resource: 'Invitation', resourceId: invitation.id, metadata: { email: trimmedEmail, roleToAssign, brokerageId: brokerage.id } });

  return NextResponse.json({ invitation }, { status: 201 });
}
