'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';
import type { MorningResponse, MorningSummary } from '@/app/api/agent/morning/route';
import { composeMorningStory } from '@/lib/morning-story';
import { buildMorningActions, type MorningAction } from './morning-actions';
import { MorningActionSheet } from './morning-action-sheet';

interface Props {
  /** Workspace slug — needed to deep-link the inline actions. */
  slug: string;
}

/**
 * The /chippi home's one sentence. Phase 5 made it expand into an action
 * panel; Phase 7 made the panel actually do work — compose actions now
 * draft, preview, and send inline. The realtor never leaves the home.
 */
export function MorningStory({ slug }: Props) {
  const [summary, setSummary] = useState<MorningSummary | null>(null);
  const [agentSentence, setAgentSentence] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  /** Which compose action is currently expanded into a draft sheet. */
  const [activeCompose, setActiveCompose] = useState<MorningAction | null>(null);
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
  // While the action sheet is firing a send, we ignore outside taps so a
  // stray click can't dismiss the panel mid-send.
  useEffect(() => {
    if (!open) return;
    function handlePointer(e: MouseEvent | TouchEvent) {
      if (!containerRef.current) return;
      const target = e.target as Node | null;
      if (target && !containerRef.current.contains(target)) {
        setOpen(false);
        setActiveCompose(null);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        setActiveCompose(null);
      }
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

  function handleActionTap(a: MorningAction) {
    if (a.kind === 'compose') {
      setActiveCompose(a);
    }
    // 'navigate' actions are <Link>s and self-close via onClick below.
  }

  function handleSent() {
    // Roll the home back to the un-expanded sentence on success.
    setActiveCompose(null);
    setOpen(false);
  }

  function handleCancel() {
    setActiveCompose(null);
  }

  return (
    <div ref={containerRef} className="relative">
      {isInteractive ? (
        <motion.button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            setActiveCompose(null);
          }}
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
            {activeCompose && activeCompose.kind === 'compose' ? (
              <MorningActionSheet
                slug={slug}
                intent={activeCompose.intent}
                context={activeCompose.context}
                onSent={handleSent}
                onCancel={handleCancel}
              />
            ) : (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {actions.map((a) =>
                  a.kind === 'navigate' ? (
                    <Link
                      key={a.id}
                      href={a.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        'inline-flex items-center h-9 rounded-full px-4 text-sm transition-colors',
                        'border border-border/70 bg-background text-foreground hover:bg-muted/40',
                      )}
                    >
                      {a.label}
                    </Link>
                  ) : (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => handleActionTap(a)}
                      className={cn(
                        'inline-flex items-center h-9 rounded-full px-4 text-sm transition-colors',
                        'border border-border/70 bg-foreground text-background hover:bg-foreground/90',
                      )}
                    >
                      {a.label}
                    </button>
                  ),
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
