/**
 * /chippi/brief — the dedicated daily brief page.
 *
 * The brief also auto-renders inline on /chippi (the workspace home) when
 * the chat is empty — that's still the morning entry point. This page is
 * the persistent destination from the sidebar dropdown: a realtor who
 * wants to RE-OPEN today's brief at 3pm, or look at it on a quieter
 * surface than the workspace, lands here.
 *
 * Renders the live brief — bypasses the lifecycle collapse so the realtor
 * always sees the full brief when they navigate here intentionally. They
 * came looking for it; show it.
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { ChippiPageShell } from '@/components/chippi/chippi-page-shell';
import { DailyBrief } from '@/components/chippi/daily-brief';

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

  // Verify owner — same pattern as the other chippi/* pages.
  const { data: spaceOwner } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', userId)
    .eq('id', space.ownerId)
    .maybeSingle();
  if (!spaceOwner) notFound();

  return (
    <ChippiPageShell
      greeting="Today."
      title="Daily brief"
      subtitle="The morning snapshot, on a quiet surface. Opens the same brief that lands on your workspace at 7am."
    >
      <DailyBrief slug={slug} alwaysLive />
    </ChippiPageShell>
  );
}
