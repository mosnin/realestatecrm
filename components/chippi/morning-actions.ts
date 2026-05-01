/**
 * Pure derivation of the inline action panel for <MorningStory />.
 *
 * The home doorway used to teleport: tap the sentence, get yanked to a
 * detail page. That's the home behaving like a chooser. Real workspace
 * surfaces fire a verb: tap the sentence, the work surfaces underneath.
 *
 * This module only knows how to turn (doorway, summary, slug) into a list
 * of {label, kind, href} actions. The component renders them; the prefill
 * lands in the composer via `?prefill=...` on /s/{slug}/chippi.
 *
 * Two actions for people, three for deals. No config; the realtor doesn't
 * pick the menu — the menu picks itself from the sentence.
 */
import type { MorningSummary } from '@/app/api/agent/morning/route';
import type { MorningDoorway } from '@/lib/morning-story';

export type MorningActionKind = 'compose' | 'navigate';

export interface MorningAction {
  /** Stable id for keyed render + tests. */
  id: string;
  /** Verb-led label — "Send a check-in", not "Compose Email". */
  label: string;
  /** 'compose' opens the composer with prefill; 'navigate' goes to detail. */
  kind: MorningActionKind;
  /** Resolved href (workspace path or /s/{slug}/chippi?prefill=...). */
  href: string;
}

/**
 * The composer-prefill URL. The workspace listens for `?q=` to *send*; we
 * use `?prefill=` to populate the input but not auto-send — the realtor
 * still gets a beat to read and edit before they fire. A future phase
 * wires the workspace to consume this param.
 */
function prefillHref(slug: string, text: string): string {
  return `/s/${slug}/chippi?prefill=${encodeURIComponent(text)}`;
}

/**
 * Build the inline panel for a given doorway. The summary is needed to
 * fill in concrete subjects (the deal title, the person's name) — the
 * doorway alone only carries an id. When the doorway is null (drafts /
 * questions / closing-this-week / all-clear), the panel is empty and the
 * sentence stays non-interactive, exactly as it ships today.
 */
export function buildMorningActions(
  doorway: MorningDoorway | null,
  summary: MorningSummary,
  slug: string,
): MorningAction[] {
  if (!doorway) return [];

  if (doorway.kind === 'deal') {
    const stuck = summary.topStuckDeal;
    const title = stuck?.title ?? 'this';
    const days = stuck?.daysStuck ?? 0;
    return [
      {
        id: 'deal-checkin',
        label: 'Send a check-in',
        kind: 'compose',
        href: prefillHref(
          slug,
          `Draft a check-in email for the ${title} deal — it hasn't moved in ${days} days.`,
        ),
      },
      {
        id: 'deal-log-call',
        label: 'Log a call',
        kind: 'compose',
        href: prefillHref(
          slug,
          `I just called about the ${title} deal — log it.`,
        ),
      },
      {
        id: 'deal-open',
        label: 'Open the deal',
        kind: 'navigate',
        href: `/s/${slug}/deals/${doorway.id}`,
      },
    ];
  }

  // doorway.kind === 'person'. We pick the simpler menu — two buttons, no
  // sub-kind branching. The sentence itself has already named the person;
  // the verbs apply whether they're new, hot, or overdue.
  const person =
    summary.topOverdueFollowUp ??
    summary.topNewPerson ??
    summary.topHotPerson;
  const name = person?.name ?? 'them';
  return [
    {
      id: 'person-checkin',
      label: 'Send a check-in',
      kind: 'compose',
      href: prefillHref(slug, `Draft a check-in message to ${name}.`),
    },
    {
      id: 'person-open',
      label: 'Open the person',
      kind: 'navigate',
      href: `/s/${slug}/contacts/${doorway.id}`,
    },
  ];
}
