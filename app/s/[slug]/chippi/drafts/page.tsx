/**
 * /chippi/drafts — Chippi's outbox: messages prepared and ready to go,
 * pending the realtor's sign-off.
 *
 * The page LABEL is "Outbox" — "Drafts" was the wrong frame. Drafts =
 * work in progress, realtor as author. Outbox = finished work queued
 * for sign-off, Chippi as author. The route path stays /chippi/drafts
 * (URL rename has no upside; the visible nav + page chrome carry the
 * meaning).
 *
 * Hero + AgentDraftInbox. The /chippi/approvals route is separate: that's
 * the orchestrator's AgentTask paused-state queue, not the AgentDraft
 * outbox the realtor signs off on.
 *
 * /chippi/today shows a compact "X waiting → outbox" summary that links
 * here. This page is the dedicated queue.
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
      greeting="Outbox."
      title="Ready to go out"
      subtitle="I prepared these. Sign off when they're right."
    >
      <AgentDraftInbox slug={slug} />
    </ChippiPageShell>
  );
}
