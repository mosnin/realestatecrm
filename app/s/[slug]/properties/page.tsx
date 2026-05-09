import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { computeCommission, type CommissionSplit } from '@/lib/commissions';
import type { Property } from '@/lib/types';
import { PropertiesListClient, type PropertyRow } from '@/components/properties/properties-list-client';

export const dynamic = 'force-dynamic';

interface DealRow {
  id: string;
  status: 'active' | 'won' | 'lost' | 'on_hold';
  value: number | null;
  commissionRate: number | null;
  propertyId: string | null;
}

/**
 * Realtor's property inventory. The hierarchy realtors actually live in is
 * properties → leads → deals: they list/manage properties, then attach
 * incoming leads to them as deals. Putting Properties up front (with
 * Commissions as the money-view sub-page) reflects that workflow.
 *
 * Each row aggregates net commission across the property's deals so the
 * realtor sees what the property is earning at a glance — that's the
 * field that connects properties to commissions on this surface.
 */
export default async function PropertiesIndexPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const [propertiesResult, dealsResult, splitsResult] = await Promise.all([
    supabase
      .from('Property')
      .select('*')
      .eq('spaceId', space.id)
      .order('updatedAt', { ascending: false }),
    supabase
      .from('Deal')
      .select('id, status, value, commissionRate, propertyId')
      .eq('spaceId', space.id)
      .not('propertyId', 'is', null),
    supabase
      .from('CommissionSplit')
      .select('*')
      .eq('spaceId', space.id),
  ]);

  const properties = (propertiesResult.data ?? []) as Property[];
  const deals = (dealsResult.data ?? []) as DealRow[];
  const splits = (splitsResult.data ?? []) as CommissionSplit[];

  const splitsByDeal = new Map<string, CommissionSplit[]>();
  for (const s of splits) {
    const arr = splitsByDeal.get(s.dealId) ?? [];
    arr.push(s);
    splitsByDeal.set(s.dealId, arr);
  }

  // Roll commission up to each property: closed-net (won deals) + expected
  // (active deals). Counts kept separately so the row can show "2 deals"
  // without overstating earned money.
  const aggregateByProperty = new Map<
    string,
    { dealCount: number; activeCount: number; wonCount: number; closedNet: number; expectedNet: number }
  >();
  for (const d of deals) {
    if (!d.propertyId) continue;
    const r = computeCommission(d.value, d.commissionRate, splitsByDeal.get(d.id) ?? []);
    const agg = aggregateByProperty.get(d.propertyId) ?? {
      dealCount: 0,
      activeCount: 0,
      wonCount: 0,
      closedNet: 0,
      expectedNet: 0,
    };
    agg.dealCount += 1;
    if (d.status === 'won') {
      agg.wonCount += 1;
      agg.closedNet += r.net;
    } else if (d.status === 'active') {
      agg.activeCount += 1;
      agg.expectedNet += r.net;
    }
    aggregateByProperty.set(d.propertyId, agg);
  }

  const rows: PropertyRow[] = properties.map((p) => {
    const agg = aggregateByProperty.get(p.id);
    return {
      property: p,
      dealCount: agg?.dealCount ?? 0,
      activeCount: agg?.activeCount ?? 0,
      wonCount: agg?.wonCount ?? 0,
      closedNet: agg?.closedNet ?? 0,
      expectedNet: agg?.expectedNet ?? 0,
    };
  });

  return <PropertiesListClient slug={slug} initialRows={rows} />;
}
