/**
 * Pure composition logic for the /follow-ups narration line.
 *
 * Priority ladder (loudest first):
 *   1. Overdue                → doorway: switch to the Overdue tab.
 *   2. Today's load           → doorway: switch to the Today tab.
 *   3. Upcoming-only          → doorway: switch to the Upcoming tab.
 *   4. Defensive fallback     → no doorway.
 *
 * The line and the page share one decision: clicking the sentence switches
 * to the slice of follow-ups it's describing.
 *
 * Note: the empty-totals branch ("X on your list.") is defensively retained
 * but is unreachable in practice — every follow-up is overdue, today, or
 * upcoming, and the page wraps an empty-state guard above this code.
 */

export type FollowUpsTab = 'overdue' | 'today' | 'upcoming';

export interface FollowUpsNarrationOutput {
  text: string;
  targetTab: FollowUpsTab | null;
}

export interface FollowUpsTabCounts {
  overdue: number;
  today: number;
  upcoming: number;
}

export function composeFollowUpsNarration(
  tabCounts: FollowUpsTabCounts,
  totalCount: number = tabCounts.overdue + tabCounts.today + tabCounts.upcoming,
): FollowUpsNarrationOutput {
  if (tabCounts.overdue > 0) {
    return {
      text: tabCounts.overdue === 1
        ? '1 follow-up slipped past its date. Start there.'
        : `${tabCounts.overdue} follow-ups slipped past. Start with the oldest.`,
      targetTab: 'overdue',
    };
  }
  if (tabCounts.today > 0) {
    return {
      text: tabCounts.today === 1
        ? '1 follow-up due today.'
        : `${tabCounts.today} follow-ups due today.`,
      targetTab: 'today',
    };
  }
  if (tabCounts.upcoming > 0) {
    return {
      text: tabCounts.upcoming === 1
        ? '1 follow-up coming up. Quiet otherwise.'
        : `${tabCounts.upcoming} follow-ups coming up. Quiet otherwise.`,
      targetTab: 'upcoming',
    };
  }
  return { text: `${totalCount} on your list.`, targetTab: null };
}
