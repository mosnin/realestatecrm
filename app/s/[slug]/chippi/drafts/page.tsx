/**
 * /chippi/drafts — pending drafts the realtor needs to review.
 *
 * Hero + AgentDraftInbox. The /chippi/approvals route is separate: that's
 * the orchestrator's AgentTask paused-state queue, not the AgentDraft
 * inbox the realtor signs off on.
 *
 * /chippi/today shows only a compact "X drafts waiting → review" summary
 * that links here. This page is the dedicated queue.
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { AgentDraftInbox } from '@/components/agent/agent-draft-inbox';
import { ChippiPageShell } from '@/components/chippi/chippi-page-shell';

export const dynamic = 'force-dynamic';

export default async function ChippiDraftsPage({
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

  return (
    <ChippiPageShell
      greeting="Drafts."
      title="What Chippi drafted for you"
      subtitle="Approve, edit, or skip — nothing leaves without your sign-off."
    >
      <AgentDraftInbox slug={slug} />
    </ChippiPageShell>
  );
}
