import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { BookingForm } from './booking-form';
import { Phone } from 'lucide-react';

export default async function PublicBookingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const { data: settingsData } = await supabase
    .from('SpaceSetting')
    .select('tourBookingPageTitle, tourBookingPageIntro, businessName, tourDuration, timezone, phoneNumber, logoUrl, realtorPhotoUrl')
    .eq('spaceId', space.id)
    .maybeSingle();

  const settings = settingsData as {
    tourBookingPageTitle: string | null;
    tourBookingPageIntro: string | null;
    businessName: string | null;
    tourDuration: number | null;
    timezone: string | null;
    phoneNumber: string | null;
    logoUrl: string | null;
    realtorPhotoUrl: string | null;
  } | null;

  const { data: ownerData } = await supabase
    .from('User')
    .select('name, avatar')
    .eq('id', space.ownerId)
    .maybeSingle();

  const pageTitle = settings?.tourBookingPageTitle || `Book a Tour with ${space.name}`;
  const pageIntro = settings?.tourBookingPageIntro || 'Pick a time that works for you and we\'ll confirm your tour.';
  const businessName = settings?.businessName || space.name;
  const duration = settings?.tourDuration || 30;
  const timezone = settings?.timezone || 'America/New_York';
  const agentName = ownerData?.name || businessName;
  const agentPhone = settings?.phoneNumber || null;
  const agentPhoto = settings?.realtorPhotoUrl || ownerData?.avatar || null;
  const logoUrl = settings?.logoUrl || null;

  return (
    <div className="min-h-screen bg-background">
      {/* Minimal header — flush, no borders */}
      <div className="max-w-2xl mx-auto px-4 pt-8 pb-2">
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

      {/* Main content — clean, borderless */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="space-y-8">
          {/* Agent card + title */}
          <div className="text-center space-y-5">
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

          <BookingForm slug={slug} duration={duration} businessName={businessName} timezone={timezone} />

          <p className="text-center text-xs text-muted-foreground/60 pt-4">
            Your information is shared only with {agentName} and used solely for scheduling.
          </p>
        </div>
      </div>
    </div>
  );
}
