'use client';

import { AgentDraftInbox } from '@/components/agent/agent-draft-inbox';
import { AgentQuestionsPanel } from '@/components/agent/agent-questions-panel';
import { TodayFocus } from './today-focus';
import { WhatIDid } from './what-i-did';
import { WhatsComing } from './whats-coming';

/**
 * The dispatch console — Chippi's morning briefing. Sections are ordered the
 * way a realtor scans their morning: urgent decisions first, today's
 * activity middle, agent's proof-of-work last.
 *
 *   1. Drafts I made    — outreach to send right now
 *   2. Questions I have — judgment calls Chippi paused on
 *   3. Who to reach today — Chippi's curated picks for outreach
 *   4. What's coming    — tours scheduled + follow-ups due
 *   5. What I did       — proof of work; what Chippi handled overnight
 *
 * Each child self-fetches and self-empty-states; sections that have nothing
 * to show hide themselves entirely so quiet days stay calm. Goals are no
 * longer surfaced here — the route stays alive for deep-links but the
 * concept is a CRM primitive, not a realtor primitive.
 */
export function TodayFeed({ slug }: { slug: string }) {
  return (
    <div className="space-y-12">
      <AgentDraftInbox slug={slug} />
      <AgentQuestionsPanel />
      <TodayFocus slug={slug} />
      <WhatsComing slug={slug} />
      <WhatIDid slug={slug} />
    </div>
  );
}
