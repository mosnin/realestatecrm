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
    const others = s.stuckDealsCount > 1
      ? ` (${s.stuckDealsCount - 1} more stuck.)`
      : '';
    const text = daysStuck > 0
      ? `The ${title} deal hasn't moved in ${daysStuck} day${daysStuck === 1 ? '' : 's'}.${others}`
      : `The ${title} deal is stuck.${others}`;
    return { text, doorway: { kind: 'deal', id } };
  }

  if (s.topOverdueFollowUp) {
    const { name, daysOverdue, id } = s.topOverdueFollowUp;
    const others = s.overdueFollowUpsCount > 1
      ? ` (${s.overdueFollowUpsCount - 1} more overdue.)`
      : '';
    const text = daysOverdue === 0
      ? `${name}'s follow-up is due today.${others}`
      : daysOverdue === 1
        ? `${name}'s follow-up is 1 day overdue.${others}`
        : `${name}'s follow-up is ${daysOverdue} days overdue.${others}`;
    return { text, doorway: { kind: 'person', id } };
  }

  if (s.topNewPerson) {
    const { name, id } = s.topNewPerson;
    const others = s.newPeopleCount > 1
      ? ` (${s.newPeopleCount - 1} more new.)`
      : '';
    return {
      text: `${name} just applied. Welcome them.${others}`,
      doorway: { kind: 'person', id },
    };
  }

  if (s.topHotPerson) {
    const { name, id } = s.topHotPerson;
    const others = s.hotPeopleCount > 1
      ? ` (${s.hotPeopleCount - 1} more hot.)`
      : '';
    return {
      text: `${name}'s looking hot. Reach out.${others}`,
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
