'use server';

/**
 * /chippi/today — the full-day dashboard.
 *
 * Holds the agentic surfaces that used to clutter the /chippi root: the
 * morning sentence, draft inbox, today's focus, what's coming, what I did,
 * pending questions, active goals. The chat root is now a clean chat-first
 * entry (centered greeting + composer); the realtor lands here when they
 * want to see what Chippi has been working on.
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { MorningStory } from '@/components/chippi/morning-story';
import { AgentDraftInbox } from '@/components/agent/agent-draft-inbox';
import { AgentQuestionsPanel } from '@/components/agent/agent-questions-panel';
import { AgentGoalsPanel } from '@/components/agent/agent-goals-panel';
import { TodayFocus } from '@/components/chippi/today-focus';
import { WhatsComing } from '@/components/chippi/whats-coming';
import { WhatIDid } from '@/components/chippi/what-i-did';

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

  return (
    <div className="h-full overflow-y-auto">
      <div className="w-full max-w-3xl mx-auto chat-content-wrap pt-10 sm:pt-14 pb-24 space-y-10 sm:space-y-12">
        <MorningStory slug={slug} />
        <AgentDraftInbox slug={slug} />
        <AgentQuestionsPanel />
        <TodayFocus slug={slug} />
        <WhatsComing slug={slug} />
        <WhatIDid slug={slug} />
        <AgentGoalsPanel />
      </div>
    </div>
  );
}
