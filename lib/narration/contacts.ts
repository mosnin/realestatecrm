/**
 * Pure composition logic for the /contacts narration line.
 *
 * Lives separately from <ContactTable /> so the brand voice can be
 * snapshot-tested without spinning up React. Priority ladder (loudest first):
 *   1. New people just arrived  → doorway: filter to the New chip.
 *   2. Overdue follow-ups       → doorway: sort by agent priority.
 *   3. Hot people unworked      → doorway: sort by agent priority.
 *   4. Empty roster             → no doorway.
 *   5. Steady-state count       → no doorway.
 *
 * The action drives a click handler in the consumer; the narration line is
 * a doorway, not a label.
 */
import { HOT_LEAD_THRESHOLD } from '@/lib/constants';

export type ContactsNarrationAction = 'filter-new' | 'sort-priority' | null;

export interface ContactsNarrationOutput {
  text: string;
  action: ContactsNarrationAction;
}

/**
 * Minimum shape needed to compose the sentence. The full Contact row carries
 * dozens of fields; the narration only reads three.
 */
export interface ContactsNarrationInput {
  tags: string[];
  followUpAt: string | null;
  leadScore: number | null;
}

export function composeContactsNarration(
  contacts: ContactsNarrationInput[],
  /** Injected so tests are deterministic across midnight rollovers. */
  now: Date = new Date(),
): ContactsNarrationOutput {
  const newCount = contacts.filter((c) => c.tags.includes('new-lead')).length;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const overdueCount = contacts.filter(
    (c) => c.followUpAt && new Date(c.followUpAt) < today,
  ).length;
  const hotCount = contacts.filter(
    (c) => (c.leadScore ?? 0) >= HOT_LEAD_THRESHOLD,
  ).length;

  if (newCount > 0) {
    return {
      text: newCount === 1
        ? '1 new person came in. Welcome them.'
        : `${newCount} new people came in. Welcome them.`,
      action: 'filter-new',
    };
  }
  if (overdueCount > 0) {
    return {
      text: overdueCount === 1
        ? '1 follow-up is overdue. Catch up.'
        : `${overdueCount} follow-ups are overdue. Catch up.`,
      action: 'sort-priority',
    };
  }
  if (hotCount > 0) {
    return {
      text: hotCount === 1
        ? '1 person is hot. Reach out.'
        : `${hotCount} people are hot. Reach out.`,
      action: 'sort-priority',
    };
  }
  if (contacts.length === 0) {
    return {
      text: 'No people yet. Drop your intake link and start collecting.',
      action: null,
    };
  }
  return {
    text: contacts.length === 1
      ? '1 person on your roster. Quietly active.'
      : `${contacts.length} people on your roster. Quietly active.`,
    action: null,
  };
}
