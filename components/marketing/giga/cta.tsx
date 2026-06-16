'use client';

/**
 * CtaSection — light/dark-adaptive closing CTA ("Ready to see Chippi in
 * action?"). Sits between the research block and the gradient/footer.
 */

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { EASE_OUT } from '@/lib/motion';

const MONO = { fontFamily: 'var(--font-mono)' } as const;
const reveal = {
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
};

export function CtaSection() {
  return (
    <section className="px-5 pb-24 pt-4 sm:px-8 sm:pb-32 lg:px-10">
      <div className="mx-auto grid w-full max-w-[1728px] items-end gap-10 lg:grid-cols-[1.2fr_1fr]">
        <motion.div {...reveal} transition={{ duration: 0.7, ease: EASE_OUT }}>
          <span
            style={MONO}
            className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-neutral-500 dark:text-white/55"
          >
            <span className="inline-block size-1.5 rounded-full bg-[#ff7a45]" />
            Get a demo
          </span>
          <h2 className="mt-5 text-[clamp(2.25rem,4.6vw,4rem)] leading-[1.02] tracking-[-0.02em] text-neutral-900 dark:text-white">
            Ready to see Chippi
            <br className="hidden sm:block" /> in action?
          </h2>
        </motion.div>

        <motion.div
          {...reveal}
          transition={{ duration: 0.7, ease: EASE_OUT, delay: 0.1 }}
          className="flex flex-col gap-6 lg:items-end lg:text-right"
        >
          <p className="max-w-sm text-[14.5px] leading-relaxed text-neutral-600 dark:text-white/55">
            Chippi works your whole book — reading leads, drafting in your voice, booking tours, and
            clearing the busywork — with every send approved by you.
          </p>
          <Link
            href="/demo"
            className="inline-flex h-12 items-center gap-2 self-start rounded-full bg-neutral-900 px-6 text-[14px] font-medium text-white transition-all duration-200 hover:bg-neutral-800 active:scale-[0.98] lg:self-end dark:bg-white dark:text-black dark:hover:bg-white/90"
          >
            Talk to us
            <ArrowRight className="h-4 w-4" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
