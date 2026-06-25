'use client';

/**
 * ChippiOpener — Chippi's proactive first move on the empty /chippi hero.
 *
 * Chippi reads the realtor's morning (the existing `/api/agent/morning`
 * summary) and SPEAKS FIRST, in her own first-person voice: what she's already
 * done ("I drafted 3 replies in your voice"), who's gone quiet, and an offer.
 * Up to three tappable moves fire a real chat turn.
 *
 * Presence over a pop-in: the greeting headline above renders instantly, so
 * frame one already has Chippi's voice on screen; this line + chips arrive a
 * beat later, which reads like Chippi just looked at the morning rather than a
 * UI element loading in. Best-effort: if the fetch fails it shows nothing and
 * the composer stays the focal element.
 *
 * The line copy is composed deterministically (lib/chippi-opener.ts) and
 * unit-tested for first-person voice, so it's verified, not hoped for.
 */

import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { composeChippiOpener, type ChippiOpener as Opener } from '@/lib/chippi-opener';
import type { MorningResponse } from '@/app/api/agent/morning/route';

const EASE = [0.22, 1, 0.36, 1] as const;

export function ChippiOpener({
  onAction,
}: {
  /** Fires the chip's prompt as a chat message (Chippi starts working). */
  onAction: (prompt: string) => void;
}) {
  const [opener, setOpener] = useState<Opener | null>(null);
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
        if (!cancelled) setOpener(composeChippiOpener(summary));
      } catch {
        // Never block the surface on the opener.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!opener) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE, delay: 0.05 }}
      className="mx-auto mb-7 sm:mb-9 max-w-xl text-center"
    >
      {/* Chippi present, not greyed: this is her speaking, so it reads at
          foreground weight, continuing the greeting headline above. */}
      <p className="text-[17px] leading-relaxed text-foreground/90">{opener.line}</p>
      {opener.chips.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {opener.chips.map((chip) => (
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
