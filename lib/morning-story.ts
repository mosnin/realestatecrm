/**
 * Pure composition logic for the /chippi home story.
 *
 * Lives separately from <MorningStory /> so the brand voice can be
 * snapshot-tested without spinning up React. Five hand-coded narration
 * ladders ship to users; this is the one we put under test first because
 * it composes ACROSS the realtor's whole desk and is therefore the
 * loudest single thing Chippi says.
 */
import type { MorningSummary } from '@/app/api/agent/morning/route';

export interface MorningDoorway {
  kind: 'person';
  id: string;
}

export interface MorningStoryOutput {
  text: string;
  doorway: MorningDoorway | null;
}

/**
 * Compose the loudest single sentence from the summary. Priority order:
 *   1. Stuck deals (the ones that won't fix themselves)
 *   2. Overdue follow-ups (the realtor said they'd do something)
 *   3. New people (just-arrived applications)
 *   4. Hot people (warmest of the warm)
 *   5. Drafts/questions waiting in the focus queue
 *   6. Closing this week
 *   7. All clear
 *
 * When a topPerson is available we attach it as "Start with X." — the
 * narration becomes a doorway to that specific person.
 */
export function composeMorningStory(s: MorningSummary): MorningStoryOutput {
  const startWith = s.topPersonName && s.topPersonId
    ? ` Start with ${s.topPersonName}.`
    : '';
  const doorway: MorningDoorway | null = s.topPersonId
    ? { kind: 'person', id: s.topPersonId }
    : null;

  if (s.stuckDealsCount > 0) {
    const lead = s.stuckDealsCount === 1
      ? '1 deal is stuck'
      : `${s.stuckDealsCount} deals are stuck`;
    if (s.overdueFollowUpsCount > 0 || s.newPeopleCount > 0) {
      const extras: string[] = [];
      if (s.overdueFollowUpsCount > 0) {
        extras.push(`${s.overdueFollowUpsCount} follow-up${s.overdueFollowUpsCount === 1 ? '' : 's'} overdue`);
      }
      if (s.newPeopleCount > 0) {
        extras.push(
          s.newPeopleCount === 1
            ? '1 new person'
            : `${s.newPeopleCount} new people`,
        );
      }
      return { text: `${lead}, ${extras.join(', ')}.${startWith}`, doorway };
    }
    return { text: `${lead}.${startWith}`, doorway };
  }

  if (s.overdueFollowUpsCount > 0) {
    const lead = s.overdueFollowUpsCount === 1
      ? '1 follow-up is overdue'
      : `${s.overdueFollowUpsCount} follow-ups are overdue`;
    if (s.newPeopleCount > 0) {
      const np = s.newPeopleCount === 1
        ? '1 new person came in'
        : `${s.newPeopleCount} new people came in`;
      return { text: `${lead}, ${np}.${startWith}`, doorway };
    }
    return { text: `${lead}.${startWith}`, doorway };
  }

  if (s.newPeopleCount > 0) {
    const lead = s.newPeopleCount === 1
      ? '1 new person came in. Welcome them.'
      : `${s.newPeopleCount} new people came in. Welcome them.`;
    return { text: lead, doorway };
  }

  if (s.hotPeopleCount > 0) {
    const lead = s.hotPeopleCount === 1
      ? '1 person is hot.'
      : `${s.hotPeopleCount} people are hot.`;
    return { text: `${lead}${startWith || ' Reach out.'}`, doorway };
  }

  // Drafts + questions live as a focus card below — the sentence names them
  // but doesn't carry a doorway, since the card is right there on the same
  // screen.
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
