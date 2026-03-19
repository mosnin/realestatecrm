import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getSpaceFromSlug } from '@/lib/space';
import { ApplicationStatusClient } from './application-status-client';

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

  const { data: contact } = await supabase
    .from('Contact')
    .select('id, name, applicationStatus, applicationStatusNote, applicationData, scoringStatus, createdAt')
    .eq('applicationRef', ref)
    .eq('spaceId', space.id)
    .maybeSingle();

  if (!contact) notFound();

  const { data: settings } = await supabase
    .from('SpaceSetting')
    .select('businessName')
    .eq('spaceId', space.id)
    .maybeSingle();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <ApplicationStatusClient
        contact={{
          name: contact.name,
          status: contact.applicationStatus ?? 'received',
          statusNote: contact.applicationStatusNote,
          createdAt: contact.createdAt,
        }}
        businessName={settings?.businessName || space.name}
      />
    </div>
  );
}
