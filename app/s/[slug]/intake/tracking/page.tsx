import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { TrackingSettingsForm } from '@/app/s/[slug]/settings/tracking/tracking-settings-form';
import { ArrowLeft } from 'lucide-react';
import type { TrackingPixels } from '@/lib/types';

export default async function IntakeTrackingPage({
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
    console.error('[intake/tracking] DB query failed', err);
    return (
      <div className="space-y-6 max-w-3xl">
        <h1
          className="text-3xl tracking-tight text-foreground"
          style={{ fontFamily: 'var(--font-title)' }}
        >
          Tracking
        </h1>
        <div className="rounded-xl border border-border/70 bg-background p-6 space-y-3">
          <p className="text-sm text-foreground">Something went wrong.</p>
          <p className="text-xs text-muted-foreground">
            We couldn&apos;t load your data. This is usually temporary.
          </p>
          <Link
            href={`/s/${slug}/intake`}
            className="inline-flex items-center text-sm font-medium px-4 py-2 rounded-full bg-foreground text-background hover:bg-foreground/90 active:scale-[0.98] transition-all duration-150"
          >
            Try again
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1.5">
          <h1
            className="text-3xl tracking-tight text-foreground"
            style={{ fontFamily: 'var(--font-title)' }}
          >
            Tracking
          </h1>
          <p className="text-sm text-muted-foreground">
            Pixels fire when applicants visit and submit your intake form.
          </p>
        </div>
        <Link
          href={`/s/${slug}/intake`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150"
        >
          <ArrowLeft size={13} strokeWidth={1.75} />
          Overview
        </Link>
      </header>
      <TrackingSettingsForm slug={space.slug} trackingPixels={trackingPixels} />
    </div>
  );
}
