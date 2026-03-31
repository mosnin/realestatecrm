import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { CalendarView } from './calendar-view';
import type { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Calendar — ${slug}` };
}

export default async function CalendarPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [toursResult, contactFollowUpsResult, dealFollowUpsResult] =
    await Promise.all([
      supabase
        .from('Tour')
        .select(
          'id, guestName, guestEmail, propertyAddress, startsAt, endsAt, status'
        )
        .eq('spaceId', space.id)
        .in('status', ['scheduled', 'confirmed'])
        .gte('startsAt', thirtyDaysAgo.toISOString())
        .order('startsAt'),
      supabase
        .from('Contact')
        .select('id, name, phone, email, followUpAt')
        .eq('spaceId', space.id)
        .not('followUpAt', 'is', null)
        .order('followUpAt'),
      supabase
        .from('Deal')
        .select('id, title, followUpAt')
        .eq('spaceId', space.id)
        .not('followUpAt', 'is', null)
        .order('followUpAt'),
    ]);

  const tours = (toursResult.data ?? []) as {
    id: string;
    guestName: string;
    guestEmail: string | null;
    propertyAddress: string | null;
    startsAt: string;
    endsAt: string;
    status: string;
  }[];

  const contactFollowUps = (contactFollowUpsResult.data ?? []) as {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    followUpAt: string;
  }[];

  const dealFollowUps = (dealFollowUpsResult.data ?? []) as {
    id: string;
    title: string;
    followUpAt: string;
  }[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Tours and follow-ups at a glance.
        </p>
      </div>
      <CalendarView
        slug={slug}
        tours={tours}
        contactFollowUps={contactFollowUps}
        dealFollowUps={dealFollowUps}
      />
    </div>
  );
}
