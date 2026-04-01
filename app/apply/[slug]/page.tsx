import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getSpaceFromSlug } from '@/lib/space';
import { PublicPageShell } from '@/components/public-page-shell';
import { FormUnavailable } from '@/components/form-unavailable';
import { ApplicationFormLoader } from './application-form-loader';
import { clerkClient } from '@clerk/nextjs/server';

// Cache this page for 60 seconds — it's public and rarely changes.
// Eliminates cold-start latency for repeat visitors and crawlers.
export const revalidate = 60;

export default async function PublicApplyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  // Parallel queries — both depend on space but run simultaneously
  // Use two queries: one for core fields (always exist), one for customization (may not exist yet)
  const [{ data: coreSettings }, { data: customSettings }, { data: ownerData }] = await Promise.all([
    supabase
      .from('SpaceSetting')
      .select('intakePageTitle, intakePageIntro, businessName, logoUrl, realtorPhotoUrl')
      .eq('spaceId', space.id)
      .maybeSingle(),
    supabase
      .from('SpaceSetting')
      .select(
        'intakeAccentColor, intakeBorderRadius, intakeFont, intakeDarkMode, ' +
        'intakeHeaderBgColor, intakeHeaderGradient, intakeVideoUrl, ' +
        'intakeDisclaimerText, intakeThankYouTitle, intakeThankYouMessage, ' +
        'intakeFooterLinks, intakeDisabledSteps, intakeCustomQuestions, ' +
        'intakeFaviconUrl, bio, socialLinks, privacyPolicyUrl, consentCheckboxLabel'
      )
      .eq('spaceId', space.id)
      .maybeSingle()
      .then(r => r),
    supabase
      .from('User')
      .select('name, avatar, clerkId')
      .eq('id', space.ownerId)
      .maybeSingle(),
  ]);

  const settingsData = { ...((coreSettings ?? {}) as any), ...((customSettings ?? {}) as any) };
  const settings = settingsData as {
    intakePageTitle: string | null;
    intakePageIntro: string | null;
    businessName: string | null;
    logoUrl: string | null;
    realtorPhotoUrl: string | null;
    intakeAccentColor: string | null;
    intakeBorderRadius: string | null;
    intakeFont: string | null;
    intakeDarkMode: boolean | null;
    intakeHeaderBgColor: string | null;
    intakeHeaderGradient: string | null;
    intakeVideoUrl: string | null;
    intakeDisclaimerText: string | null;
    intakeThankYouTitle: string | null;
    intakeThankYouMessage: string | null;
    intakeFooterLinks: { label: string; url: string }[] | null;
    intakeDisabledSteps: number[] | null;
    intakeCustomQuestions: { id: string; label: string; type: string; required?: boolean }[] | null;
    intakeFaviconUrl: string | null;
    bio: string | null;
    socialLinks: Record<string, string> | null;
    privacyPolicyUrl: string | null;
    consentCheckboxLabel: string | null;
  } | null;

  const pageTitle = settings?.intakePageTitle || 'Rental Application';
  const pageIntro = settings?.intakePageIntro || "Share your rental preferences and we'll follow up with next steps.";
  const businessName = settings?.businessName || space.name;
  const agentName = ownerData?.name || businessName;

  // Get agent photo: SpaceSetting > User.avatar > Clerk profile photo
  let agentPhoto = settings?.realtorPhotoUrl || ownerData?.avatar || null;
  if (!agentPhoto && ownerData?.clerkId) {
    try {
      const clerk = await clerkClient();
      const clerkUser = await clerk.users.getUser(ownerData.clerkId);
      if (clerkUser?.imageUrl) {
        agentPhoto = clerkUser.imageUrl;
        // Backfill to DB so we don't fetch from Clerk every time
        await supabase.from('User').update({ avatar: clerkUser.imageUrl }).eq('id', space.ownerId);
      }
    } catch {
      // Clerk fetch failed — continue without photo
    }
  }
  const logoUrl = settings?.logoUrl || null;

  // Gate on subscription status — only pause forms for explicitly failed billing
  const status = space.stripeSubscriptionStatus;
  const formPaused = status === 'past_due' || status === 'canceled' || status === 'unpaid';
  if (formPaused) {
    return <FormUnavailable agentName={agentName} />;
  }

  const customization = {
    accentColor: settings?.intakeAccentColor || '#ff964f',
    borderRadius: settings?.intakeBorderRadius || 'rounded',
    font: settings?.intakeFont || 'system',
    darkMode: settings?.intakeDarkMode || false,
    headerBgColor: settings?.intakeHeaderBgColor || null,
    headerGradient: settings?.intakeHeaderGradient || null,
    videoUrl: settings?.intakeVideoUrl || null,
    disclaimerText: settings?.intakeDisclaimerText || null,
    thankYouTitle: settings?.intakeThankYouTitle || null,
    thankYouMessage: settings?.intakeThankYouMessage || null,
    footerLinks: settings?.intakeFooterLinks || [],
    disabledSteps: settings?.intakeDisabledSteps || [],
    customQuestions: settings?.intakeCustomQuestions || [],
    faviconUrl: settings?.intakeFaviconUrl || null,
    bio: settings?.bio || null,
    socialLinks: settings?.socialLinks || null,
    privacyPolicyUrl: settings?.privacyPolicyUrl || null,
    consentCheckboxLabel: settings?.consentCheckboxLabel || null,
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
      trustLine={`Your information is shared only with ${agentName} and used solely for rental inquiries.`}
      customization={customization}
    >
      <ApplicationFormLoader slug={slug} businessName={businessName} customization={customization} />
    </PublicPageShell>
  );
}
