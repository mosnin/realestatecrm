/**
 * Routines — the realtor's standing instructions for Chippi.
 *
 * Server shell only — resolves the space, then hands off to the client
 * <RoutinesManager/>, which reads and writes through /api/routines. The
 * hourly cron at /api/cron/routines is what actually fires them.
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { RoutinesManager } from '@/components/routines/routines-manager';
import { ChippiPageShell } from '@/components/chippi/chippi-page-shell';

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

  return (
    <ChippiPageShell
      greeting="Routines."
      title="What Chippi does on its own"
      subtitle="Standing instructions Chippi runs on a schedule — even when you're not here. Every run drafts; nothing is sent without your approval."
    >
      <RoutinesManager />
    </ChippiPageShell>
  );
}
