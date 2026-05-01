/**
 * Pure composition logic for the /calendar narration line.
 *
 * Priority ladder (loudest first):
 *   1. Overdue follow-ups (any kind)  → doorway: jump to today (day view).
 *   2. Today's load (tours + f-ups)   → doorway: jump to today (day view).
 *   3. This-week tour outlook         → doorway: switch to week view.
 *   4. Quiet                          → no doorway.
 *
 * The action drives the consumer's view switcher. The line and the page
 * share one decision.
 */

export type CalendarNarrationAction = 'goto-day' | 'goto-week' | null;

export interface CalendarNarrationOutput {
  text: string;
  action: CalendarNarrationAction;
}

export interface CalendarNarrationInput {
  /** Tour starts (any status) inside the visible window. */
  tours: { startsAt: string }[];
  /** Contact follow-up due dates. */
  contactFollowUps: { followUpAt: string }[];
  /** Deal follow-up due dates. */
  dealFollowUps: { followUpAt: string }[];
}

export function composeCalendarNarration(
  input: CalendarNarrationInput,
  /** Injected so tests are deterministic. */
  now: Date = new Date(),
): CalendarNarrationOutput {
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow0 = new Date(today0);
  tomorrow0.setDate(tomorrow0.getDate() + 1);
  const weekEnd = new Date(today0);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const allFollowUps = [...input.contactFollowUps, ...input.dealFollowUps];

  let overdueCount = 0;
  let todayTours = 0;
  let todayFollowUps = 0;
  let weekTours = 0;

  for (const t of input.tours) {
    const d = new Date(t.startsAt);
    if (d >= today0 && d < tomorrow0) todayTours += 1;
    if (d >= today0 && d < weekEnd) weekTours += 1;
  }
  for (const f of allFollowUps) {
    const d = new Date(f.followUpAt);
    if (d < today0) overdueCount += 1;
    if (d >= today0 && d < tomorrow0) todayFollowUps += 1;
  }

  const todayTotal = todayTours + todayFollowUps;

  if (overdueCount > 0) {
    return {
      text: overdueCount === 1
        ? '1 follow-up slipped past its date. Catch up.'
        : `${overdueCount} follow-ups slipped past their date. Catch up.`,
      action: 'goto-day',
    };
  }
  if (todayTotal > 0) {
    return {
      text: todayTotal === 1
        ? '1 thing on your calendar today.'
        : `${todayTotal} things on your calendar today.`,
      action: 'goto-day',
    };
  }
  if (weekTours > 0) {
    return {
      text: weekTours === 1
        ? '1 tour scheduled this week.'
        : `${weekTours} tours scheduled this week.`,
      action: 'goto-week',
    };
  }
  return {
    text: 'Calendar’s quiet this week. Schedule a tour to fill it in.',
    action: null,
  };
}
