import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import type { Property } from '@/lib/types';
import { PropertiesClient } from '@/components/properties/properties-client';

export const dynamic = 'force-dynamic';

interface DealRow {
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

  // Pull listings + deals in parallel. Deals only need close-date + status —
  // enough to count what closed this week and what's closing today. The old
  // commission roll-up has its own page; the landing doesn't carry it.
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [propsResult, dealsResult] = await Promise.all([
    supabase
      .from('Property')
      .select('*')
      .eq('spaceId', space.id)
      .order('updatedAt', { ascending: false })
      .limit(200),
    supabase
      .from('Deal')
      .select('status, closeDate')
      .eq('spaceId', space.id),
  ]);

  const properties = (propsResult.data ?? []) as Property[];
  const deals = (dealsResult.data ?? []) as DealRow[];

  // Narration ladder — pick the loudest fact. Hand-coded, inline, no agent
  // call. Mirrors the broker/realtors page pattern.
  const liveCount = properties.filter((p) => p.listingStatus === 'active').length;
  const pendingCount = properties.filter((p) => p.listingStatus === 'pending').length;
  const closedThisWeek = deals.filter(
    (d) => d.status === 'won' && d.closeDate && d.closeDate >= weekStart,
  ).length;
  const closingToday = properties.find(
    (p) =>
      p.listingStatus === 'pending' &&
      // We don't have a close-date on property directly, but pending + recent
      // update is the closest signal. The deal-level closing-today story is
      // owned by /deals; this page tells the listing-level story.
      p.updatedAt >= todayStart &&
      p.updatedAt < todayEnd,
  );

  const subtitle = (() => {
    if (properties.length === 0) {
      return 'No listings yet. Drop the first address.';
    }
    if (closingToday) {
      const short = closingToday.address.split(',')[0];
      return `1 listing closing today — ${short}.`;
    }
    if (closedThisWeek > 0) {
      return `${closedThisWeek} ${closedThisWeek === 1 ? 'listing' : 'listings'} closed this week. Pipeline alive.`;
    }
    if (pendingCount > 0) {
      return `${liveCount} live, ${pendingCount} pending. Steady week.`;
    }
    if (liveCount > 0) {
      return `${liveCount} ${liveCount === 1 ? 'listing' : 'listings'} active. Quiet week.`;
    }
    return `${properties.length} on the books. Nothing live right now.`;
  })();

  return (
    <div className="max-w-[1500px]">
      <PropertiesClient slug={slug} initial={properties} subtitle={subtitle} />
    </div>
  );
}
