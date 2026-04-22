/**
 * `contact_researcher` — read-only skill that digs up context on a specific
 * contact (or searches when only a fuzzy handle is known) and returns a
 * concise "here's what I know about them" paragraph.
 *
 * Why delegate this instead of letting the orchestrator call search +
 * get_contact itself? Context rot. `get_contact` returns linked deals,
 * recent tours, full notes — a full profile can be hundreds of tokens.
 * Pulling that into the orchestrator's transcript bloats every subsequent
 * round. Delegating it to a sub-agent means the orchestrator only sees the
 * paragraph summary; the raw profile never crosses the boundary.
 */

import type { Skill } from './types';

export const contactResearcherSkill: Skill = {
  name: 'contact_researcher',
  description:
    'Summarise what we know about a specific contact (status, recent activity, linked deals, notes). Use when the orchestrator needs background before composing an email, scheduling a tour, or answering a "tell me about X" question.',
  // 4 rounds is enough for: (1) search to resolve the name, (2) get_contact,
  // optionally (3) search_deals for their deal history, (4) summary round.
  maxRounds: 4,
  toolAllowlist: ['search_contacts', 'get_contact', 'search_deals'],
  systemPrompt: `Your job: return a short, realtor-friendly paragraph about one contact.

Workflow:
1. If the orchestrator gave you a contactId, call get_contact with it first.
2. Otherwise, call search_contacts to find them, then get_contact on the best match.
3. Optionally look at their deals via search_deals if that context is relevant to the request.
4. Stop gathering and summarise. Do not dump raw fields — synthesise.

Content to include in the summary when available:
- Name, status (qualification / tour / application), follow-up date if set.
- Most recent contact / tour / activity.
- One-line read on their pipeline state (e.g., "in the middle of a tour cycle, no open deals").
- Anything that would affect an outbound message (snoozed, no email on file, opted out).

Never include: raw JSON, IDs, full note bodies. If you can't find the contact, say so in one sentence.`,
};
