import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getSpaceFromSlug } from '@/lib/space';
import { PublicPageShell } from '@/components/public-page-shell';
import { FormUnavailable } from '@/components/form-unavailable';
import { TrackingPixels } from '@/components/tracking-pixels';
import { ApplicationFormLoader } from './application-form-loader';
import { clerkClient } from '@clerk/nextjs/server';
import type { TrackingPixels as TrackingPixelsType } from '@/lib/types';
import type { Metadata } from 'next';

// Do not cache this page.
// Intake form customization should appear immediately after save, and stale
// cache windows can make newly added sections/questions look "missing".
export const revalidate = 0;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) return { title: 'Application — Chippi' };

  const { data: settings } = await supabase
    .from('SpaceSetting')
    .select('businessName')
    .eq('spaceId', space.id)
    .maybeSingle();

  const name = settings?.businessName || space.name;
  return {
    title: `${name} — Application`,
    description: `Submit your application to ${name}.`,
    openGraph: { title: `${name} — Application`, description: `Submit your application to ${name}.` },
  };
}

export default async function PublicApplyPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ resume?: string }>;
}) {
  const { slug } = await params;
  const { resume: resumeToken } = await searchParams;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  // Parallel queries — both depend on space but run simultaneously
  // Use two queries: one for core fields (always exist), one for customization (may not exist yet)
  const [{ data: coreSettings }, { data: customSettings }, { data: ownerData }] = await Promise.all([
    supabase
      .from('SpaceSetting')
      .select('intakePageTitle, intakePageIntro, businessName, logoUrl, realtorPhotoUrl, privacyPolicyHtml')
      .eq('spaceId', space.id)
      .maybeSingle(),
    supabase
      .from('SpaceSetting')
      .select(
        'intakeAccentColor, intakeBorderRadius, intakeFont, intakeDarkMode, ' +
        'intakeHeaderBgColor, intakeHeaderGradient, intakeVideoUrl, ' +
        'intakeDisclaimerText, intakeThankYouTitle, intakeThankYouMessage, ' +
        'intakeFooterLinks, intakeDisabledSteps, intakeCustomQuestions, ' +
        'intakeFaviconUrl, bio, socialLinks, privacyPolicyUrl, consentCheckboxLabel, ' +
        'formConfig, formConfigSource, rentalFormConfig, buyerFormConfig, trackingPixels'
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
    formConfig: import('@/lib/types').IntakeFormConfig | null;
    formConfigSource: string | null;
    rentalFormConfig: import('@/lib/types').IntakeFormConfig | null;
    buyerFormConfig: import('@/lib/types').IntakeFormConfig | null;
    trackingPixels: TrackingPixelsType | null;
  } | null;

  const pageTitle = settings?.intakePageTitle || 'Application';
  const pageIntro = settings?.intakePageIntro || "Share your preferences and we'll follow up with next steps.";
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

  // ── Resolve dynamic form configs (dual: rental + buyer) ──────────────────
  type IFC = import('@/lib/types').IntakeFormConfig;
  let resolvedFormConfig: IFC | null = null;
  let resolvedRentalFormConfig: IFC | null = null;
  let resolvedBuyerFormConfig: IFC | null = null;
  const formConfigSource = settings?.formConfigSource ?? 'legacy';

  if (formConfigSource === 'brokerage' && space.brokerageId) {
    // Fetch form configs from brokerage template
    try {
      const { data: brokerageData } = await supabase
        .from('Brokerage')
        .select('brokerageFormConfig, brokerageRentalFormConfig, brokerageBuyerFormConfig')
        .eq('id', space.brokerageId)
        .maybeSingle();
      if (brokerageData) {
        resolvedRentalFormConfig = (brokerageData.brokerageRentalFormConfig ?? brokerageData.brokerageFormConfig ?? null) as IFC | null;
        resolvedBuyerFormConfig = (brokerageData.brokerageBuyerFormConfig ?? null) as IFC | null;
        // Legacy compat
        resolvedFormConfig = (brokerageData.brokerageFormConfig ?? null) as IFC | null;
      }
    } catch {
      // Brokerage fetch failed — fall back to legacy form
    }
  } else if (formConfigSource === 'custom') {
    resolvedRentalFormConfig = settings?.rentalFormConfig ?? settings?.formConfig ?? null;
    resolvedBuyerFormConfig = settings?.buyerFormConfig ?? null;
    // Legacy compat
    resolvedFormConfig = settings?.formConfig ?? null;
  }
  // formConfigSource === 'legacy' → all resolved configs stay null → legacy form

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
    privacyPolicyUrl: settings?.privacyPolicyUrl || `/apply/${slug}/privacy`,
    consentCheckboxLabel: settings?.consentCheckboxLabel || null,
  };

  const trackingPixels = settings?.trackingPixels ?? null;

  return (
    <>
      <TrackingPixels pixels={trackingPixels} />
      <PublicPageShell
        logoUrl={logoUrl}
        businessName={businessName}
        agentName={agentName}
        agentPhone={null}
        agentPhoto={agentPhoto}
        pageTitle={pageTitle}
        pageIntro={pageIntro}
        trustLine={`Your information is shared only with ${agentName} and used solely for your inquiry.`}
        customization={customization}
      >
        <ApplicationFormLoader slug={slug} spaceId={space.id} businessName={businessName} customization={customization} formConfig={resolvedFormConfig} rentalFormConfig={resolvedRentalFormConfig} buyerFormConfig={resolvedBuyerFormConfig} resumeToken={resumeToken} />
      </PublicPageShell>
    </>
  );
}
