'use server';

/**
 * /chippi/drafts — pending drafts the realtor needs to review.
 *
 * Wraps the existing AgentDraftInbox in a dedicated page so it's reachable
 * from the Chippi nav-dropdown without being buried inside the full-day
 * dashboard. (The /chippi/approvals route is separate — that's the
 * AgentTask paused-state queue from the orchestrator, not the AgentDraft
 * inbox the realtor approves and sends.)
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { AgentDraftInbox } from '@/components/agent/agent-draft-inbox';

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
    <div className="h-full overflow-y-auto">
      <div className="w-full max-w-3xl mx-auto chat-content-wrap pt-10 sm:pt-14 pb-24">
        <AgentDraftInbox slug={slug} />
      </div>
    </div>
  );
}
