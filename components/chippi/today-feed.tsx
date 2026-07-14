'use client';

import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { FirstTouchCard } from '@/components/leads/first-touch-card';
import { AgentDraftInbox } from '@/components/agent/agent-draft-inbox';
import { AgentQuestionsPanel } from '@/components/agent/agent-questions-panel';
import { AgentGoalsPanel } from '@/components/agent/agent-goals-panel';
import { TodayFocus } from './today-focus';
import { WhatIDid } from './what-i-did';
import { WhatsComing } from './whats-coming';
import { FocusCard } from './focus-card';

/**
 * The default surface — focus mode. One focal item at a time. The realtor
 * lands on /chippi and sees ONE thing waiting on them with Send / Edit /
 * Hold for later. When that's done, the next one slides in. When the queue
 * clears, a calm acknowledgement.
 *
 * "Show full day →" expands into the dispatch console (Drafts I made /
 * Questions I have / Who to reach today / What's coming / What I did)
 * for power users who want the dashboard view. The toggle is local state;
 * focus mode is the default every time.
 *
 * The realtor signal said simplicity wins. This is more simplicity — five
 * sections to one card. The dashboard view stays one tap away, but the
 * default is the assistant, not the dashboard.
 */
export function TodayFeed({
  slug,
  isFresh = false,
  firstName,
  onTellMeAboutLead,
}: {
  slug: string;
  /** True when the realtor has done nothing yet — triggers day-one welcome. */
  isFresh?: boolean;
  firstName?: string;
  onTellMeAboutLead?: (prefill: string) => void;
}) {
  const [showFull, setShowFull] = useState(false);

  // Instant First Touch spotlight — a brand-new lead with a ready-to-review
  // intro draft outranks everything else on the surface (speed-to-lead).
  // Sourced client-side from /api/leads/first-touch, the same fetch pattern
  // the focus card uses for its draft/question queues; renders nothing when
  // no first-touch draft is pending. Mounted once, above BOTH views.
  return (
    <div className="space-y-8">
      <FirstTouchCard slug={slug} />
      {showFull ? (
        <div className="space-y-12">
          <button
            type="button"
            onClick={() => setShowFull(false)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={12} />
            Back to focus
          </button>
          <AgentDraftInbox slug={slug} />
          <AgentQuestionsPanel />
          <TodayFocus slug={slug} />
          <WhatsComing slug={slug} />
          <WhatIDid slug={slug} />
          <AgentGoalsPanel />
        </div>
      ) : (
        <FocusCard
          slug={slug}
          onShowFullDay={() => setShowFull(true)}
          isFresh={isFresh}
          firstName={firstName}
          onTellMeAboutLead={onTellMeAboutLead}
        />
      )}
    </div>
  );
}
