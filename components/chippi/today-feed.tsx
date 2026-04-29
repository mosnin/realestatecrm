'use client';

import { AgentDraftInbox } from '@/components/agent/agent-draft-inbox';
import { AgentQuestionsPanel } from '@/components/agent/agent-questions-panel';
import { AgentGoalsPanel } from '@/components/agent/agent-goals-panel';
import { TodayFocus } from './today-focus';

/**
 * The "Today" surface — what's waiting on the user right now, ordered by
 * what a realtor actually needs first thing in the morning:
 *   1. For your review  — drafts to send, questions Chippi has
 *   2. Today's focus    — Chippi's curated list of who to reach out to
 *   3. Outstanding      — goals + multi-step objectives in flight
 *
 * Each child self-fetches and self-empty-states. Sections that have nothing
 * to show hide themselves entirely so quiet days stay calm.
 */
export function TodayFeed({ slug }: { slug: string }) {
  return (
    <div className="space-y-12">
      <AgentDraftInbox slug={slug} />
      <AgentQuestionsPanel />
      <TodayFocus slug={slug} />
      <AgentGoalsPanel />
    </div>
  );
}
