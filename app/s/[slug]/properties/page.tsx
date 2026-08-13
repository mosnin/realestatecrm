import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getSpaceFromSlug, getSpaceForUser } from '@/lib/space';
import { H1, TITLE_FONT, BODY_MUTED, PRIMARY_PILL } from '@/lib/typography';
import type { Property } from '@/lib/types';
import { cn } from '@/lib/utils';
import { PropertyListGrid } from '@/components/properties/property-list-grid';
import { AreaIqLauncher } from '@/components/properties/area-iq-launcher';
import { Reveal, SplitReveal } from '@/components/motion';
import { RealtorEmptyState, RealtorPage } from '../_components/realtor-page';

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
      <RealtorPage width="content" className="flex items-center justify-center">
        <RealtorEmptyState
          title="Your properties didn't load."
          description="Your listings are safe. This is usually temporary."
          action={
            <a href={`/s/${slug}/properties`} className={PRIMARY_PILL}>
              Try again
            </a>
          }
        />
      </RealtorPage>
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
    <RealtorPage width="wide">
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
        <Reveal variant="rise">
          <RealtorEmptyState
            title="Quiet — no properties yet."
            description="Add your first listing to start the register."
            action={
              <Link href={`/s/${slug}/properties/new`} className={PRIMARY_PILL}>
                <Plus size={14} aria-hidden />
                Add property
              </Link>
            }
          />
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
    </RealtorPage>
  );
}
