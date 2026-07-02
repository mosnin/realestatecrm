'use client';

/**
 * CtaSection, light/dark-adaptive closing CTA ("Ready to see Chippi in
 * action?"), reference-matched: contained width, serif headline on the left, a
 * muted paragraph on the right with the "Talk to us" pill directly below it.
 */

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { EASE_OUT } from '@/lib/motion';
import { TextFlip } from '@/components/ui/text-flip';

const MONO = { fontFamily: 'var(--font-mono)' } as const;
const reveal = {
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
};

export function CtaSection() {
  return (
    <section className="px-5 py-24 sm:px-8 sm:py-28">
      <div className="mx-auto grid w-full max-w-6xl items-start gap-10 lg:grid-cols-[1.15fr_0.85fr]">
        <motion.div {...reveal} transition={{ duration: 0.7, ease: EASE_OUT }}>
          <span
            style={MONO}
            className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-neutral-500 dark:text-white/55"
          >
            <span className="inline-block size-1.5 rounded-full bg-[#ff7a45]" />
            Get a demo
          </span>
          <h2 className="mt-5 text-[clamp(2rem,4vw,3.5rem)] leading-[1.04] tracking-[-0.02em] text-neutral-900 dark:text-white">
            Ready to see Chippi
            {/* The second line flips through what "action" actually means.
                Left-aligned headline, punctuation inside each item — no
                trailing-character jitter as widths change. */}
            <TextFlip as={motion.span} interval={2.8} className="block">
              <>in action?</>
              <>draft in your voice?</>
              <>book the tour?</>
              <>work your whole book?</>
            </TextFlip>
          </h2>
        </motion.div>

        <motion.div {...reveal} transition={{ duration: 0.7, ease: EASE_OUT, delay: 0.1 }} className="lg:pt-3">
          <p className="max-w-sm text-[13.5px] leading-relaxed text-neutral-600 dark:text-white/55">
            Chippi works your whole book, reading leads, drafting in your voice, booking tours, and
            clearing the busywork, with every send approved by you.
          </p>
          <Link
            href="/demo"
            className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-neutral-900 px-6 text-[14px] font-medium text-white transition-all duration-200 hover:bg-neutral-800 active:scale-[0.98] dark:bg-white dark:text-black dark:hover:bg-white/90"
          >
            Talk to us
            <ArrowRight className="h-4 w-4" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
