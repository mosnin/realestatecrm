import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { sendDraft, describeDelivery } from '@/lib/delivery';
import { checkSendAllowed } from '@/lib/messaging/compliance';
import { recordOutboundMessageSafe } from '@/lib/inbox';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  // Rate limit: max 20 emails per user per hour
  const { allowed } = await checkRateLimit(`email:${userId}`, 20, 3600);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many emails. Try again in a bit.' }, { status: 429 });
  }

  const { id } = await params;

  // Get space first, then query contact scoped to that space to prevent
  // cross-tenant information disclosure.
  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: contactRows, error: contactError } = await tenantTable(supabase, 'Contact', {
    spaceId: space.id,
  })
    .select('spaceId, name, email')
    .eq('id', id)
    .limit(1);
  if (contactError) throw contactError;
  if (!contactRows?.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const contact = contactRows[0];
  if (!contact.email) return NextResponse.json({ error: 'Contact has no email' }, { status: 400 });

  // Get the user's email to use as reply-to
  const { data: userRows } = await supabase
    .from('User')
    .select('email, name')
    .eq('clerkId', userId)
    .limit(1);
  const user = userRows?.[0];

  const body = await req.json();
  const { subject, body: emailBody } = body;

  if (!subject?.trim() || !emailBody?.trim()) {
    return NextResponse.json({ error: 'Subject and body are required' }, { status: 400 });
  }

  const subjectLine = subject.trim().slice(0, 200);
  const bodyText = emailBody.trim().slice(0, 10000);

  const decision = await checkSendAllowed({
    spaceId: space.id,
    channel: 'email',
    address: contact.email,
    audience: 'consumer',
    category: 'marketing',
    contactId: id,
  });
  if (!decision.allowed) {
    return NextResponse.json(
      {
        error: `Blocked because ${decision.reason ?? 'messaging rules'}: ${decision.detail ?? 'this message was not sent.'}`,
        reason: decision.reason,
      },
      { status: 403 },
    );
  }

  const fromName = user?.name ?? space.name;
  const delivery = await sendDraft(
    { channel: 'email', subject: subjectLine, content: bodyText },
    { name: contact.name ?? 'there', email: contact.email, phone: null },
    fromName,
    { spaceId: space.id, userId },
  );
  if (!delivery.sent) {
    logger.error('[contacts/email] delivery failed', {
      contactId: id,
      spaceId: space.id,
      error: delivery.error,
    });
    return NextResponse.json(
      { error: `Send failed: ${delivery.error ?? 'delivery failed'}` },
      { status: 502 },
    );
  }

  // Bump lastContactedAt so the contact list ordering and the "X days quiet"
  // line on the detail page both reflect this send immediately — not just the
  // activity row, which not every consumer reads.
  const now = new Date().toISOString();
  const { error: contactUpdateError } = await tenantTable(supabase, 'Contact', {
    spaceId: space.id,
  })
    .update({ lastContactedAt: now, updatedAt: now })
    .eq('id', id);
  if (contactUpdateError) console.error('[email/route] failed to update lastContactedAt', contactUpdateError);

  // Log as ContactActivity — non-blocking; email already sent
  const { error: activityError } = await tenantTable(supabase, 'ContactActivity', {
    spaceId: space.id,
  }).insert({
    id: crypto.randomUUID(),
    contactId: id,
    spaceId: space.id,
    type: 'email',
    content: subjectLine,
    metadata: {
      body: bodyText.slice(0, 2000),
      to: contact.email,
      method: delivery.method,
      ...(delivery.fallback ? { fallback: true } : {}),
    },
  });
  if (activityError) console.error('[email/route] failed to log ContactActivity', activityError);

  await recordOutboundMessageSafe(
    {
      spaceId: space.id,
      contactId: id,
      channel: 'email',
      body: bodyText,
      subject: subjectLine,
      metadata: {
        source: 'contacts_email',
        method: delivery.method,
        ...(delivery.fallback ? { fallback: true } : {}),
      },
    },
    { route: 'contacts/[id]/email', spaceId: space.id, contactId: id },
  );

  return NextResponse.json({
    success: true,
    method: delivery.method,
    fallback: delivery.fallback ?? false,
    via: describeDelivery(delivery),
  });
}
