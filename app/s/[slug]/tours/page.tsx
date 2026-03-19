import { auth } from '@clerk/nextjs/server';
import { redirect, notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getSpaceFromSlug } from '@/lib/space';
import { ToursClient } from './tours-client';

export default async function ToursPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  // Fetch tours with linked deal info
  const { data: toursRaw } = await supabase
    .from('Tour')
    .select('*, Contact(id, name, email, phone)')
    .eq('spaceId', space.id)
    .order('startsAt', { ascending: false })
    .limit(200);

  // Fetch deals that came from tours to show the link
  const tourIds = (toursRaw ?? []).map((t: any) => t.id);
  const { data: dealLinks } = tourIds.length
    ? await supabase
        .from('Deal')
        .select('id, sourceTourId')
        .in('sourceTourId', tourIds)
    : { data: [] };
  const dealByTour = new Map((dealLinks ?? []).map((d: any) => [d.sourceTourId, d.id]));
  const tours = (toursRaw ?? []).map((t: any) => ({
    ...t,
    sourceDealId: dealByTour.get(t.id) ?? null,
  }));

  // Check Google Calendar status
  const { data: gcalToken } = await supabase
    .from('GoogleCalendarToken')
    .select('id')
    .eq('spaceId', space.id)
    .maybeSingle();

  // Fetch property profiles
  const { data: propertyProfiles } = await supabase
    .from('TourPropertyProfile')
    .select('id, name, address, tourDuration, isActive')
    .eq('spaceId', space.id)
    .order('createdAt', { ascending: true });

  return (
    <ToursClient
      slug={slug}
      initialTours={tours ?? []}
      hasGoogleCalendar={!!gcalToken}
      bookingUrl={`/book/${slug}`}
      propertyProfiles={(propertyProfiles ?? []) as any}
    />
  );
}
