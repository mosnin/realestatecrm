'use client';

import { AgentDraftInbox } from '@/components/agent/agent-draft-inbox';
import { AgentQuestionsPanel } from '@/components/agent/agent-questions-panel';
import { AgentGoalsPanel } from '@/components/agent/agent-goals-panel';
import { TodayFocus } from './today-focus';
import { WhatIDid } from './what-i-did';
import { WhatsComing } from './whats-coming';

/**
 * The dispatch console — Chippi's morning briefing. Six peer sections in
 * narrative order, the way a realtor scans their morning:
 *
 *   1. What I did       — proof of work; what Chippi handled overnight
 *   2. Drafts           — outreach Chippi staged, awaiting your tap
 *   3. Needs your input — judgment calls Chippi paused on
 *   4. Today's focus    — Chippi's curated picks of who to reach today
 *   5. What's coming    — tours scheduled, follow-ups due
 *   6. Goals            — multi-step objectives in flight
 *
 * Each child self-fetches and self-empty-states; sections that have
 * nothing to show hide themselves entirely so quiet days stay calm.
 * Read top-to-bottom this is a small story Chippi tells you each morning.
 */
export function TodayFeed({ slug }: { slug: string }) {
  return (
    <div className="space-y-12">
      <WhatIDid slug={slug} />
      <AgentDraftInbox slug={slug} />
      <AgentQuestionsPanel />
      <TodayFocus slug={slug} />
      <WhatsComing slug={slug} />
      <AgentGoalsPanel />
    </div>
  );
}
