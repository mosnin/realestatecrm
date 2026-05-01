'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';
import type { MorningResponse, MorningSummary } from '@/app/api/agent/morning/route';
import { composeMorningStory } from '@/lib/morning-story';
import { buildMorningActions } from './morning-actions';

interface Props {
  /** Workspace slug — needed to deep-link the inline actions. */
  slug: string;
}

/**
 * The /chippi home's one sentence. It used to be a teleporter — tap and
 * leave the home. Now it opens *into work*: the sentence stays put and an
 * inline action panel slides down with 2-3 contextual verbs. The realtor
 * acts on the morning without ever leaving the surface.
 *
 * Default-state rendering matches what shipped before: no expansion, no
 * extra chrome. If the realtor never taps, nothing changes.
 */
export function MorningStory({ slug }: Props) {
  const [summary, setSummary] = useState<MorningSummary | null>(null);
  const [agentSentence, setAgentSentence] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch('/api/agent/morning', { signal: controller.signal });
        if (res.ok) {
          const data = (await res.json()) as MorningResponse;
          setSummary(data);
          setAgentSentence(data.composedSentence ?? null);
        }
      } catch {
        // non-critical — we render nothing rather than a marketing line
      }
    })();
    return () => controller.abort();
  }, []);

  // Collapse on outside click + escape. Both matter on desktop; on mobile
  // tapping outside (e.g. on TodayFeed) is the natural close gesture too.
  useEffect(() => {
    if (!open) return;
    function handlePointer(e: MouseEvent | TouchEvent) {
      if (!containerRef.current) return;
      const target = e.target as Node | null;
      if (target && !containerRef.current.contains(target)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('touchstart', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('touchstart', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  // While loading we render a non-breaking space so the layout doesn't
  // jump but no placeholder copy.
  if (!summary) {
    return (
      <h1
        className="text-[2.25rem] sm:text-[2.5rem] tracking-tight text-foreground leading-tight text-center"
        style={{ fontFamily: 'var(--font-title)' }}
      >
        &nbsp;
      </h1>
    );
  }

  const story = composeMorningStory(summary, agentSentence);
  const actions = buildMorningActions(story.doorway, summary, slug);
  const isInteractive = actions.length > 0;

  return (
    <div ref={containerRef} className="relative">
      {isInteractive ? (
        <motion.button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          key={story.text}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
          className={cn(
            'text-[2.25rem] sm:text-[2.5rem] tracking-tight leading-tight text-center block mx-auto',
            'text-foreground hover:opacity-80 transition-opacity cursor-pointer',
          )}
          style={{ fontFamily: 'var(--font-title)' }}
        >
          {story.text}
        </motion.button>
      ) : (
        <motion.h1
          key={story.text}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
          className="text-[2.25rem] sm:text-[2.5rem] tracking-tight leading-tight text-center block mx-auto text-foreground"
          style={{ fontFamily: 'var(--font-title)' }}
        >
          {story.text}
        </motion.h1>
      )}

      <AnimatePresence initial={false}>
        {open && isInteractive && (
          <motion.div
            key="actions"
            initial={{ height: 0, opacity: 0 }}
            animate={{
              height: 'auto',
              opacity: 1,
              transition: { duration: DURATION_BASE, ease: EASE_OUT },
            }}
            exit={{
              height: 0,
              opacity: 0,
              transition: { duration: DURATION_BASE, ease: EASE_OUT },
            }}
            className="overflow-hidden"
          >
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {actions.map((a) => (
                <Link
                  key={a.id}
                  href={a.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'inline-flex items-center h-9 rounded-full px-4 text-sm transition-colors',
                    'border border-border/70',
                    a.kind === 'compose'
                      ? 'bg-foreground text-background hover:bg-foreground/90'
                      : 'bg-background text-foreground hover:bg-muted/40',
                  )}
                >
                  {a.label}
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
