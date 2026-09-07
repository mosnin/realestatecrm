import { readAllRows } from '@/lib/read-all-rows';
import { dealHealth, inferNextAction } from '@/lib/deals/health';
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

  let properties: (Property & { workSummary?: string })[] = [];
  let fetchError = false;
  try {
    properties = await readAllRows<Property>((from,to) => supabase.from('Property').select('*').or(`spaceId.eq.${space.id},assignedSpaceId.eq.${space.id}`).order('createdAt', {ascending:false}).order('id').range(from,to));

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

  try {
    const deals = await readAllRows<import('@/lib/types').Deal>((from,to) => supabase.from('Deal').select('*').eq('spaceId',space.id).eq('status','active').not('propertyId','is',null).order('id').range(from,to));
    const checklist = await readAllRows<{dealId:string;kind:string;label:string;dueAt:string|null;completedAt:string|null}>((from,to) => supabase.from('DealChecklistItem').select('dealId,kind,label,dueAt,completedAt').eq('spaceId',space.id).order('id').range(from,to));
    const dealsWithChecklist = deals.map(deal => ({...deal, checklist: checklist.filter(item => item.dealId === deal.id)}));
    properties = properties.map(property => {
      const linked = dealsWithChecklist.filter(deal=>deal.propertyId===property.id).sort((a,b)=>(dealHealth(a).state==='on-track'?1:0)-(dealHealth(b).state==='on-track'?1:0));
      return {...property,workSummary: linked[0] ? `${linked[0].title} · ${dealHealth(linked[0]).reason || inferNextAction(linked[0])?.label || 'No next action recorded'}` : 'No active deal linked'};
    });
  } catch { properties = properties.map(property=>({...property,workSummary:'Linked deal status unavailable'})); }

  // One quiet sentence about the wall — sale-status counts narrated, not
  // tallied in a chart. Active is the loud fact; the rest is supporting.
  const activeCount = properties.filter((p) => p.listingStatus === 'active').length;
  const pendingCount = properties.filter((p) => p.listingStatus === 'pending').length;
  const analyzedCount = properties.filter((p) => p.analysis?.sources?.length).length;
  const subtitle =
    properties.length === 0
      ? 'No properties yet.'
      : activeCount === properties.length
        ? `${properties.length} ${properties.length === 1 ? 'listing' : 'listings'}, all active.`
        : `${properties.length} ${properties.length === 1 ? 'listing' : 'listings'}` +
          (activeCount > 0 ? ` · ${activeCount} active` : '');

  return (
    <SupportingPage family="inventory" width="wide">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div><h1 className="text-2xl font-medium">Properties</h1><p className="mt-1 text-sm text-muted-foreground">{subtitle}</p></div>
        <Link href={`/s/${slug}/properties/new`} className={PRIMARY_PILL}>Add property</Link>
      </header>
      <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Inventory summary and area research</summary><div className="mt-3"><AreaIqLauncher />
      <SupportingMetricBand>
        <SupportingMetric label="Inventory" value={properties.length} detail="all saved properties" />
        <SupportingMetric label="Active" value={activeCount} detail="currently marketed" accent />
        <SupportingMetric label="Pending" value={pendingCount} detail="moving to close" />
        <SupportingMetric label="Research saved" value={`${analyzedCount}/${properties.length}`} detail="web evidence, not verified availability" />
      </SupportingMetricBand>
      </div></details>

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
