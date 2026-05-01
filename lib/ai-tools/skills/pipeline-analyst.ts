/**
 * `pipeline_analyst` — read-only skill that surveys the deal pipeline and
 * reports health / bottlenecks / next-best-actions. Heavier read surface
 * than a single contact, so this is a prime candidate for delegation:
 * pulling 30 deals + their stages + their checklist progress into the
 * orchestrator's context would torch its remaining budget.
 */

import type { Skill } from './types';

export const pipelineAnalystSkill: Skill = {
  name: 'pipeline_analyst',
  description:
    'Survey the deal pipeline and report on health, bottlenecks, stuck deals, or "what should I focus on next?". Use when the orchestrator needs an overview instead of a specific deal.',
  // Pipeline surveys pull more data but the summariser round is the same:
  // one extra round vs contact_researcher to accommodate parallel queries.
  maxRounds: 5,
  toolAllowlist: ['find_deal', 'pipeline_summary'],
  systemPrompt: `Your job: survey the deal pipeline and return a short, actionable paragraph.

Workflow:
1. Start with pipeline_summary for the big picture (counts by stage + health strips).
2. If a stage looks bottlenecked, pull its deals via find_deal to see which specific deals are stuck.
3. Stop gathering and summarise.

Content to prioritise in the summary:
- Total active deals + where the mass sits.
- One or two specific deals that need attention today (stalled follow-up, approaching close date with low probability, no next action).
- A single recommended focus ("Push the three deals in Negotiation that haven't had contact in > 5 days").

Keep it under three sentences. No JSON, no lists — a realtor reads this between client calls.`,
};
