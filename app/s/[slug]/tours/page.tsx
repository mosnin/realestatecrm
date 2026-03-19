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

  // Fetch tours
  const { data: tours } = await supabase
    .from('Tour')
    .select('*, Contact(id, name, email, phone)')
    .eq('spaceId', space.id)
    .order('startsAt', { ascending: false })
    .limit(200);

  // Check Google Calendar status
  const { data: gcalToken } = await supabase
    .from('GoogleCalendarToken')
    .select('id')
    .eq('spaceId', space.id)
    .maybeSingle();

  return (
    <ToursClient
      slug={slug}
      initialTours={tours ?? []}
      hasGoogleCalendar={!!gcalToken}
      bookingUrl={`/book/${slug}`}
    />
  );
}
