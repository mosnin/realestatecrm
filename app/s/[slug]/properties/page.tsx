import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import { Building2, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getSpaceFromSlug, getSpaceForUser } from '@/lib/space';
import { H1, TITLE_FONT, BODY_MUTED, PAGE_MAX, PRIMARY_PILL } from '@/lib/typography';
import type { Property } from '@/lib/types';
import { cn } from '@/lib/utils';
import { PropertyListGrid } from '@/components/properties/property-list-grid';
import { AreaIqLauncher } from '@/components/properties/area-iq-launcher';
import { Reveal, SplitReveal } from '@/components/motion';

export default async function PropertiesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const userSpace = await getSpaceForUser(userId);
  if (!userSpace || userSpace.id !== space.id) redirect('/');

  let properties: Property[] = [];
  let fetchError = false;
  try {
    const { data, error } = await supabase
      .from('Property')
      .select('*')
      .or(`spaceId.eq.${space.id},assignedSpaceId.eq.${space.id}`)
      .order('createdAt', { ascending: false });
    if (error) throw error;
    properties = (data ?? []) as Property[];
  } catch (err) {
    console.error('[properties/page] DB query failed', { slug, error: err });
    fetchError = true;
  }

  if (fetchError) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className={cn(BODY_MUTED)}>
            We couldn&apos;t load your properties. This is usually temporary.
          </p>
          <a
            href={`/s/${slug}/properties`}
            className="inline-block px-4 py-2 text-sm font-medium rounded-md bg-foreground text-background hover:bg-foreground/90"
          >
            Try again
          </a>
        </div>
      </div>
    );
  }

  // One quiet sentence about the wall — sale-status counts narrated, not
  // tallied in a chart. Active is the loud fact; the rest is supporting.
  const activeCount = properties.filter((p) => p.listingStatus === 'active').length;
  const subtitle =
    properties.length === 0
      ? 'No properties yet.'
      : activeCount === properties.length
        ? `${properties.length} ${properties.length === 1 ? 'listing' : 'listings'}, all active.`
        : `${properties.length} ${properties.length === 1 ? 'listing' : 'listings'}` +
          (activeCount > 0 ? ` · ${activeCount} active` : '');

  return (
    <div className={cn('space-y-8 mx-auto pb-12', PAGE_MAX)}>
      {/* Page header — status-sentence pattern: muted greeting → serif h1
          → one-sentence status. Add-listing CTA sits inline; primary
          action lives where the realtor's eye lands after the title. */}
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <p className={cn(BODY_MUTED)}>Properties.</p>
          <h1 className={cn(H1)} style={TITLE_FONT}>
            <SplitReveal as="span" text="All properties" />
          </h1>
          <p className={cn(BODY_MUTED)}>{subtitle}</p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <AreaIqLauncher />
          <Link
            href={`/s/${slug}/properties/new`}
            className={cn(PRIMARY_PILL, 'inline-flex items-center gap-1.5')}
          >
            <Plus size={14} aria-hidden />
            Add property
          </Link>
        </div>
      </header>

      {/* Empty state — calm fact, not a directive. */}
      {properties.length === 0 ? (
        <Reveal variant="rise" className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-16 text-center">
          <Building2 size={28} className="mx-auto mb-3 text-muted-foreground/60" aria-hidden />
          <p className="text-sm text-foreground">Quiet — no properties yet.</p>
          <p className={cn('text-xs mt-1', BODY_MUTED)}>
            Add your first listing to start the register.
          </p>
          <Link
            href={`/s/${slug}/properties/new`}
            className={cn(PRIMARY_PILL, 'inline-flex items-center gap-1.5 mt-4')}
          >
            <Plus size={14} aria-hidden />
            Add property
          </Link>
        </Reveal>
      ) : (
        /* The listing wall — a responsive card grid with strong photo
           treatment, confident compact prices, hover lift, entrance
           stagger, and per-card expand for quick specs. The card title
           and cover both link to the full detail page (route unchanged).
           PropertyListGrid (components/properties/**, out of this team's
           ownership) already runs its own framer-motion entrance stagger on
           mount — intentionally NOT re-wrapped in <StaggerReveal> here to
           avoid animating the same cards twice. */
        <PropertyListGrid slug={slug} properties={properties} />
      )}
    </div>
  );
}
