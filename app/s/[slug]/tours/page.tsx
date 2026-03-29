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
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  let tours: any[] = [];
  let hasGoogleCalendar = false;
  let propertyProfiles: any[] = [];

  // Fetch tours — this is the essential query
  try {
    // Try with Contact join first; fall back to plain query if FK join fails
    let toursRaw: any[] | null = null;
    const { data: joined, error: joinError } = await supabase
      .from('Tour')
      .select('*, Contact(id, name, email, phone)')
      .eq('spaceId', space.id)
      .order('startsAt', { ascending: false })
      .limit(200);
    if (!joinError) {
      toursRaw = joined;
    } else {
      console.error('[tours] FK join failed, falling back to plain query', joinError);
      const { data: plain, error: plainError } = await supabase
        .from('Tour')
        .select('id, spaceId, contactId, guestName, guestEmail, guestPhone, propertyAddress, notes, startsAt, endsAt, status, googleEventId, manageToken, createdAt, updatedAt')
        .eq('spaceId', space.id)
        .order('startsAt', { ascending: false })
        .limit(200);
      if (plainError) throw plainError;
      toursRaw = plain;
    }

    // Fetch deals that came from tours to show the link (non-essential —
    // sourceTourId column may not exist if migration hasn't been applied)
    let dealByTour = new Map<string, string>();
    try {
      const tourIds = (toursRaw ?? []).map((t: any) => t.id);
      if (tourIds.length) {
        const { data: dealLinks } = await supabase
          .from('Deal')
          .select('id, sourceTourId')
          .in('sourceTourId', tourIds);
        dealByTour = new Map((dealLinks ?? []).map((d: any) => [d.sourceTourId, d.id]));
      }
    } catch (err) {
      console.error('[tours] Deal link query failed (non-blocking)', err);
    }
    tours = (toursRaw ?? []).map((t: any) => ({
      ...t,
      sourceDealId: dealByTour.get(t.id) ?? null,
    }));
  } catch (err) {
    console.error('[tours] Failed to load tours', err);
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">We couldn&apos;t load your data. This is usually temporary.</p>
          <a href={`/s/${slug}/tours`} className="inline-block px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90">Try again</a>
        </div>
      </div>
    );
  }

  // Non-essential queries — fail gracefully
  try {
    const { data: gcalToken } = await supabase
      .from('GoogleCalendarToken')
      .select('id')
      .eq('spaceId', space.id)
      .maybeSingle();
    hasGoogleCalendar = !!gcalToken;
  } catch (err) {
    console.error('[tours] GoogleCalendar check failed', err);
  }

  try {
    const { data: profilesData } = await supabase
      .from('TourPropertyProfile')
      .select('id, name, address, tourDuration, isActive')
      .eq('spaceId', space.id)
      .order('createdAt', { ascending: true });
    propertyProfiles = profilesData ?? [];
  } catch (err) {
    console.error('[tours] PropertyProfiles fetch failed', err);
  }

  return (
    <ToursClient
      slug={slug}
      initialTours={tours}
      hasGoogleCalendar={hasGoogleCalendar}
      bookingUrl={`/book/${slug}`}
      propertyProfiles={propertyProfiles as any}
    />
  );
}
