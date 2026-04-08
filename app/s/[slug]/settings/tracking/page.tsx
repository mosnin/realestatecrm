import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { TrackingSettingsForm } from './tracking-settings-form';
import type { TrackingPixels } from '@/lib/types';

export default async function TrackingSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  let trackingPixels: TrackingPixels | null = null;
  try {
    const { data, error } = await supabase
      .from('SpaceSetting')
      .select('trackingPixels')
      .eq('spaceId', space.id)
      .maybeSingle();
    if (error) throw error;
    trackingPixels = (data?.trackingPixels as TrackingPixels) ?? null;
  } catch (err) {
    console.error('[settings/tracking] DB query failed', err);
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">We couldn&apos;t load your data. This is usually temporary.</p>
          <a href={`/s/${slug}/settings`} className="inline-block px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90">Try again</a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Tracking &amp; Analytics</h1>
        <p className="text-muted-foreground text-sm">
          Add tracking pixels to measure the effectiveness of your ads. They fire when applicants visit and submit your intake form.
        </p>
      </div>
      <TrackingSettingsForm slug={space.slug} trackingPixels={trackingPixels} />
    </div>
  );
}
