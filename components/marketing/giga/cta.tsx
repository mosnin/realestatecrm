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
import { HOME_DICTS } from '@/lib/i18n/dictionaries/home';
import type { Lang } from '@/lib/i18n/markets';

const MONO = { fontFamily: 'var(--font-mono)' } as const;
const reveal = {
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
};

export function CtaSection({ lang = 'en' }: { lang?: Lang }) {
  const t = HOME_DICTS[lang].closing;
  return (
    <section className="relative overflow-hidden px-5 py-24 sm:px-8 sm:py-28">
      {/* Brand bloom (adapted from pixel-perfect gradient-glow-fade: behind
          content, brand hues, both themes) — a soft radial lift under the
          closing ask so the page ends warm instead of flat. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 [background:radial-gradient(90%_70%_at_50%_110%,rgba(255,122,69,0.12),transparent_65%)] dark:[background:radial-gradient(90%_70%_at_50%_110%,rgba(255,122,69,0.10),transparent_65%)]"
      />
      <div className="mx-auto grid w-full max-w-6xl items-start gap-10 lg:grid-cols-[1.15fr_0.85fr]">
        <motion.div {...reveal} transition={{ duration: 0.7, ease: EASE_OUT }}>
          <span
            style={MONO}
            className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-neutral-500 dark:text-white/55"
          >
            <span className="inline-block size-1.5 rounded-full bg-[#ff7a45]" />
            {t.eyebrow}
          </span>
          <h2 className="mt-5 text-[clamp(2rem,4vw,3.5rem)] leading-[1.04] tracking-[-0.02em] text-neutral-900 dark:text-white">
            {t.headline}
            <span className="block text-neutral-500 dark:text-white/55">{t.subheadline}</span>
          </h2>
        </motion.div>

        <motion.div {...reveal} transition={{ duration: 0.7, ease: EASE_OUT, delay: 0.1 }} className="lg:pt-3">
          <p className="max-w-sm text-[13.5px] leading-relaxed text-neutral-600 dark:text-white/55">
            {t.body}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/sign-up"
              className="inline-flex h-11 items-center gap-2 rounded-full bg-neutral-900 px-6 text-[14px] font-medium text-white transition-all duration-200 hover:bg-neutral-800 active:scale-[0.98] dark:bg-white dark:text-black dark:hover:bg-white/90"
            >
              {t.start}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/demo"
              className="inline-flex h-11 items-center rounded-full border border-black/15 px-6 text-[14px] font-medium text-neutral-800 transition-colors hover:border-black/30 dark:border-white/20 dark:text-white dark:hover:border-white/40"
            >
              {t.demo}
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
