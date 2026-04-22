import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import type { Property } from '@/lib/types';
import { PropertiesClient } from '@/components/properties/properties-client';

export const dynamic = 'force-dynamic';

export default async function PropertiesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const { data } = await supabase
    .from('Property')
    .select('*')
    .eq('spaceId', space.id)
    .order('updatedAt', { ascending: false })
    .limit(200);

  const properties = (data ?? []) as Property[];

  return (
    <div className="space-y-4 max-w-[1320px]">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Properties</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Every address you&apos;re working on — linkable to deals, tours, and listing packets.
        </p>
      </div>
      <PropertiesClient slug={slug} initial={properties} />
    </div>
  );
}
