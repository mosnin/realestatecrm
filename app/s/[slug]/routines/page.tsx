import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { ChippiPageShell } from '@/components/chippi/chippi-page-shell';
import { RoutinesManager } from '@/components/routines/routines-manager';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Routines — Chippi' };

/**
 * /routines — the realtor's standing instructions for Chippi, on their own
 * page (previously this redirected into Settings, which buried the feature).
 * Read/write through /api/routines; the hourly cron at /api/cron/routines
 * fires the due ones. Every run drafts — nothing is sent without the
 * realtor's tap.
 */
export default async function RoutinesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  // Ownership gate — mirror the other /chippi/* sub-pages: the signed-in
  // Clerk user must own this space.
  const { data: spaceOwner } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', userId)
    .eq('id', space.ownerId)
    .maybeSingle();
  if (!spaceOwner) notFound();

  return (
    <ChippiPageShell
      greeting="Routines."
      title="What I run on a schedule."
      subtitle="Give me a recurring beat. Every run drafts — nothing goes out without your tap."
    >
      <RoutinesManager apiBase="/api/routines" />
    </ChippiPageShell>
  );
}
