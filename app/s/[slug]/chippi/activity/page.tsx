import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { ChippiPageShell } from '@/components/chippi/chippi-page-shell';
import { UnifiedActivityFeed } from '@/components/chippi/unified-activity-feed';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Activity — Chippi' };

/**
 * /chippi/activity — the unified "what Chippi did" timeline.
 *
 * One filterable, sortable stream that merges Chippi's own actions with the
 * cross-app events it noticed. Replaces the old split between /chippi/history
 * (Chippi's actions) and /chippi/triggers (app events). The per-app trigger
 * MANAGEMENT (pause/resume what Chippi listens to) still lives on
 * /chippi/triggers — linked from this page's header so it stays reachable.
 *
 * Owner-scoped, mirroring the other /chippi/* sub-pages.
 */
export default async function ChippiActivityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  // Verify ownership before rendering — mirror the other /chippi/* sub-pages.
  const { data: spaceOwner } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', userId)
    .eq('id', space.ownerId)
    .maybeSingle();
  if (!spaceOwner) notFound();

  return (
    <ChippiPageShell
      greeting="Activity."
      title="Everything I've done."
      subtitle="Filter by type, status, or date to find exactly what happened, when, and how it turned out."
    >
      <div className="-mt-2 flex justify-end border-b border-border/60 pb-3">
        <Link
          href={`/s/${slug}/chippi/triggers`}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Manage what Chippi listens to
        </Link>
      </div>
      <UnifiedActivityFeed />
    </ChippiPageShell>
  );
}
