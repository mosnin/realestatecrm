/**
 * /chippi/today — the full-day dashboard.
 *
 * Six surfaces stacked top-to-bottom: morning story (Chippi's voice for
 * the day), drafts summary (linking out to /chippi/drafts), questions,
 * today's focus, what's coming, what Chippi did, active goals. The chat
 * root is the entry; this is where the realtor lands when they want the
 * whole picture.
 *
 * The full AgentDraftInbox UI used to live here, but it dominated the
 * page and duplicated /chippi/drafts. Now /today summarises ("3 drafts
 * waiting → review"); /drafts contains them. Each surface does one thing.
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { MorningStory } from '@/components/chippi/morning-story';
import { AgentQuestionsPanel } from '@/components/agent/agent-questions-panel';
import { AgentGoalsPanel } from '@/components/agent/agent-goals-panel';
import { TodayFocus } from '@/components/chippi/today-focus';
import { WhatsComing } from '@/components/chippi/whats-coming';
import { WhatIDid } from '@/components/chippi/what-i-did';
import { ChippiPageShell } from '@/components/chippi/chippi-page-shell';

export const dynamic = 'force-dynamic';

export default async function ChippiTodayPage({
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

  // Pending-drafts count for the compact summary card below MorningStory.
  // head:true skips the row payload — we only need the number.
  const { count: pendingDraftCount } = await supabase
    .from('AgentDraft')
    .select('*', { count: 'exact', head: true })
    .eq('spaceId', space.id)
    .eq('status', 'pending');

  const draftCount = pendingDraftCount ?? 0;

  return (
    <ChippiPageShell
      greeting="Full day."
      title="Your day at a glance"
      subtitle="The morning story, your drafts, what's coming next — one scroll."
    >
      <MorningStory slug={slug} />

      {/* Drafts pointer — calm caption callout. MorningStory above owns the
          focal moment; this is quiet secondary info, sized like CAPTION so it
          never competes with the H1 or the story headline. */}
      {draftCount > 0 && (
        <Link
          href={`/s/${slug}/chippi/drafts`}
          className="group inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="tabular-nums">{draftCount}</span>
          <span>
            {draftCount === 1 ? 'draft waiting for your review' : 'drafts waiting for your review'}
          </span>
          <ChevronRight size={11} className="opacity-60 group-hover:opacity-100 transition-opacity" />
        </Link>
      )}

      <AgentQuestionsPanel />
      <TodayFocus slug={slug} />
      <WhatsComing slug={slug} />
      <WhatIDid slug={slug} />
      <AgentGoalsPanel />
    </ChippiPageShell>
  );
}
