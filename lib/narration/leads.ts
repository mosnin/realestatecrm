/**
 * Pure composition logic for the /leads (People → Applications) narration.
 *
 * Server-rendered, so no doorway action — just a single sentence. The
 * sentence carries the brand-voice spine; the surrounding tier summary bar
 * is the visual layer.
 *
 * Priority ladder (loudest first):
 *   1. Unread arrivals (new-lead tag).
 *   2. Hot applications waiting.
 *   3. Steady caught-up state with a count.
 *   4. Empty workspace.
 */

export interface LeadsNarrationInput {
  /** Count of leads still carrying the 'new-lead' tag (unread arrivals). */
  unreadCount: number;
  /** Count of leads scored as 'hot'. */
  hotCount: number;
  /** Total leads (any score, any tag) on the application list. */
  totalCount: number;
}

export function composeLeadsNarration(input: LeadsNarrationInput): string {
  const { unreadCount, hotCount, totalCount } = input;

  if (unreadCount > 0) {
    return unreadCount === 1
      ? '1 new application since you last looked. Open it.'
      : `${unreadCount} new applications since you last looked. Open them.`;
  }
  if (hotCount > 0) {
    return hotCount === 1
      ? '1 hot application waiting. Reach out.'
      : `${hotCount} hot applications waiting. Reach out.`;
  }
  if (totalCount > 0) {
    return totalCount === 1
      ? 'Caught up. 1 application on the list.'
      : `Caught up. ${totalCount} applications on the list.`;
  }
  return 'No applications yet. Drop your intake link and start collecting.';
}
