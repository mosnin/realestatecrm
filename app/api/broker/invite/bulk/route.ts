import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { requireBroker } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { sendBrokerageInvitation } from '@/lib/email';
import { checkRateLimit } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';

/**
 * POST /api/broker/invite/bulk
 * Send multiple brokerage invitations from a list of emails.
 * Max 50 per request.
 */
export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let entries: Array<{ email: string; role?: string }>;
  try {
    const body = await req.json();
    entries = body.entries;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: 'No entries provided' }, { status: 400 });
  }

  if (entries.length > 50) {
    return NextResponse.json({ error: 'Max 50 invitations per batch' }, { status: 400 });
  }

  // Rate limit: 50 bulk invites per broker per hour
  const { allowed } = await checkRateLimit(`broker:bulk-invite:${ctx.dbUserId}`, 50, 3600);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many invitations. Try again in an hour.' }, { status: 429 });
  }

  const { brokerage, dbUserId } = ctx;

  // Check pending capacity
  const { count: pendingCount } = await supabase
    .from('Invitation')
    .select('*', { count: 'exact', head: true })
    .eq('brokerageId', brokerage.id)
    .eq('status', 'pending');
  const remaining = 100 - (pendingCount ?? 0);
  if (remaining <= 0) {
    return NextResponse.json({ error: 'Too many pending invitations. Cancel some first.' }, { status: 429 });
  }

  // Resolve inviter name
  const { data: inviterUser } = await supabase
    .from('User')
    .select('name, email')
    .eq('id', dbUserId)
    .maybeSingle();
  const inviterName = inviterUser?.name ?? inviterUser?.email ?? 'Someone';

  const results: Array<{ email: string; status: 'sent' | 'duplicate' | 'error'; error?: string }> = [];
  let sentCount = 0;

  for (const entry of entries) {
    if (sentCount >= remaining) {
      results.push({ email: entry.email, status: 'error', error: 'Pending invite limit reached' });
      continue;
    }

    const email = (entry.email ?? '').trim().toLowerCase().slice(0, 320);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      results.push({ email: entry.email ?? '', status: 'error', error: 'Invalid email' });
      continue;
    }

    const roleToAssign = entry.role === 'broker_admin' ? 'broker_admin' : 'realtor_member';

    // Check for existing pending invite
    const { data: existing } = await supabase
      .from('Invitation')
      .select('id')
      .eq('brokerageId', brokerage.id)
      .eq('email', email)
      .eq('status', 'pending')
      .maybeSingle();

    if (existing) {
      results.push({ email, status: 'duplicate' });
      continue;
    }

    // Create invitation
    const { data: invitation, error: invErr } = await supabase
      .from('Invitation')
      .insert({
        brokerageId: brokerage.id,
        email,
        roleToAssign,
        invitedById: dbUserId,
      })
      .select()
      .single();

    if (invErr || !invitation) {
      results.push({ email, status: 'error', error: 'Insert failed' });
      continue;
    }

    // Send email (non-blocking)
    sendBrokerageInvitation({
      toEmail: email,
      brokerageName: brokerage.name,
      inviterName,
      roleToAssign: roleToAssign as 'broker_admin' | 'realtor_member',
      token: invitation.token,
    }).catch((err) => console.error('[broker/invite/bulk] email failed', err));

    results.push({ email, status: 'sent' });
    sentCount++;
  }

  void audit({
    actorClerkId: clerkId ?? null,
    action: 'CREATE',
    resource: 'Invitation',
    metadata: { bulk: true, count: sentCount, brokerageId: brokerage.id },
  });

  return NextResponse.json({
    sent: results.filter((r) => r.status === 'sent').length,
    duplicates: results.filter((r) => r.status === 'duplicate').length,
    errors: results.filter((r) => r.status === 'error').length,
    results,
  }, { status: 201 });
}
