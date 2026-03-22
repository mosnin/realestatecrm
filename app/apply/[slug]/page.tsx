import { notFound } from 'next/navigation';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import { getSpaceFromSlug } from '@/lib/space';
import { PublicPageShell } from '@/components/public-page-shell';

// Lazy-load the form — it imports framer-motion (~100KB) and DateWheelPicker
// which are not needed for the initial page shell render.
const ApplicationForm = dynamic(
  () => import('./application-form').then((m) => m.ApplicationForm),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4 animate-pulse">
        <div className="h-2 w-24 bg-muted rounded" />
        <div className="h-10 bg-muted rounded-lg" />
        <div className="h-10 bg-muted rounded-lg" />
        <div className="h-10 bg-muted rounded-lg" />
        <div className="h-10 w-32 bg-muted rounded-lg" />
      </div>
    ),
  }
);

export default async function PublicApplyPage({
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
      .select('intakePageTitle, intakePageIntro, businessName, logoUrl, realtorPhotoUrl')
      .eq('spaceId', space.id)
      .maybeSingle(),
    supabase
      .from('User')
      .select('name, avatar')
      .eq('id', space.ownerId)
      .maybeSingle(),
  ]);

  const settings = settingsData as {
    intakePageTitle: string | null;
    intakePageIntro: string | null;
    businessName: string | null;
    logoUrl: string | null;
    realtorPhotoUrl: string | null;
  } | null;

  const pageTitle = settings?.intakePageTitle || 'Rental Application';
  const pageIntro = settings?.intakePageIntro || "Share your rental preferences and we'll follow up with next steps.";
  const businessName = settings?.businessName || space.name;
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
      trustLine={`Your information is shared only with ${agentName} and used solely for rental inquiries.`}
    >
      <ApplicationForm slug={slug} businessName={businessName} />
    </PublicPageShell>
  );
}
