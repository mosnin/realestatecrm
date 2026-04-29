'use client';

import { AgentDraftInbox } from '@/components/agent/agent-draft-inbox';
import { AgentQuestionsPanel } from '@/components/agent/agent-questions-panel';
import { AgentGoalsPanel } from '@/components/agent/agent-goals-panel';

/**
 * The "Today" surface — what's waiting on the user right now. Composes the
 * draft inbox, pending questions, and active goals into a single feed with
 * consistent typography. Each child self-fetches and self-empty-states; the
 * questions panel hides itself entirely when there's nothing pending so the
 * page stays calm on a quiet day.
 */
export function TodayFeed({ slug }: { slug: string }) {
  return (
    <div className="space-y-12">
      <AgentDraftInbox slug={slug} />
      <AgentQuestionsPanel />
      <AgentGoalsPanel />
    </div>
  );
}
