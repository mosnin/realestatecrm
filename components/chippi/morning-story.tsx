'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { TITLE_FONT } from '@/lib/typography';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';
import type { MorningSummary } from '@/app/api/agent/morning/route';

interface Props {
  /** Workspace slug — needed to deep-link "Start with X." */
  slug: string;
  /** Fallback line shown while the summary is fetching, or when the API
   *  fails. Lets the parent control the brand-voice hold-line so we don't
   *  flash a generic placeholder. */
  fallback: string;
}

/**
 * The /chippi home's one sentence — composed across the realtor's whole
 * desk. Replaces the old "X drafts · Y questions waiting" inventory line
 * (which only saw two of the seven things actually pressing). Now pulls
 * stuck deals, overdue follow-ups, new people, hot people, drafts, and
 * questions, then names the loudest single fact and (when there's a
 * priority person) suggests where to start.
 *
 * The sentence becomes a button when there's a doorway attached:
 * - "Start with David Chen." → opens that person's page
 * - inventory-only ("3 drafts waiting") → opens the focus card below it,
 *   which is right there on the same screen, so no navigation needed —
 *   stays a paragraph.
 *
 * Same brand-voice spine as the deals/contacts/follow-ups landing
 * narrations — the home now shares the vocabulary instead of having its
 * own utility line.
 */
export function MorningStory({ slug, fallback }: Props) {
  const router = useRouter();
  const [summary, setSummary] = useState<MorningSummary | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch('/api/agent/morning', { signal: controller.signal });
        if (res.ok) setSummary(await res.json());
      } catch {
        // non-critical — fallback line covers it
      } finally {
        setLoaded(true);
      }
    })();
    return () => controller.abort();
  }, []);

  const story = summary ? compose(summary) : { text: fallback, doorway: null };

  function handleClick() {
    if (story.doorway?.kind === 'person') {
      router.push(`/s/${slug}/contacts/${story.doorway.id}`);
    }
  }

  const isClickable = !!story.doorway;
  const Component = isClickable ? motion.button : motion.p;

  return (
    <Component
      type={isClickable ? 'button' : undefined}
      onClick={isClickable ? handleClick : undefined}
      key={story.text}
      initial={{ opacity: 0 }}
      animate={{ opacity: loaded ? 1 : 0.6 }}
      transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
      className={cn(
        'text-sm text-muted-foreground text-center mx-auto block',
        isClickable && 'hover:text-foreground transition-colors cursor-pointer',
      )}
    >
      {story.text}
    </Component>
  );
}

interface Doorway {
  kind: 'person';
  id: string;
}

interface Story {
  text: string;
  doorway: Doorway | null;
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
function compose(s: MorningSummary): Story {
  const startWith = s.topPersonName && s.topPersonId
    ? ` Start with ${s.topPersonName}.`
    : '';
  const doorway: Doorway | null = s.topPersonId
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
        extras.push(`${s.newPeopleCount} new person${s.newPeopleCount === 1 ? '' : 's'}`);
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
