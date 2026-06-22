import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getSpaceFromSlug } from '@/lib/space';
import { getSignedDownloadUrl } from '@/lib/storage';
import { logger } from '@/lib/logger';
import { ApplicationStatusClient } from './application-status-client';
import { IntakeChatShell } from '@/components/intake-chat/intake-chat-shell';

// Disable caching so status updates show immediately
export const dynamic = 'force-dynamic';

/** Stored photos are object KEYs; sign a 24h URL on read. Legacy http(s)
 *  values pass through. Mirrors /p, /apply, and /book. */
async function resolveStoredPhoto(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  try {
    return await getSignedDownloadUrl(value, 60 * 60 * 24);
  } catch (err) {
    logger.warn('[apply/status] signed url failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Friendly error page shown when a portal link is invalid or expired,
 * instead of the generic Next.js 404.
 */
function PortalErrorPage({
  businessName,
  hasToken,
}: {
  businessName: string;
  hasToken: boolean;
}) {
  return (
    <div className="mx-auto w-full max-w-md text-center" role="alert">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted/60">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-muted-foreground"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="m15 9-6 6" />
          <path d="m9 9 6 6" />
        </svg>
      </div>
      <h1
        className="mt-5 text-2xl tracking-tight text-foreground sm:text-3xl"
        style={{ fontFamily: 'var(--font-title)' }}
      >
        {hasToken ? 'Invalid or expired link' : 'Application not found'}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {hasToken
          ? 'This portal link is no longer valid. It may have expired or been replaced by a newer one. Please check your latest email from ' +
            businessName +
            ' for an updated link.'
          : 'We could not find an application with that reference number. Please double-check the link from your confirmation email.'}
      </p>
      <p className="mt-3 text-xs text-muted-foreground">
        If you continue to have trouble, contact {businessName} directly for assistance.
      </p>
    </div>
  );
}

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

  // Fetch settings early so we can use them in error pages too
  const { data: settings } = await supabase
    .from('SpaceSetting')
    .select('businessName, logoUrl, realtorPhotoUrl')
    .eq('spaceId', space.id)
    .maybeSingle();

  const businessName = settings?.businessName || space.name;

  // Resolve the same identity material /apply and /book use so the status
  // page wears the immersive shell and reads as one applicant-facing family.
  const [{ data: ownerData }, { data: profileRow }] = await Promise.all([
    supabase.from('User').select('name, avatar').eq('id', space.ownerId).maybeSingle(),
    supabase.from('ProfilePage').select('coverPhotoUrl, profilePhotoUrl').eq('spaceId', space.id).maybeSingle(),
  ]);
  const [agentPhoto, coverPhotoUrl] = await Promise.all([
    resolveStoredPhoto(
      (profileRow as { profilePhotoUrl?: string | null } | null)?.profilePhotoUrl ??
        settings?.realtorPhotoUrl ??
        ownerData?.avatar ??
        null,
    ),
    resolveStoredPhoto(
      (profileRow as { coverPhotoUrl?: string | null } | null)?.coverPhotoUrl ?? null,
    ),
  ]);
  const agentName = ownerData?.name || businessName;
  const hidePoweredBy =
    space.stripeSubscriptionStatus === 'active' || space.stripeSubscriptionStatus === 'trialing';

  // Shared immersive wrapper for every status-page outcome (error + portal).
  const Shell = ({ children }: { children: ReactNode }) => (
    <IntakeChatShell
      businessName={businessName}
      agentName={agentName}
      agentPhoto={agentPhoto}
      coverPhotoUrl={coverPhotoUrl}
      logoUrl={settings?.logoUrl ?? null}
      profileHref={`/p/${slug}`}
      hidePoweredBy={hidePoweredBy}
    >
      {children}
    </IntakeChatShell>
  );

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

  const { data: contact } = await query.maybeSingle();

  // Show a helpful, branded error page instead of generic 404
  if (!contact) {
    return (
      <Shell>
        <PortalErrorPage businessName={businessName} hasToken={!!token} />
      </Shell>
    );
  }

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
  let tours: {
    id: string;
    startsAt: string;
    endsAt: string;
    propertyAddress: string | null;
    notes: string | null;
    status: string;
  }[] = [];

  if (portalMode) {
    const [historyResult, messageResult, tourResult] = await Promise.all([
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
      supabase
        .from('Tour')
        .select('id, startsAt, endsAt, propertyAddress, notes, status')
        .eq('contactId', contact.id)
        .in('status', ['scheduled', 'confirmed', 'completed'])
        .order('startsAt', { ascending: true }),
    ]);

    statusHistory = historyResult.data ?? [];
    messages = messageResult.data ?? [];
    tours = tourResult.data ?? [];

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
    <Shell>
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
        tours={tours}
        token={portalMode ? token! : null}
        slug={slug}
      />
    </Shell>
  );
}
