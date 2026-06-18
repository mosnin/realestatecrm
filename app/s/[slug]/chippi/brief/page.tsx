/**
 * /chippi/brief — the realtor's daily dashboard.
 *
 * A calm, premium bento grid that gives the realtor an at-a-glance picture
 * of their day and their business. Every number on it is REAL: composed
 * server-side by composeBriefDashboard (one parallel fan-out against the
 * realtor's own tables) and handed to the client bento as props, so the
 * grid paints with truthful numbers on first byte — no client fetch
 * waterfall, no zeros that count up after a round-trip.
 *
 * The shell's "Today." greeting orients; the bento owns everything below.
 * Each cell renders its own empty state and is omitted when it has no data
 * — calm silence over filler. See components/chippi/brief-dashboard.tsx for
 * the cell map and lib/briefing/dashboard.ts for the per-cell data source.
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { ChippiPageShell } from '@/components/chippi/chippi-page-shell';
import { BriefDashboard } from '@/components/chippi/brief-dashboard';
import { composeBriefDashboard } from '@/lib/briefing/dashboard';

export const dynamic = 'force-dynamic';

export default async function ChippiBriefPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const { data: spaceOwner } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', userId)
    .eq('id', space.ownerId)
    .maybeSingle();
  if (!spaceOwner) notFound();

  // One server-side fan-out gathers every real number the bento renders.
  const dashboard = await composeBriefDashboard(space.id, space.ownerId);

  return (
    <ChippiPageShell greeting="Today.">
      <BriefDashboard slug={slug} data={dashboard} />
    </ChippiPageShell>
  );
}
