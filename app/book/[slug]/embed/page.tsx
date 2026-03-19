import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { BookingForm } from '../booking-form';

/**
 * Embeddable booking page — designed to be loaded in an iframe.
 * Minimal chrome, no header/footer, transparent background.
 */
export default async function EmbedBookingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const { data: settingsData } = await supabase
    .from('SpaceSetting')
    .select('businessName, tourDuration, timezone')
    .eq('spaceId', space.id)
    .maybeSingle();

  const businessName = (settingsData as any)?.businessName || space.name;
  const duration = (settingsData as any)?.tourDuration || 30;
  const timezone = (settingsData as any)?.timezone || 'America/New_York';

  return (
    <html>
      <body style={{ margin: 0, padding: 16, fontFamily: 'system-ui, sans-serif', background: 'transparent' }}>
        <BookingForm slug={slug} duration={duration} businessName={businessName} timezone={timezone} />
      </body>
    </html>
  );
}
