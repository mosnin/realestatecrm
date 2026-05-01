/**
 * `contact_researcher` — read-only skill that digs up context on a specific
 * person and returns a concise "here's what I know about them" paragraph.
 *
 * Why delegate this instead of letting the orchestrator do it inline?
 * Context rot. A rich `find_person` payload plus their deal history can run
 * to hundreds of tokens. Delegating means the orchestrator only sees the
 * paragraph summary; the raw profile never crosses the boundary.
 */

import type { Skill } from './types';

export const contactResearcherSkill: Skill = {
  name: 'contact_researcher',
  description:
    'Summarise what we know about a specific person (status, recent activity, linked deals, notes). Use when the orchestrator needs background before composing an email, scheduling a tour, or answering a "tell me about X" question.',
  // 3 rounds is plenty: (1) find_person resolves to a rich single payload,
  // (2) optional find_deal for deal history, (3) summary round.
  maxRounds: 3,
  toolAllowlist: ['find_person', 'find_deal'],
  systemPrompt: `Your job: return a short, realtor-friendly paragraph about one person.

Workflow:
1. Call find_person with the name (or whatever handle the orchestrator gave). A single match returns a rich payload — score, recency, active deals — with no follow-up needed.
2. If that payload mentions active deals and the request needs deal context, call find_deal to look those up. Otherwise stop.
3. Summarise. Do not dump raw fields — synthesise.

Content to include in the summary when available:
- Name, status (qualification / tour / application), follow-up date if set.
- Most recent contact / tour / activity.
- One-line read on their pipeline state (e.g., "in the middle of a tour cycle, no open deals").
- Anything that would affect an outbound message (snoozed, no email on file, opted out).

Never include: raw JSON, IDs, full note bodies. If you can't find the person, say so in one sentence.`,
};
