import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { sendEmailFromCRM } from '@/lib/email';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id } = await params;

  const { data: contactRows, error: contactError } = await supabase
    .from('Contact')
    .select('spaceId, name, email')
    .eq('id', id)
    .limit(1);
  if (contactError) throw contactError;
  if (!contactRows?.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const contact = contactRows[0];
  if (!contact.email) return NextResponse.json({ error: 'Contact has no email' }, { status: 400 });

  const space = await getSpaceForUser(userId);
  if (!space || contact.spaceId !== space.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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

  await sendEmailFromCRM({
    toEmail: contact.email,
    fromName: user?.name ?? space.name,
    replyTo: user?.email,
    subject: subject.trim().slice(0, 200),
    body: emailBody.trim().slice(0, 10000),
  });

  // Log as ContactActivity — non-blocking; email already sent
  const { error: activityError } = await supabase.from('ContactActivity').insert({
    id: crypto.randomUUID(),
    contactId: id,
    spaceId: space.id,
    type: 'email',
    content: subject.trim().slice(0, 200),
    metadata: { body: emailBody.trim().slice(0, 2000), to: contact.email },
  });
  if (activityError) console.error('[email/route] failed to log ContactActivity', activityError);

  return NextResponse.json({ success: true });
}
