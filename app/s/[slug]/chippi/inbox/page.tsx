/**
 * /chippi/inbox — explicit message drafts the user asked Chippi to compose.
 *
 * Work actions execute from the conversation and never enter this page for
 * human approval. The surface remains for the distinct, explicit request
 * "draft this for me". Legacy bookmarks still redirect here, but paused
 * AgentTask approvals are intentionally not shown.
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { BODY_MUTED } from '@/lib/typography';
import { AgentDraftInbox } from '@/components/agent/agent-draft-inbox';
import { ChippiPageShell } from '@/components/chippi/chippi-page-shell';

export const dynamic = 'force-dynamic';

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ChippiInboxPage({
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

  // Just the count — AgentDraftInbox fetches the actual draft data
  // client-side, the same way it does on every other page that mounts it.
  const { count: pendingDraftCount } = await supabase
    .from('AgentDraft')
    .select('*', { count: 'exact', head: true })
    .eq('spaceId', space.id)
    .eq('status', 'pending');

  const draftCount = pendingDraftCount ?? 0;
  const hasDrafts = draftCount > 0;

  return (
    <ChippiPageShell
      greeting="Inbox."
      title={draftCount === 0 ? 'No drafts.' : `${draftCount} ${draftCount === 1 ? 'draft' : 'drafts'} ready.`}
    >
      <section data-chippi-secondary-page="inbox">
        {!hasDrafts ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-base text-foreground">You&apos;re all caught up.</p>
            <p className={cn(BODY_MUTED, 'mt-1.5 max-w-xs')}>
              Drafts you explicitly ask Chippi to prepare will appear here.
            </p>
          </div>
        ) : (
          <AgentDraftInbox slug={slug} />
        )}
      </section>
    </ChippiPageShell>
  );
}
