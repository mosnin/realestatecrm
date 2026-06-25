'use client';

/**
 * ChippiOpener — Chippi's proactive first move on the empty /chippi hero.
 *
 * The audit: the empty workspace greeted the realtor and then waited with a
 * blank box — indistinguishable from any chatbot. A teammate doesn't do that.
 * This makes Chippi SPEAK FIRST: it reads the realtor's morning (the same
 * `/api/agent/morning` summary the home brief uses) and opens with one line
 * about what actually needs them, plus 2-3 tappable moves that fire a real
 * chat turn. The composer stays the focal element; this is one quiet line
 * above it, not a competing dashboard.
 *
 * Voice reuse: the opening line comes from `composeMorningStory` (the existing
 * brand-voice ladder + the agent's composed sentence), so it names a subject
 * ("Priya's follow-up is 3 days overdue") instead of a count. The chips are
 * Chippi's offers; tapping one sends the prompt and Chippi starts working.
 *
 * Best-effort and non-blocking: it fetches after mount, renders nothing until
 * it has something to say, and degrades to a warm cold-start for a brand-new
 * (empty) workspace.
 */

import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { composeMorningStory } from '@/lib/morning-story';
import type { MorningResponse } from '@/app/api/agent/morning/route';

interface OpenerChip {
  label: string;
  /** The exact message sent when the chip is tapped. */
  prompt: string;
}

function firstNameOf(name: string): string {
  return (name || '').trim().split(/\s+/)[0] || name;
}

/** Does the morning have anything worth surfacing? */
function hasWork(s: MorningResponse): boolean {
  return (
    s.newPeopleCount > 0 ||
    s.overdueFollowUpsCount > 0 ||
    s.stuckDealsCount > 0 ||
    s.draftsCount > 0 ||
    s.hotPeopleCount > 0 ||
    Boolean(s.topHotPerson || s.topOverdueFollowUp || s.topStuckDeal || s.topNewPerson)
  );
}

/** Up to three offers, ordered by what's most worth the realtor's attention. */
function buildChips(s: MorningResponse): OpenerChip[] {
  const chips: OpenerChip[] = [];
  if (s.draftsCount > 0) {
    chips.push({
      label: `Review ${s.draftsCount} draft${s.draftsCount === 1 ? '' : 's'}`,
      prompt: 'Show me the drafts that are ready and walk me through them.',
    });
  }
  if (s.overdueFollowUpsCount > 0) {
    chips.push({
      label:
        s.topOverdueFollowUp
          ? `Follow up with ${firstNameOf(s.topOverdueFollowUp.name)}`
          : 'Overdue follow-ups',
      prompt: 'Show my overdue follow-ups and draft a nudge for each one.',
    });
  }
  if (s.topHotPerson) {
    chips.push({
      label: `Reach out to ${firstNameOf(s.topHotPerson.name)}`,
      prompt: `Catch me up on ${s.topHotPerson.name} and draft a message to re-engage them.`,
    });
  }
  if (s.newPeopleCount > 0) {
    chips.push({
      label: `${s.newPeopleCount} new lead${s.newPeopleCount === 1 ? '' : 's'}`,
      prompt: 'Show me the new leads and draft a first reply to each in my voice.',
    });
  }
  if (s.stuckDealsCount > 0) {
    chips.push({
      label: 'Stuck deals',
      prompt: 'Which of my deals are stuck, and what should I do about each?',
    });
  }
  return chips.slice(0, 3);
}

const COLD_START_LINE =
  "I'm set up and ready. Add your first lead or import your book, and I'll start working it with you.";
const COLD_START_CHIPS: OpenerChip[] = [
  { label: 'Add a lead', prompt: 'Add a new lead for me.' },
  { label: 'What can you do?', prompt: 'What can you do for me? Give me a few concrete examples.' },
];

const EASE = [0.22, 1, 0.36, 1] as const;

export function ChippiOpener({
  onAction,
}: {
  /** Fires the chip's prompt as a chat message (Chippi starts working). */
  onAction: (prompt: string) => void;
}) {
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'ready'; line: string; chips: OpenerChip[] }
    | { kind: 'hidden' }
  >({ kind: 'loading' });
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/agent/morning', { cache: 'no-store' });
        if (!res.ok) throw new Error('morning');
        const summary = (await res.json()) as MorningResponse;
        if (cancelled) return;

        if (hasWork(summary)) {
          const { text } = composeMorningStory(summary, summary.composedSentence);
          setState({ kind: 'ready', line: text, chips: buildChips(summary) });
        } else {
          setState({ kind: 'ready', line: COLD_START_LINE, chips: COLD_START_CHIPS });
        }
      } catch {
        // Never block the surface on the opener — just don't show it.
        if (!cancelled) setState({ kind: 'hidden' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind !== 'ready') return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE, delay: 0.1 }}
      className="mb-6 sm:mb-8 mx-auto max-w-xl text-center"
    >
      <p className="text-[15px] leading-relaxed text-muted-foreground">{state.line}</p>
      {state.chips.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {state.chips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => onAction(chip.prompt)}
              className="inline-flex items-center rounded-full border border-border/70 bg-background px-3.5 py-1.5 text-[13px] font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
}
