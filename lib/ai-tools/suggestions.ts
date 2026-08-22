/**
 * Suggested follow-up actions — the two-chip row that appears after an
 * assistant turn. Curated by the last tool name, then grounded in the
 * first person / deal / property the tool actually returned.
 *
 * Design intent (Jobs): the chips remove a typing step for the realtor's
 * next move. Each chip is the ENTIRE next prompt — clicking it fires the
 * exact text as the user's next message. So the labels are written as
 * the realtor would say them, not as commands.
 */

import type { MessageBlock, ToolCallBlock } from './blocks';

/** Shown when no tools fired (pure-chat turn) or on conversation start. */
const DEFAULT_SUGGESTIONS = [
  "Show today's pipeline",
  'Find hot leads',
  'Plan my day',
];

/**
 * Pick suggestions for the latest assistant turn. Reads the last tool call
 * by position and returns its curated set. Returns an empty array when the
 * turn shouldn't show any (e.g. errored). Capped to two chips.
 */
export function getSuggestionsForTurn(blocks: MessageBlock[] | null | undefined): string[] {
  if (!blocks || blocks.length === 0) return DEFAULT_SUGGESTIONS.slice(0, 2);
  // Walk backwards for the last *completed* tool call. Errors / denials don't
  // produce a useful next-action context — fall back to the default set.
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    if (b.type !== 'tool_call') continue;
    const tc = b as ToolCallBlock;
    if (tc.status !== 'complete') continue;
    const set = suggestionsForTool(tc);
    if (set) return set.slice(0, 2);
    return DEFAULT_SUGGESTIONS.slice(0, 2);
  }
  return DEFAULT_SUGGESTIONS.slice(0, 2);
}

export function suggestionsForTool(tc: Pick<ToolCallBlock, 'name' | 'result'>): string[] | null {
  const subject = extractGroundedSubject(tc.result?.data);
  switch (tc.name) {
    case 'search_contacts':
    case 'get_contact':
    case 'find_person':
    case 'find_quiet_hot_persons':
    case 'research_person':
      return subject
        ? [`Text ${subject}`, `Show ${subject}'s deals`]
        : ['Draft a follow-up email', 'Show their deals'];
    case 'search_deals':
    case 'pipeline_summary':
    case 'find_stuck_deals':
    case 'analyze_pipeline':
      return subject
        ? [`What's stuck on ${subject}?`, 'Find overdue follow-ups']
        : ['Show stuck deals', 'Find overdue follow-ups'];
    case 'find_overdue_followups':
      return subject
        ? [`Draft a reminder for ${subject}`, 'Show pipeline']
        : ['Draft reminders for these', 'Show pipeline'];
    case 'search_properties':
    case 'find_property':
    case 'add_property':
      return subject
        ? [`Schedule a tour at ${subject}`, 'Find similar properties']
        : ['Schedule a tour here', 'Find similar properties'];
    case 'schedule_tour':
    case 'reschedule_tour':
      return ['Send a confirmation', 'Add follow-up reminder'];
    case 'check_availability':
      return ['Schedule a tour', 'Send these times to the lead'];
    case 'find_tours':
      return ['Send a reminder', "Show today's calendar"];
    case 'send_email':
    case 'send_sms':
      return ['Schedule a follow-up', 'Draft another'];
    case 'draft_email':
      return ['Send it', 'Adjust the tone'];
    case 'draft_sms':
      return ['Send it', 'Shorten it'];
    case 'recall_history':
      return subject
        ? [`Summarize what we know about ${subject}`, 'Draft the next message']
        : ['Summarize what we know', 'Draft the next message'];
    case 'create_plan':
    case 'planner':
      return ['Start with step 1', 'Adjust the plan'];
    default:
      return null;
  }
}

export function extractGroundedSubject(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const rec = data as Record<string, unknown>;

  const person = firstNamed(rec.contacts, 'person')
    ?? firstNamed(rec.people, 'person')
    ?? firstNamedRecord(rec.contact, 'person')
    ?? firstNamedRecord(rec.person, 'person');
  if (person) return person;

  const thing = firstNamed(rec.deals, 'thing')
    ?? firstNamed(rec.properties, 'thing')
    ?? firstNamed(rec.tours, 'thing')
    ?? firstNamedRecord(rec.deal, 'thing')
    ?? firstNamedRecord(rec.property, 'thing')
    ?? firstNamedRecord(rec.match, 'thing');
  if (thing) return thing;

  return null;
}

function firstNamed(list: unknown, kind: 'person' | 'thing'): string | null {
  if (!Array.isArray(list) || list.length === 0) return null;
  return firstNamedRecord(list[0], kind);
}

function firstNamedRecord(value: unknown, kind: 'person' | 'thing'): string | null {
  if (!value || typeof value !== 'object') return null;
  const rec = value as Record<string, unknown>;
  const raw = [rec.name, rec.title, rec.address, rec.propertyAddress].find(
    (item): item is string => typeof item === 'string' && item.trim().length > 0,
  );
  if (!raw) return null;
  return shortenSubject(raw, kind);
}

function shortenSubject(raw: string, kind: 'person' | 'thing'): string {
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  if (!trimmed) return trimmed;
  if (kind === 'person') {
    const firstWord = trimmed.split(' ')[0] ?? trimmed;
    return firstWord.length >= 2 ? firstWord : trimmed.slice(0, 32);
  }
  return trimmed.length > 36 ? `${trimmed.slice(0, 33)}…` : trimmed;
}
