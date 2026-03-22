import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getSpaceFromSlug } from '@/lib/space';
import { ApplicationStatusClient } from './application-status-client';
import { PublicPageMinimalShell } from '@/components/public-page-shell';

export default async function ApplicationStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ref?: string }>;
}) {
  const { slug } = await params;
  const { ref } = await searchParams;

  if (!ref) notFound();

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const [{ data: contact }, { data: settings }] = await Promise.all([
    supabase
      .from('Contact')
      .select('id, name, applicationStatus, applicationStatusNote, applicationData, scoringStatus, createdAt')
      .eq('applicationRef', ref)
      .eq('spaceId', space.id)
      .maybeSingle(),
    supabase
      .from('SpaceSetting')
      .select('businessName, logoUrl')
      .eq('spaceId', space.id)
      .maybeSingle(),
  ]);

  if (!contact) notFound();

  const businessName = settings?.businessName || space.name;

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
          createdAt: contact.createdAt,
        }}
        businessName={businessName}
      />
    </PublicPageMinimalShell>
  );
}
