import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/applications/portal?ref={applicationRef}&token={statusPortalToken}
 *
 * Public endpoint — applicant access via token-based auth.
 * Returns application status, status history, messages, and submitted data summary.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ref = searchParams.get('ref');
  const token = searchParams.get('token');

  if (!ref || !token) {
    return NextResponse.json({ error: 'Missing ref or token' }, { status: 400 });
  }

  // Validate both applicationRef AND statusPortalToken match (defense in depth)
  const { data: contact, error: contactError } = await supabase
    .from('Contact')
    .select(
      'id, name, email, applicationStatus, applicationStatusNote, applicationData, formConfigSnapshot, applicationRef, spaceId, createdAt',
    )
    .eq('applicationRef', ref)
    .eq('statusPortalToken', token)
    .maybeSingle();

  if (contactError) {
    console.error('[portal] Contact lookup error:', contactError);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }

  if (!contact) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  }

  // Fetch status history
  const { data: statusHistory } = await supabase
    .from('ApplicationStatusUpdate')
    .select('id, fromStatus, toStatus, note, createdAt')
    .eq('contactId', contact.id)
    .order('createdAt', { ascending: true });

  // Fetch messages
  const { data: messages } = await supabase
    .from('ApplicationMessage')
    .select('id, senderType, content, readAt, createdAt')
    .eq('contactId', contact.id)
    .order('createdAt', { ascending: true });

  // Mark unread realtor messages as read
  if (messages?.some((m: { senderType: string; readAt: string | null }) => m.senderType === 'realtor' && !m.readAt)) {
    const unreadIds = messages
      .filter((m: { senderType: string; readAt: string | null }) => m.senderType === 'realtor' && !m.readAt)
      .map((m: { id: string }) => m.id);

    await supabase
      .from('ApplicationMessage')
      .update({ readAt: new Date().toISOString() })
      .in('id', unreadIds);
  }

  // Fetch business name for display
  const { data: settings } = await supabase
    .from('SpaceSetting')
    .select('businessName')
    .eq('spaceId', contact.spaceId)
    .maybeSingle();

  return NextResponse.json({
    contact: {
      name: contact.name,
      email: contact.email,
      status: contact.applicationStatus ?? 'received',
      statusNote: contact.applicationStatusNote,
      applicationRef: contact.applicationRef,
      applicationData: contact.applicationData,
      formConfigSnapshot: contact.formConfigSnapshot,
      createdAt: contact.createdAt,
    },
    statusHistory: statusHistory ?? [],
    messages: messages ?? [],
    businessName: settings?.businessName ?? null,
  });
}
