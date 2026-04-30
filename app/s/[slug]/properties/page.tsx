import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import type { Property } from '@/lib/types';
import { PropertiesClient } from '@/components/properties/properties-client';

export const dynamic = 'force-dynamic';

interface DealRow {
  value: number | null;
  commissionRate: number | null;
  status: 'active' | 'won' | 'lost' | 'on_hold';
  closeDate: string | null;
}

export default async function PropertiesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  // Pull properties + deals in parallel — deals power the commission roll-ups
  // shown in the header strip. Cap properties at 200 to match the existing
  // single-page table; the stats query is unbounded by intent.
  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();

  const [propsResult, dealsResult] = await Promise.all([
    supabase
      .from('Property')
      .select('*')
      .eq('spaceId', space.id)
      .order('updatedAt', { ascending: false })
      .limit(200),
    supabase
      .from('Deal')
      .select('value, commissionRate, status, closeDate')
      .eq('spaceId', space.id),
  ]);

  const properties = (propsResult.data ?? []) as Property[];
  const deals = (dealsResult.data ?? []) as DealRow[];

  // Closed YTD: GCI on deals won this calendar year.
  // Pipeline value: GCI implied by deals still active.
  // Live now: count of active listings.
  let closedYtd = 0;
  let pipelineValue = 0;
  for (const d of deals) {
    const gci =
      d.value != null && d.commissionRate != null
        ? (d.value * d.commissionRate) / 100
        : 0;
    if (d.status === 'won' && d.closeDate && d.closeDate >= yearStart) {
      closedYtd += gci;
    } else if (d.status === 'active') {
      pipelineValue += gci;
    }
  }
  const closedCount = deals.filter(
    (d) => d.status === 'won' && d.closeDate && d.closeDate >= yearStart,
  ).length;
  const liveCount = properties.filter((p) => p.listingStatus === 'active').length;
  const pendingPipeCount = deals.filter((d) => d.status === 'active').length;

  return (
    <div className="max-w-[1500px]">
      <PropertiesClient
        slug={slug}
        initial={properties}
        stats={{
          closedYtd,
          closedCount,
          liveCount,
          pipelineValue,
          pipelinePropertyCount: pendingPipeCount,
        }}
      />
    </div>
  );
}
