import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { BookingForm } from './booking-form';
import { PublicPageShell } from '@/components/public-page-shell';

export const revalidate = 60;

export default async function PublicBookingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const [{ data: settingsData }, { data: ownerData }] = await Promise.all([
    supabase
      .from('SpaceSetting')
      .select('tourBookingPageTitle, tourBookingPageIntro, businessName, tourDuration, timezone, logoUrl, realtorPhotoUrl')
      .eq('spaceId', space.id)
      .maybeSingle(),
    supabase
      .from('User')
      .select('name, avatar')
      .eq('id', space.ownerId)
      .maybeSingle(),
  ]);

  const settings = settingsData as {
    tourBookingPageTitle: string | null;
    tourBookingPageIntro: string | null;
    businessName: string | null;
    tourDuration: number | null;
    timezone: string | null;
    logoUrl: string | null;
    realtorPhotoUrl: string | null;
  } | null;

  const pageTitle = settings?.tourBookingPageTitle || 'Book a Tour';
  const pageIntro = settings?.tourBookingPageIntro || 'Pick a time that works for you and we\'ll confirm your tour.';
  const businessName = settings?.businessName || space.name;
  const duration = settings?.tourDuration || 30;
  const timezone = settings?.timezone || 'America/New_York';
  const agentName = ownerData?.name || businessName;
  const agentPhoto = settings?.realtorPhotoUrl || ownerData?.avatar || null;
  const logoUrl = settings?.logoUrl || null;

  return (
    <PublicPageShell
      logoUrl={logoUrl}
      businessName={businessName}
      agentName={agentName}
      agentPhone={null}
      agentPhoto={agentPhoto}
      pageTitle={pageTitle}
      pageIntro={pageIntro}
      trustLine={`Your information is shared only with ${agentName} and used solely for scheduling.`}
    >
      <BookingForm slug={slug} duration={duration} businessName={businessName} timezone={timezone} />
    </PublicPageShell>
  );
}
