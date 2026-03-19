import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { BookingForm } from './booking-form';

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
    .select('tourBookingPageTitle, tourBookingPageIntro, businessName, tourDuration')
    .eq('spaceId', space.id)
    .maybeSingle();

  const settings = settingsData as {
    tourBookingPageTitle: string | null;
    tourBookingPageIntro: string | null;
    businessName: string | null;
    tourDuration: number | null;
  } | null;

  const pageTitle = settings?.tourBookingPageTitle || `Book a Tour with ${space.name}`;
  const pageIntro = settings?.tourBookingPageIntro || 'Pick a time that works for you and we\'ll confirm your tour.';
  const businessName = settings?.businessName || space.name;
  const duration = settings?.tourDuration || 30;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <div className="border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-sm">
            {space.emoji}
          </div>
          <span className="text-sm font-medium text-muted-foreground">{businessName}</span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-10 md:py-14">
        <div className="space-y-8">
          <div className="text-center space-y-3">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
              {pageTitle}
            </h1>
            <p className="text-muted-foreground text-sm md:text-base max-w-md mx-auto leading-relaxed">
              {pageIntro}
            </p>
          </div>

          <BookingForm slug={slug} duration={duration} businessName={businessName} />

          <p className="text-center text-xs text-muted-foreground/70 pt-2">
            Your information is shared only with {businessName} and used solely for scheduling.
          </p>
        </div>
      </div>
    </div>
  );
}
