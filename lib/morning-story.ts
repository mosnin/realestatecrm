/**
 * Pure composition logic for the /chippi home story.
 *
 * Lives separately from <MorningStory /> so the brand voice can be
 * snapshot-tested without spinning up React. The home is the deepest
 * surface in the app — its sentence names a *subject*, not just a count.
 * "The Chen deal hasn't moved in 14 days" beats "1 deal is stuck"; same
 * data, real information.
 *
 * Doorway is multi-target: a stuck-deal sentence opens to that deal, an
 * overdue-follow-up sentence opens to that person. The doorway always
 * matches the subject of the sentence — no more single-target naive logic.
 */
import type { MorningSummary } from '@/app/api/agent/morning/route';

export type MorningDoorway =
  | { kind: 'person'; id: string }
  | { kind: 'deal'; id: string };

export interface MorningStoryOutput {
  text: string;
  doorway: MorningDoorway | null;
}

/**
 * Deal titles in the wild can be messy: "Smith — buyer, $700k Sunset Strip"
 * breaks the cadence of "The {title} deal hasn't moved...". When the title
 * has internal punctuation or runs long, fall back to a clean generic
 * subject. The doorway still opens the right deal.
 */
function isCleanDealTitle(title: string): boolean {
  if (title.length > 32) return false;
  if (/[—–\-,()|:;]/.test(title)) return false;
  return true;
}

/**
 * Compose one sentence from the summary. Priority order:
 *   1. Stuck deal — name the longest-stuck one.
 *   2. Overdue follow-up — name the most-overdue person.
 *   3. New person — name the most-recent arrival.
 *   4. Hot person — name the highest-scoring one.
 *   5. Drafts/questions — count only (focus card is right below).
 *   6. Closing this week — count only.
 *   7. All clear.
 *
 * The doorway always matches the subject of the sentence: the stuck-deal
 * sentence opens to that deal; the overdue-follow-up sentence opens to
 * that person; new + hot sentences open to that person.
 */
export function composeMorningStory(s: MorningSummary): MorningStoryOutput {
  if (s.topStuckDeal) {
    const { title, daysStuck, id } = s.topStuckDeal;
    const subject = isCleanDealTitle(title) ? `The ${title} deal` : 'A deal';
    const text = daysStuck > 0
      ? `${subject} hasn't moved in ${daysStuck} day${daysStuck === 1 ? '' : 's'}.`
      : `${subject} is stuck.`;
    return { text, doorway: { kind: 'deal', id } };
  }

  if (s.topOverdueFollowUp) {
    const { name, daysOverdue, id } = s.topOverdueFollowUp;
    const text = daysOverdue === 0
      ? `${name}'s follow-up is due today.`
      : daysOverdue === 1
        ? `${name}'s follow-up is 1 day overdue.`
        : `${name}'s follow-up is ${daysOverdue} days overdue.`;
    return { text, doorway: { kind: 'person', id } };
  }

  if (s.topNewPerson) {
    const { name, id } = s.topNewPerson;
    return {
      text: `${name} just applied. Welcome them.`,
      doorway: { kind: 'person', id },
    };
  }

  if (s.topHotPerson) {
    const { name, id } = s.topHotPerson;
    return {
      text: `${name}'s score is hot. Reach out.`,
      doorway: { kind: 'person', id },
    };
  }

  // Drafts + questions live in the FocusCard right below — sentence names
  // them, no doorway needed (the card is on the same screen).
  if (s.draftsCount > 0 || s.questionsCount > 0) {
    const parts: string[] = [];
    if (s.draftsCount > 0) parts.push(`${s.draftsCount} draft${s.draftsCount === 1 ? '' : 's'}`);
    if (s.questionsCount > 0) parts.push(`${s.questionsCount} question${s.questionsCount === 1 ? '' : 's'}`);
    return { text: `${parts.join(' · ')} waiting for you.`, doorway: null };
  }

  if (s.closingThisWeekCount > 0) {
    return {
      text: s.closingThisWeekCount === 1
        ? '1 deal closing this week. Keep it on track.'
        : `${s.closingThisWeekCount} deals closing this week. Keep them on track.`,
      doorway: null,
    };
  }

  return {
    text: "All clear. I'll surface anything that needs you.",
    doorway: null,
  };
}
