import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { BookingForm } from './booking-form';
import { PublicPageShell } from '@/components/public-page-shell';
import { FormUnavailable } from '@/components/form-unavailable';

export const revalidate = 60;

export default async function PublicBookingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const [{ data: settingsData }, { data: customSettings }, { data: ownerData }] = await Promise.all([
    supabase
      .from('SpaceSetting')
      .select('tourBookingPageTitle, tourBookingPageIntro, businessName, tourDuration, timezone, logoUrl, realtorPhotoUrl')
      .eq('spaceId', space.id)
      .maybeSingle(),
    supabase
      .from('SpaceSetting')
      .select(
        'intakeAccentColor, intakeFont, intakeDarkMode, ' +
        'intakeHeaderBgColor, intakeHeaderGradient, ' +
        'intakeFooterLinks, bio, socialLinks'
      )
      .eq('spaceId', space.id)
      .maybeSingle(),
    supabase
      .from('User')
      .select('name, avatar')
      .eq('id', space.ownerId)
      .maybeSingle(),
  ]);

  const allSettings = { ...((settingsData ?? {}) as any), ...((customSettings ?? {}) as any) };
  const settings = allSettings as {
    tourBookingPageTitle: string | null;
    tourBookingPageIntro: string | null;
    businessName: string | null;
    tourDuration: number | null;
    timezone: string | null;
    logoUrl: string | null;
    realtorPhotoUrl: string | null;
    intakeAccentColor: string | null;
    intakeFont: string | null;
    intakeDarkMode: boolean | null;
    intakeHeaderBgColor: string | null;
    intakeHeaderGradient: string | null;
    intakeFooterLinks: { label: string; url: string }[] | null;
    bio: string | null;
    socialLinks: Record<string, string> | null;
  } | null;

  const pageTitle = settings?.tourBookingPageTitle || 'Book a Tour';
  const pageIntro = settings?.tourBookingPageIntro || 'Pick a time that works for you and we\'ll confirm your tour.';
  const businessName = settings?.businessName || space.name;
  const duration = settings?.tourDuration || 30;
  const timezone = settings?.timezone || 'America/New_York';
  const agentName = ownerData?.name || businessName;
  const agentPhoto = settings?.realtorPhotoUrl || ownerData?.avatar || null;
  const logoUrl = settings?.logoUrl || null;

  // Gate on subscription status — show paused page if not active/trialing
  const subStatus = space.stripeSubscriptionStatus;
  if (subStatus !== 'active' && subStatus !== 'trialing') {
    return <FormUnavailable agentName={agentName} />;
  }

  const customization = {
    accentColor: settings?.intakeAccentColor || '#ff964f',
    font: settings?.intakeFont || 'system',
    darkMode: settings?.intakeDarkMode || false,
    headerBgColor: settings?.intakeHeaderBgColor || null,
    headerGradient: settings?.intakeHeaderGradient || null,
    footerLinks: settings?.intakeFooterLinks || [],
    bio: settings?.bio || null,
    socialLinks: settings?.socialLinks || null,
  };

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
      customization={customization}
    >
      <BookingForm slug={slug} duration={duration} businessName={businessName} timezone={timezone} accentColor={customization.accentColor} />
    </PublicPageShell>
  );
}
