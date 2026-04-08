import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getSpaceFromSlug } from '@/lib/space';
import { ApplicationStatusClient } from './application-status-client';
import { PublicPageMinimalShell } from '@/components/public-page-shell';

// Disable caching so status updates show immediately
export const dynamic = 'force-dynamic';

export default async function ApplicationStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ref?: string; token?: string }>;
}) {
  const { slug } = await params;
  const { ref, token } = await searchParams;

  if (!ref) notFound();

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  // Build query — if token is provided, validate both ref AND token (portal mode)
  let query = supabase
    .from('Contact')
    .select(
      'id, name, email, applicationStatus, applicationStatusNote, applicationData, formConfigSnapshot, applicationRef, statusPortalToken, scoringStatus, createdAt',
    )
    .eq('applicationRef', ref)
    .eq('spaceId', space.id);

  // If token provided, enforce it must match (defense in depth)
  if (token) {
    query = query.eq('statusPortalToken', token);
  }

  const [{ data: contact }, { data: settings }] = await Promise.all([
    query.maybeSingle(),
    supabase
      .from('SpaceSetting')
      .select('businessName, logoUrl')
      .eq('spaceId', space.id)
      .maybeSingle(),
  ]);

  if (!contact) notFound();

  const businessName = settings?.businessName || space.name;

  // Determine if portal mode is enabled (token matches)
  const portalMode = !!(token && contact.statusPortalToken === token);

  // Fetch status history and messages only in portal mode
  let statusHistory: {
    id: string;
    fromStatus: string | null;
    toStatus: string;
    note: string | null;
    createdAt: string;
  }[] = [];
  let messages: {
    id: string;
    senderType: string;
    content: string;
    readAt: string | null;
    createdAt: string;
  }[] = [];

  if (portalMode) {
    const [historyResult, messageResult] = await Promise.all([
      supabase
        .from('ApplicationStatusUpdate')
        .select('id, fromStatus, toStatus, note, createdAt')
        .eq('contactId', contact.id)
        .order('createdAt', { ascending: true }),
      supabase
        .from('ApplicationMessage')
        .select('id, senderType, content, readAt, createdAt')
        .eq('contactId', contact.id)
        .order('createdAt', { ascending: true }),
    ]);

    statusHistory = historyResult.data ?? [];
    messages = messageResult.data ?? [];

    // Mark unread realtor messages as read
    const unreadRealtorIds = messages
      .filter((m) => m.senderType === 'realtor' && !m.readAt)
      .map((m) => m.id);
    if (unreadRealtorIds.length > 0) {
      await supabase
        .from('ApplicationMessage')
        .update({ readAt: new Date().toISOString() })
        .in('id', unreadRealtorIds);
    }
  }

  return (
    <PublicPageMinimalShell
      logoUrl={settings?.logoUrl}
      businessName={businessName}
    >
      <ApplicationStatusClient
        contact={{
          name: contact.name,
          status: contact.applicationStatus ?? 'received',
          statusNote: contact.applicationStatusNote,
          applicationRef: contact.applicationRef ?? ref,
          applicationData: contact.applicationData,
          formConfigSnapshot: contact.formConfigSnapshot,
          createdAt: contact.createdAt,
        }}
        businessName={businessName}
        portalMode={portalMode}
        statusHistory={statusHistory}
        messages={messages}
        token={portalMode ? token! : null}
        slug={slug}
      />
    </PublicPageMinimalShell>
  );
}
