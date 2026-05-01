'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';
import type { MorningSummary } from '@/app/api/agent/morning/route';
import { composeMorningStory } from '@/lib/morning-story';

interface Props {
  /** Workspace slug — needed to deep-link "Start with X." */
  slug: string;
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
export function MorningStory({ slug }: Props) {
  const router = useRouter();
  const [summary, setSummary] = useState<MorningSummary | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch('/api/agent/morning', { signal: controller.signal });
        if (res.ok) setSummary(await res.json());
      } catch {
        // non-critical — we render nothing rather than a marketing line
      }
    })();
    return () => controller.abort();
  }, []);

  // While loading we render a non-breaking space so the layout doesn't
  // jump but no placeholder copy. The previous fallback ("I keep your day
  // moving so you don't have to.") was positioning copy in a status slot —
  // the realtor knows it's loading; we don't fill the void with a tagline.
  if (!summary) {
    return <p className="text-sm text-muted-foreground text-center">&nbsp;</p>;
  }

  const story = composeMorningStory(summary);

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
      animate={{ opacity: 1 }}
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
