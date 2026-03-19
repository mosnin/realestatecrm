import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getSpaceFromSlug } from '@/lib/space';
import { ApplicationForm } from './application-form';
import { Phone, Mail } from 'lucide-react';

export default async function PublicApplyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  // Parallelize both queries instead of running them sequentially
  const [{ data: settingsData }, { data: ownerData }] = await Promise.all([
    supabase
      .from('SpaceSetting')
      .select('intakePageTitle, intakePageIntro, businessName, phoneNumber, logoUrl, realtorPhotoUrl')
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
    phoneNumber: string | null;
    logoUrl: string | null;
    realtorPhotoUrl: string | null;
  } | null;

  const pageTitle = settings?.intakePageTitle || `Apply with ${space.name}`;
  const pageIntro = settings?.intakePageIntro || "Share your rental preferences and we'll follow up with next steps.";
  const businessName = settings?.businessName || space.name;
  const agentName = ownerData?.name || businessName;
  const agentPhone = settings?.phoneNumber || null;
  const agentPhoto = settings?.realtorPhotoUrl || ownerData?.avatar || null;
  const logoUrl = settings?.logoUrl || null;

  return (
    <div className="min-h-screen bg-background">
      {/* Minimal header — flush, no borders */}
      <div className="max-w-2xl mx-auto px-4 pt-8 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <img src={logoUrl} alt={businessName} className="h-8 object-contain" />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-sm">
                {space.emoji}
              </div>
            )}
            <span className="text-sm font-medium text-muted-foreground">{businessName}</span>
          </div>
        </div>
      </div>

      {/* Main content — clean, borderless */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="space-y-8">
          {/* Agent card + title */}
          <div className="text-center space-y-5">
            {/* Realtor profile card */}
            {(agentPhoto || agentName) && (
              <div className="flex flex-col items-center gap-3">
                {agentPhoto && (
                  <img
                    src={agentPhoto}
                    alt={agentName}
                    className="w-16 h-16 rounded-full object-cover ring-2 ring-border"
                  />
                )}
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-foreground">{agentName}</p>
                  {agentPhone && (
                    <a href={`tel:${agentPhone}`} className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                      <Phone size={11} />
                      {agentPhone}
                    </a>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                {pageTitle}
              </h1>
              <p className="text-muted-foreground text-sm md:text-base max-w-md mx-auto leading-relaxed">
                {pageIntro}
              </p>
            </div>
          </div>

          {/* Form — no card wrapper, flush with page */}
          <ApplicationForm slug={slug} businessName={businessName} />

          {/* Footer trust line */}
          <p className="text-center text-xs text-muted-foreground/60 pt-4">
            Your information is shared only with {agentName} and used solely for rental inquiries.
          </p>
        </div>
      </div>
    </div>
  );
}
