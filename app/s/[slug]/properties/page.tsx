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
import { RealtorEmptyState } from '../_components/realtor-page';
import {
  SupportingMetric,
  SupportingMetricBand,
  SupportingOrientation,
  SupportingPage,
  SupportingWorkArea,
} from '../_components/supporting-page';

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
      <SupportingPage family="inventory" width="content" className="flex items-center justify-center">
        <RealtorEmptyState
          title="Your properties didn't load."
          description="Your listings are safe. This is usually temporary."
          action={
            <a href={`/s/${slug}/properties`} className={PRIMARY_PILL}>
              Try again
            </a>
          }
        />
      </SupportingPage>
    );
  }

  // One quiet sentence about the wall — sale-status counts narrated, not
  // tallied in a chart. Active is the loud fact; the rest is supporting.
  const activeCount = properties.filter((p) => p.listingStatus === 'active').length;
  const pendingCount = properties.filter((p) => p.listingStatus === 'pending').length;
  const analyzedCount = properties.filter((p) => p.analyzedAt || p.analysis).length;
  const pricedCount = properties.filter((p) => p.listPrice != null).length;
  const subtitle =
    properties.length === 0
      ? 'No properties yet.'
      : activeCount === properties.length
        ? `${properties.length} ${properties.length === 1 ? 'listing' : 'listings'}, all active.`
        : `${properties.length} ${properties.length === 1 ? 'listing' : 'listings'}` +
          (activeCount > 0 ? ` · ${activeCount} active` : '');

  return (
    <SupportingPage family="inventory" width="wide">
      <SupportingOrientation
        family="inventory"
        eyebrow="Properties / Inventory"
        title={<SplitReveal as="span" text="The homes behind every conversation" />}
        summary={subtitle}
        nextAction={
          properties.length === 0
            ? 'Add the first property you are actively selling, buying, or researching.'
            : analyzedCount < properties.length
              ? `Enrich ${properties.length - analyzedCount} ${properties.length - analyzedCount === 1 ? 'property' : 'properties'} so pricing and outreach use grounded context.`
              : 'Open the active listing with the closest next deadline and move it forward.'
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
          <AreaIqLauncher />
          <Link
            href={`/s/${slug}/properties/new`}
            className={cn(PRIMARY_PILL, 'inline-flex items-center gap-1.5')}
          >
            <Plus size={14} aria-hidden />
            Add property
          </Link>
          </div>
        }
      />

      <SupportingMetricBand>
        <SupportingMetric label="Inventory" value={properties.length} detail="all saved properties" />
        <SupportingMetric label="Active" value={activeCount} detail="currently marketed" accent />
        <SupportingMetric label="Pending" value={pendingCount} detail="moving to close" />
        <SupportingMetric label="Market ready" value={`${analyzedCount}/${properties.length}`} detail={`${pricedCount} with a list price`} />
      </SupportingMetricBand>

      <SupportingWorkArea>
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
      </SupportingWorkArea>
    </SupportingPage>
  );
}
