/**
 * composeChippiOpener — Chippi's first words on the empty workspace, in HER
 * OWN voice.
 *
 * The first version of the opener reused the morning "story" ladder, which
 * writes third-person status lines ("Priya's follow-up is 3 days overdue").
 * That reads like a notification, not a teammate. This composes the same
 * morning signal as CHIPPI SPEAKING: first person, present, proof that she's
 * already been working ("I drafted 3 replies in your voice"), ending in an
 * offer. The greeting + name live in the hero headline above, so this is the
 * substance clause that continues Chippi's sentence.
 *
 * Pure + deterministic so the voice is unit-tested, not hoped for: every line
 * is first person, names a real subject when there is one, and never uses an
 * em dash (the house rule).
 */

import type { MorningResponse } from '@/app/api/agent/morning/route';

export interface OpenerChip {
  label: string;
  /** The exact message sent when the chip is tapped. */
  prompt: string;
}

export interface ChippiOpener {
  /** Chippi's first-person line. Null only if something went very wrong. */
  line: string;
  chips: OpenerChip[];
  /** True for an empty/just-started workspace (changes the chip set). */
  coldStart: boolean;
}

function firstNameOf(name: string): string {
  return (name || '').trim().split(/\s+/)[0] || name;
}

function cap(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Deal titles in the wild are messy; only speak the clean ones by name. */
function cleanDealTitle(title: string): boolean {
  return title.length <= 32 && !/[—–\-,()|:;]/.test(title);
}

interface Signal {
  /** Lowercase-startable clause so two can be joined with ", and ". */
  clause: string;
  /** The tailored offer that closes the line. */
  offer: string;
  chip: OpenerChip;
}

function buildSignals(s: MorningResponse): Signal[] {
  const out: Signal[] = [];

  if (s.draftsCount > 0) {
    const n = s.draftsCount;
    out.push({
      clause: `I drafted ${n} ${n === 1 ? 'reply' : 'replies'} in your voice while you were out`,
      offer: 'Want to look?',
      chip: {
        label: `Review ${n} draft${n === 1 ? '' : 's'}`,
        prompt: 'Show me the drafts that are ready and walk me through them.',
      },
    });
  }

  if (s.overdueFollowUpsCount > 0) {
    const top = s.topOverdueFollowUp;
    const clause = top
      ? top.daysOverdue <= 0
        ? `${top.name}'s follow-up is due today`
        : `${top.name}'s follow-up is ${top.daysOverdue} ${top.daysOverdue === 1 ? 'day' : 'days'} late`
      : `${s.overdueFollowUpsCount} follow-up${s.overdueFollowUpsCount === 1 ? '' : 's'} slipped past due`;
    out.push({
      clause,
      offer: top ? `Want me to nudge ${firstNameOf(top.name)}?` : 'Want me to draft the nudges?',
      chip: {
        label: top ? `Follow up with ${firstNameOf(top.name)}` : 'Overdue follow-ups',
        prompt: 'Show my overdue follow-ups and draft a nudge for each one.',
      },
    });
  }

  if (s.topHotPerson) {
    const name = s.topHotPerson.name;
    out.push({
      clause: `${name} is running hot and hasn't heard from you`,
      offer: `Want me to reach out to ${firstNameOf(name)}?`,
      chip: {
        label: `Reach out to ${firstNameOf(name)}`,
        prompt: `Catch me up on ${name} and draft a message to re-engage them.`,
      },
    });
  }

  if (s.newPeopleCount > 0) {
    const n = s.newPeopleCount;
    out.push({
      clause: `${n} new lead${n === 1 ? '' : 's'} just came in`,
      offer: 'Want me to draft a first reply to each, in your voice?',
      chip: {
        label: `${n} new lead${n === 1 ? '' : 's'}`,
        prompt: 'Show me the new leads and draft a first reply to each in my voice.',
      },
    });
  }

  if (s.stuckDealsCount > 0) {
    const top = s.topStuckDeal;
    const clause =
      top && cleanDealTitle(top.title)
        ? `the ${top.title} deal hasn't moved in ${top.daysStuck} ${top.daysStuck === 1 ? 'day' : 'days'}`
        : `${s.stuckDealsCount} deal${s.stuckDealsCount === 1 ? ' has' : 's have'} stalled`;
    out.push({
      clause,
      offer: 'Want to dig into why?',
      chip: {
        label: 'Stuck deals',
        prompt: 'Which of my deals are stuck, and what should I do about each?',
      },
    });
  }

  return out;
}

function hasAnything(s: MorningResponse): boolean {
  return buildSignals(s).length > 0;
}

const COLD_START: ChippiOpener = {
  line: "I'm set up and ready to work. Add your first lead or import your book, and I'll start working it with you.",
  chips: [
    { label: 'Add a lead', prompt: 'Add a new lead for me.' },
    { label: 'What can you do?', prompt: 'What can you do for me? Give me a few concrete examples.' },
  ],
  coldStart: true,
};

const ALL_CLEAR: ChippiOpener = {
  line: "You're all caught up, nothing needs you right now. Want to get ahead on something?",
  chips: [
    { label: 'Plan my week', prompt: 'Look at my pipeline and tell me what to focus on this week.' },
    { label: 'Show my pipeline', prompt: 'Give me a quick read on my pipeline right now.' },
  ],
  coldStart: false,
};

/**
 * Compose Chippi's opening line + offers from the morning signal.
 *
 * @param s        the morning summary (counts + named subjects)
 * @param opts.fresh  true when the workspace is empty/just-created — picks the
 *                    cold-start copy instead of "all caught up".
 */
export function composeChippiOpener(
  s: MorningResponse,
  opts: { fresh?: boolean } = {},
): ChippiOpener {
  const signals = buildSignals(s);

  if (signals.length === 0) {
    return opts.fresh ? COLD_START : ALL_CLEAR;
  }

  const picked = signals.slice(0, 2);
  const body =
    picked.length === 1
      ? `${cap(picked[0].clause)}.`
      : `${cap(picked[0].clause)}, and ${picked[1].clause}.`;

  return {
    line: `${body} ${picked[0].offer}`,
    chips: signals.slice(0, 3).map((sig) => sig.chip),
    coldStart: false,
  };
}

export { hasAnything as morningHasSignal };
