import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { formatPropertyAddress } from '@/lib/properties';
import { normalizeArea } from '@/lib/areas';
import { getAreaReport } from '@/lib/area-report-store';
import type { Property, AreaReport } from '@/lib/types';
import { PropertyDetailClient } from '@/components/properties/property-detail-client';

export const dynamic = 'force-dynamic';

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const { data: property } = await supabase
    .from('Property')
    .select('*')
    .eq('id', id)
    .eq('spaceId', space.id)
    .maybeSingle();
  if (!property) notFound();

  const [{ data: deals }, { data: tours }] = await Promise.all([
    supabase
      .from('Deal')
      .select('id, title, status, value, closeDate')
      .eq('propertyId', id)
      .eq('spaceId', space.id)
      .order('updatedAt', { ascending: false }),
    supabase
      .from('Tour')
      .select('id, guestName, startsAt, status')
      .eq('propertyId', id)
      .eq('spaceId', space.id)
      .order('startsAt', { ascending: false })
      .limit(20),
  ]);

  const addr = formatPropertyAddress(property as Property);

  // Property IQ "already there": if this property's area has already been
  // researched (by auto-enrich, a sibling listing, or a prior run), load the
  // report server-side so the Area IQ brief renders instantly with no click and
  // no wait. The common case after the first listing in a ZIP.
  const prop = property as Property;
  const area = normalizeArea({
    city: prop.city,
    stateRegion: prop.stateRegion,
    postalCode: prop.postalCode,
  });
  let initialAreaReport: AreaReport | null = null;
  if (area) {
    try {
      initialAreaReport = await getAreaReport(area.areaKey);
    } catch {
      initialAreaReport = null;
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Breadcrumb — the detail page is no longer an orphan child of /deals.
          Matches the contact-detail breadcrumb pattern: muted "back" link
          with chevron, in muted-foreground. */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1 text-xs text-muted-foreground"
      >
        <Link
          href={`/s/${slug}/properties`}
          className="hover:text-foreground transition-colors"
        >
          Properties
        </Link>
        <ChevronRight size={11} aria-hidden className="text-muted-foreground/60" />
        <span className="truncate text-foreground">{addr}</span>
      </nav>

      <PropertyDetailClient
        slug={slug}
        initial={property as Property}
        initialAreaReport={initialAreaReport}
        linkedDeals={(deals ?? []) as { id: string; title: string; status: string; value: number | null; closeDate: string | null }[]}
        linkedTours={(tours ?? []) as { id: string; guestName: string; startsAt: string; status: string }[]}
      />
    </div>
  );
}
